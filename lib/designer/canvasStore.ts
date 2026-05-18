'use client';

import { create } from 'zustand';
import { Point } from 'fabric';
import type { Canvas, FabricObject } from 'fabric';
import { v4 as uuidv4 } from 'uuid';

import type {
  BatchUpdateData,
  CanvasSize,
  DesignDoc,
  DesignStatus,
  DesignerSurface,
  ExportedDesignData,
  LayerData,
  LayerSelection,
} from './types';

interface CanvasHistory {
  id: string;
  action: 'add' | 'remove' | 'modify' | 'move' | 'clear' | 'batch';
  surface: string;
  timestamp: Date;
  layerId?: string;
  beforeState?: LayerData | LayerData[] | null;
  afterState?: LayerData | LayerData[] | null;
}

export interface CanvasStoreState {
  // Fabric instance
  canvas: Canvas | null;
  setCanvas: (canvas: Canvas | null) => void;

  // Design metadata
  designId: string | null;
  designName: string;
  productId: number | null;
  status: DesignStatus;
  canvasSize: CanvasSize;
  setDesign: (designId: string | null, name: string, productId: number) => void;
  setDesignName: (name: string) => void;
  setStatus: (status: DesignStatus) => void;

  // Surfaces (the configurable canvas surfaces for the product)
  surfaces: DesignerSurface[];
  setSurfaces: (surfaces: DesignerSurface[]) => void;
  activeSurface: string;
  setActiveSurface: (slug: string) => void;

  // Per-surface layer storage
  layersBySurface: Record<string, LayerData[]>;
  /** Current surface's layers (computed). */
  layers: LayerData[];
  getCurrentSurfaceLayers: () => LayerData[];

  // Layer CRUD
  addLayer: (
    layer: Omit<LayerData, 'id' | 'createdAt' | 'updatedAt' | 'zIndex'> &
      Partial<Pick<LayerData, 'id'>>
  ) => string;
  updateLayer: (layerId: string, updates: Partial<LayerData>) => void;
  removeLayer: (layerId: string) => void;
  duplicateLayer: (layerId: string) => string | null;
  reorderLayers: (orderedIds: string[]) => void;
  reorderLayer: (layerId: string, directionOrIndex: 'up' | 'down' | number) => void;
  clearLayers: () => void;

  /**
   * Copy every layer from the active surface to the given target surface
   * (or to *every* other surface when targetSlug is omitted). Layers get
   * fresh ids so subsequent edits don't fan out across surfaces. Replaces
   * any existing layers on the target.
   */
  mirrorActiveSurfaceTo: (targetSlug?: string) => void;

  /**
   * Hex color the mockup background image is tinted with — simulates the
   * customer picking a different shirt color (white / black / red / navy).
   * `null` means no tint (use the mockup image as-is). DesignCanvas reacts
   * to this and applies a Fabric BlendColor filter to the background.
   */
  mockupTint: string | null;
  setMockupTint: (hex: string | null) => void;

  /** When true, DesignCanvas draws a faint 25 px alignment grid. */
  showGrid: boolean;
  toggleGrid: () => void;

  // Selection
  selectedLayers: FabricObject[];
  activeLayerId: string | null;
  layerSelection: LayerSelection;
  setSelectedLayers: (objects: FabricObject[]) => void;
  setActiveLayer: (layerId: string | null) => void;
  selectMultipleLayers: (layerIds: string[]) => void;
  toggleLayerSelection: (layerId: string) => void;
  selectAllLayers: () => void;
  deselectAllLayers: () => void;
  getSelectedLayerIds: () => string[];
  isLayerSelected: (layerId: string) => boolean;

  // Batch edit
  batchUpdateLayers: (updates: BatchUpdateData) => void;
  canBatchEdit: () => boolean;
  getBatchEditableProperties: () => Array<'opacity' | 'visible' | 'locked' | 'color'>;
  deleteSelectedLayers: () => void;

  // Visibility / lock
  setLayerVisible: (layerId: string, visible: boolean) => void;
  setLayerLocked: (layerId: string, locked: boolean) => void;
  toggleLayerVisibility: (layerId: string) => void;
  toggleLayerLock: (layerId: string) => void;

  // Print-area overlay visibility
  showPrintArea: boolean;
  setShowPrintArea: (visible: boolean) => void;
  togglePrintArea: () => void;

  // Pan / zoom
  zoom: number;
  panX: number;
  panY: number;
  hasManuallyPanned: boolean;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  resetView: () => void;
  zoomIn: (step?: number) => void;
  zoomOut: (step?: number) => void;
  zoomToFit: () => void;
  panUp: (distance?: number) => void;
  panDown: (distance?: number) => void;
  panLeft: (distance?: number) => void;
  panRight: (distance?: number) => void;

  // History
  history: CanvasHistory[];
  historyIndex: number;
  maxHistorySize: number;
  pushHistory: (entry: Omit<CanvasHistory, 'id' | 'timestamp' | 'surface'>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;

  // Clipboard
  clipboardLayers: LayerData[];
  copySelectedLayers: () => void;
  pasteLayersFromClipboard: () => void;

  // Dirty / save tracking
  isDirty: boolean;
  lastSaved: Date | null;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  markDirty: () => void;
  markSaved: () => void;

  // Import / export
  exportCanvasData: () => ExportedDesignData;
  importCanvasData: (data: ExportedDesignData | DesignDoc) => void;
  loadDesign: (doc: DesignDoc) => void;
}

const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 800, height: 600, dpi: 72 };
const INITIAL_ZOOM = 0.64;

const emptySelection = (): LayerSelection => ({
  selectedLayerIds: [],
  selectionMode: 'single',
  lastSelectedId: null,
  canBatchEdit: false,
  batchEditableProperties: [],
});

/** Helper: get a layer (across all surfaces) by id. */
function findLayerAcrossSurfaces(
  layersBySurface: Record<string, LayerData[]>,
  id: string
): { surface: string; layer: LayerData } | null {
  for (const [surface, layers] of Object.entries(layersBySurface)) {
    const layer = layers.find((l) => l.id === id);
    if (layer) return { surface, layer };
  }
  return null;
}

export const useCanvasStore = create<CanvasStoreState>((set, get) => ({
  canvas: null,
  setCanvas: (canvas) => set({ canvas }),

  designId: null,
  designName: 'Untitled Design',
  productId: null,
  status: 'draft',
  canvasSize: DEFAULT_CANVAS_SIZE,
  setDesign: (designId, name, productId) =>
    set({ designId, designName: name, productId, isDirty: true }),
  setDesignName: (name) => set({ designName: name, isDirty: true }),
  setStatus: (status) => set({ status }),

  surfaces: [],
  setSurfaces: (surfaces) => {
    const sorted = [...surfaces].sort((a, b) => a.displayOrder - b.displayOrder);
    set((state) => {
      // Seed layersBySurface with empty arrays for any missing slug.
      const layersBySurface = { ...state.layersBySurface };
      for (const s of sorted) {
        if (!layersBySurface[s.slug]) layersBySurface[s.slug] = [];
      }
      const active = state.activeSurface || sorted[0]?.slug || '';
      return {
        surfaces: sorted,
        layersBySurface,
        activeSurface: active,
        layers: layersBySurface[active] || [],
      };
    });
  },
  activeSurface: '',
  setActiveSurface: (slug) => {
    const state = get();
    if (!state.layersBySurface[slug]) {
      // Lazily create an empty layer list for unseen surfaces.
      set({
        layersBySurface: { ...state.layersBySurface, [slug]: [] },
        activeSurface: slug,
        layers: [],
      });
      return;
    }
    set({ activeSurface: slug, layers: state.layersBySurface[slug] });
  },

  layersBySurface: {},
  layers: [],
  getCurrentSurfaceLayers: () => {
    const state = get();
    return state.layersBySurface[state.activeSurface] || [];
  },

  addLayer: (layerInput) => {
    const id = layerInput.id || uuidv4();
    const now = new Date();
    const state = get();
    const currentSurface = state.activeSurface;
    if (!currentSurface) return id;
    const currentLayers = state.layersBySurface[currentSurface] || [];

    const nextZ = currentLayers.length
      ? Math.max(...currentLayers.map((l) => l.zIndex)) + 1
      : 0;

    const layer: LayerData = {
      id,
      type: layerInput.type,
      name: layerInput.name || `${layerInput.type} Layer`,
      visible: layerInput.visible ?? true,
      locked: layerInput.locked ?? false,
      opacity: layerInput.opacity ?? 1,
      left: layerInput.left ?? 0,
      top: layerInput.top ?? 0,
      width: layerInput.width,
      height: layerInput.height,
      scaleX: layerInput.scaleX ?? 1,
      scaleY: layerInput.scaleY ?? 1,
      angle: layerInput.angle ?? 0,
      data: layerInput.data ?? {},
      zIndex: nextZ,
      createdAt: now,
      updatedAt: now,
    };

    const updated = {
      ...state.layersBySurface,
      [currentSurface]: [...currentLayers, layer],
    };

    set({
      layersBySurface: updated,
      layers: updated[currentSurface],
      activeLayerId: id,
      isDirty: true,
    });

    get().pushHistory({ action: 'add', layerId: id, afterState: layer });
    return id;
  },

  updateLayer: (layerId, updates) => {
    const state = get();
    const currentSurface = state.activeSurface;
    if (!currentSurface) return;
    const layers = state.layersBySurface[currentSurface] || [];
    const idx = layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return;

    const old = layers[idx];
    const next: LayerData = {
      ...old,
      ...updates,
      updatedAt: new Date(),
    };
    const newLayers = [...layers];
    newLayers[idx] = next;

    const updated = { ...state.layersBySurface, [currentSurface]: newLayers };
    set({ layersBySurface: updated, layers: newLayers, isDirty: true });

    get().pushHistory({
      action: 'modify',
      layerId,
      beforeState: old,
      afterState: next,
    });
  },

  removeLayer: (layerId) => {
    const state = get();
    const currentSurface = state.activeSurface;
    if (!currentSurface) return;
    const layers = state.layersBySurface[currentSurface] || [];
    const target = layers.find((l) => l.id === layerId);
    if (!target) return;

    const canvas = state.canvas;
    if (canvas) {
      const obj = canvas
        .getObjects()
        .find((o) => ((o as unknown as { data?: { id?: string } }).data?.id ||
          (o as unknown as { id?: string }).id) === layerId);
      if (obj) {
        canvas.remove(obj);
        canvas.renderAll();
      }
    }

    const newLayers = layers.filter((l) => l.id !== layerId);
    const updated = { ...state.layersBySurface, [currentSurface]: newLayers };
    set({
      layersBySurface: updated,
      layers: newLayers,
      activeLayerId: state.activeLayerId === layerId ? null : state.activeLayerId,
      isDirty: true,
    });

    get().pushHistory({ action: 'remove', layerId, beforeState: target });
  },

  duplicateLayer: (layerId) => {
    const state = get();
    const currentSurface = state.activeSurface;
    if (!currentSurface) return null;
    const layers = state.layersBySurface[currentSurface] || [];
    const orig = layers.find((l) => l.id === layerId);
    if (!orig) return null;

    const newId = uuidv4();
    const copy: LayerData = {
      ...orig,
      id: newId,
      name: `${orig.name} Copy`,
      left: orig.left + 20,
      top: orig.top + 20,
      zIndex: layers.length
        ? Math.max(...layers.map((l) => l.zIndex)) + 1
        : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updated = {
      ...state.layersBySurface,
      [currentSurface]: [...layers, copy],
    };
    set({
      layersBySurface: updated,
      layers: updated[currentSurface],
      activeLayerId: newId,
      isDirty: true,
    });
    get().pushHistory({ action: 'add', layerId: newId, afterState: copy });
    return newId;
  },

  reorderLayers: (orderedIds) => {
    const state = get();
    const currentSurface = state.activeSurface;
    if (!currentSurface) return;
    const layers = state.layersBySurface[currentSurface] || [];
    const byId = new Map(layers.map((l) => [l.id, l] as const));

    const newLayers: LayerData[] = orderedIds
      .map((id, idx) => {
        const l = byId.get(id);
        if (!l) return null;
        const zIndex = orderedIds.length - 1 - idx;
        return { ...l, zIndex, updatedAt: new Date() };
      })
      .filter((l): l is LayerData => l !== null);

    // Append any layers not in orderedIds at the bottom (shouldn't normally happen).
    for (const l of layers) {
      if (!orderedIds.includes(l.id)) newLayers.push(l);
    }

    const updated = { ...state.layersBySurface, [currentSurface]: newLayers };
    set({ layersBySurface: updated, layers: newLayers, isDirty: true });

    // Sync the underlying fabric stack order.
    const canvas = state.canvas;
    if (canvas) {
      const objects = canvas.getObjects();
      const sorted = objects
        .map((obj) => {
          const id =
            (obj as unknown as { data?: { id?: string } }).data?.id ||
            (obj as unknown as { id?: string }).id;
          const layer = newLayers.find((l) => l.id === id);
          return { obj, zIndex: layer?.zIndex ?? -1 };
        })
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((x) => x.obj);
      sorted.forEach((obj, i) => {
        canvas.moveObjectTo(obj, i);
      });
      canvas.renderAll();
    }
  },

  reorderLayer: (layerId, directionOrIndex) => {
    const state = get();
    const currentSurface = state.activeSurface;
    if (!currentSurface) return;
    const layers = state.layersBySurface[currentSurface] || [];
    const sorted = [...layers].sort((a, b) => b.zIndex - a.zIndex);
    const idx = sorted.findIndex((l) => l.id === layerId);
    if (idx === -1) return;

    let target: number;
    if (directionOrIndex === 'up') target = idx - 1;
    else if (directionOrIndex === 'down') target = idx + 1;
    else if (typeof directionOrIndex === 'number') target = directionOrIndex;
    else return;
    if (target < 0 || target >= sorted.length || target === idx) return;

    const next = [...sorted];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);

    get().reorderLayers(next.map((l) => l.id));
  },

  clearLayers: () => {
    const state = get();
    const currentSurface = state.activeSurface;
    if (!currentSurface) return;
    const canvas = state.canvas;
    if (canvas) {
      // Only remove customer-added objects. canvas.clear() also wipes the
      // mockup background image and the print-area overlay, which makes the
      // empty surface look broken; iterate and skip anything tagged as
      // non-user content (BACKGROUND_ID, _designerPrintArea, snap guides).
      const toRemove = canvas.getObjects().filter((obj) => {
        const tagged = obj as unknown as {
          id?: string;
          data?: { id?: string };
          _designerPrintArea?: boolean;
          _designerGuide?: boolean;
          excludeFromExport?: boolean;
        };
        if (tagged._designerPrintArea) return false;
        if (tagged._designerGuide) return false;
        if (tagged.excludeFromExport) return false;
        if (tagged.id === 'designer-canvas-background') return false;
        return Boolean(tagged.data?.id);
      });
      toRemove.forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
    const updated = { ...state.layersBySurface, [currentSurface]: [] };
    set({
      layersBySurface: updated,
      layers: [],
      selectedLayers: [],
      activeLayerId: null,
      layerSelection: emptySelection(),
      isDirty: true,
    });
    get().pushHistory({ action: 'clear' });
  },

  mirrorActiveSurfaceTo: (targetSlug) => {
    const state = get();
    const currentSurface = state.activeSurface;
    if (!currentSurface) return;
    const sourceLayers = state.layersBySurface[currentSurface] || [];
    if (sourceLayers.length === 0) return;

    // Resolve targets: explicit single, or every other configured surface.
    const targets: string[] = targetSlug
      ? [targetSlug]
      : state.surfaces
          .map((s) => s.slug)
          .filter((slug) => slug && slug !== currentSurface);
    if (targets.length === 0) return;

    const cloneLayer = (layer: LayerData): LayerData => ({
      ...layer,
      id: uuidv4(),
      // Deep-clone data so mutating the original doesn't bleed into the copy.
      data: JSON.parse(JSON.stringify(layer.data ?? {})),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const updated = { ...state.layersBySurface };
    for (const slug of targets) {
      updated[slug] = sourceLayers.map(cloneLayer);
    }

    set({
      layersBySurface: updated,
      layers: updated[currentSurface] || [],
      isDirty: true,
    });
    // The history entry's surface is auto-stamped by pushHistory.
    get().pushHistory({ action: 'batch' });
  },

  // Selection
  selectedLayers: [],
  activeLayerId: null,
  layerSelection: emptySelection(),

  setSelectedLayers: (objects) => {
    const ids = objects
      .map(
        (o) =>
          (o as unknown as { data?: { id?: string } }).data?.id ||
          (o as unknown as { id?: string }).id
      )
      .filter((id): id is string => Boolean(id));

    const layers = get().layers;
    const matched = layers.filter((l) => ids.includes(l.id));
    const canBatchEdit = ids.length > 1 && matched.every((l) => !l.locked);

    const batchEditableProperties: Array<
      'opacity' | 'visible' | 'locked' | 'color'
    > = [];
    if (ids.length > 1) {
      batchEditableProperties.push('opacity', 'visible', 'locked');
      if (matched.every((l) => l.type === 'text' || l.type === 'icon')) {
        batchEditableProperties.push('color');
      }
    }

    set({
      selectedLayers: objects,
      layerSelection: {
        selectedLayerIds: ids,
        selectionMode: ids.length > 1 ? 'multiple' : 'single',
        lastSelectedId: ids[ids.length - 1] || null,
        canBatchEdit,
        batchEditableProperties,
      },
      activeLayerId: ids.length === 1 ? ids[0] : null,
    });
  },

  setActiveLayer: (layerId) => set({ activeLayerId: layerId }),

  selectMultipleLayers: (layerIds) => {
    const { canvas, layers } = get();
    const valid = layerIds.filter((id) => layers.some((l) => l.id === id));

    if (canvas) {
      const objs = canvas.getObjects().filter((o) => {
        const id =
          (o as unknown as { data?: { id?: string } }).data?.id ||
          (o as unknown as { id?: string }).id;
        return id && valid.includes(id);
      });
      if (objs.length === 1) {
        canvas.setActiveObject(objs[0]);
      } else if (objs.length > 1) {
        // Use the runtime constructor — avoids TS lift of ActiveSelection generic.
        const FabricLib = (canvas as unknown as {
          constructor: { ActiveSelection?: unknown };
        }).constructor as { ActiveSelection?: new (...args: unknown[]) => FabricObject };
        if (FabricLib.ActiveSelection) {
          canvas.setActiveObject(new FabricLib.ActiveSelection(objs, { canvas }));
        }
      }
      canvas.renderAll();
    }

    const matched = layers.filter((l) => valid.includes(l.id));
    const canBatchEdit = valid.length > 1 && matched.every((l) => !l.locked);
    const batchEditableProperties: Array<
      'opacity' | 'visible' | 'locked' | 'color'
    > = [];
    if (valid.length > 1) {
      batchEditableProperties.push('opacity', 'visible', 'locked');
      if (matched.every((l) => l.type === 'text' || l.type === 'icon')) {
        batchEditableProperties.push('color');
      }
    }

    set({
      layerSelection: {
        selectedLayerIds: valid,
        selectionMode: valid.length > 1 ? 'multiple' : 'single',
        lastSelectedId: valid[valid.length - 1] || null,
        canBatchEdit,
        batchEditableProperties,
      },
      activeLayerId: valid.length === 1 ? valid[0] : null,
    });
  },

  toggleLayerSelection: (layerId) => {
    const { layerSelection } = get();
    const ids = layerSelection.selectedLayerIds.includes(layerId)
      ? layerSelection.selectedLayerIds.filter((i) => i !== layerId)
      : [...layerSelection.selectedLayerIds, layerId];
    get().selectMultipleLayers(ids);
  },

  selectAllLayers: () => {
    const ids = get()
      .layers.filter((l) => l.visible && !l.locked)
      .map((l) => l.id);
    get().selectMultipleLayers(ids);
  },

  deselectAllLayers: () => {
    const { canvas } = get();
    if (canvas) {
      canvas.discardActiveObject();
      canvas.renderAll();
    }
    set({
      layerSelection: emptySelection(),
      activeLayerId: null,
      selectedLayers: [],
    });
  },

  getSelectedLayerIds: () => get().layerSelection.selectedLayerIds,
  isLayerSelected: (id) => get().layerSelection.selectedLayerIds.includes(id),

  // Batch
  batchUpdateLayers: (updates) => {
    const state = get();
    const surface = state.activeSurface;
    if (!surface) return;
    const ids = state.layerSelection.selectedLayerIds;
    const layers = state.layersBySurface[surface] || [];

    const newLayers = layers.map((layer) => {
      if (!ids.includes(layer.id)) return layer;
      const next: LayerData = { ...layer, updatedAt: new Date() };
      if (updates.opacity !== undefined) next.opacity = updates.opacity;
      if (updates.visible !== undefined) next.visible = updates.visible;
      if (updates.locked !== undefined) next.locked = updates.locked;
      if (
        updates.color !== undefined &&
        (layer.type === 'text' || layer.type === 'icon')
      ) {
        const data = (layer.data || {}) as Record<string, unknown> & {
          fillByTint?: Record<string, string>;
        };
        if (updates.colorTintKey && updates.colorTintKey !== 'none') {
          // Scope the colour to the active tint — preserve the base fill so
          // other shirt colours still show the canonical layer color.
          next.data = {
            ...data,
            fillByTint: {
              ...(data.fillByTint ?? {}),
              [updates.colorTintKey]: updates.color,
            },
          };
        } else {
          // No tint active → write the base fill like before.
          next.data = { ...data, color: updates.color, fill: updates.color };
        }
      }
      return next;
    });

    const updated = { ...state.layersBySurface, [surface]: newLayers };
    set({ layersBySurface: updated, layers: newLayers, isDirty: true });
    get().pushHistory({ action: 'batch' });
  },

  canBatchEdit: () => {
    const state = get();
    const ids = state.layerSelection.selectedLayerIds;
    const sel = state.layers.filter((l) => ids.includes(l.id));
    return sel.length > 1 && sel.every((l) => !l.locked);
  },

  getBatchEditableProperties: () => {
    const state = get();
    const ids = state.layerSelection.selectedLayerIds;
    const sel = state.layers.filter((l) => ids.includes(l.id));
    if (sel.length === 0) return [];
    const props: Array<'opacity' | 'visible' | 'locked' | 'color'> = [
      'opacity',
      'visible',
      'locked',
    ];
    if (sel.every((l) => l.type === 'text' || l.type === 'icon')) {
      props.push('color');
    }
    return props;
  },

  deleteSelectedLayers: () => {
    const ids = [...get().layerSelection.selectedLayerIds];
    get().deselectAllLayers();
    ids.forEach((id) => get().removeLayer(id));
  },

  // Visibility / lock
  setLayerVisible: (layerId, visible) => {
    get().updateLayer(layerId, { visible });
    const { canvas } = get();
    if (canvas) {
      const obj = canvas
        .getObjects()
        .find((o) =>
          ((o as unknown as { data?: { id?: string } }).data?.id ||
            (o as unknown as { id?: string }).id) === layerId
        );
      if (obj) {
        obj.visible = visible;
        canvas.renderAll();
      }
    }
  },
  setLayerLocked: (layerId, locked) => {
    get().updateLayer(layerId, { locked });
    const { canvas } = get();
    if (canvas) {
      const obj = canvas
        .getObjects()
        .find((o) =>
          ((o as unknown as { data?: { id?: string } }).data?.id ||
            (o as unknown as { id?: string }).id) === layerId
        );
      if (obj) {
        obj.selectable = !locked;
        obj.evented = !locked;
        canvas.renderAll();
      }
    }
  },
  toggleLayerVisibility: (layerId) => {
    const l = get().layers.find((x) => x.id === layerId);
    if (!l) return;
    get().setLayerVisible(layerId, !l.visible);
  },
  toggleLayerLock: (layerId) => {
    const l = get().layers.find((x) => x.id === layerId);
    if (!l) return;
    get().setLayerLocked(layerId, !l.locked);
  },

  // Print-area overlay visibility (default on so customers see safe-zone)
  showPrintArea: true,
  setShowPrintArea: (visible) => set({ showPrintArea: visible }),
  togglePrintArea: () => set((s) => ({ showPrintArea: !s.showPrintArea })),

  mockupTint: null,
  setMockupTint: (hex) => set({ mockupTint: hex, isDirty: true }),

  showGrid: false,
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),

  // Pan / zoom
  zoom: INITIAL_ZOOM,
  panX: 0,
  panY: 0,
  hasManuallyPanned: false,
  setZoom: (zoom) => {
    const clamped = Math.max(0.1, Math.min(5, zoom));
    const { canvas } = get();
    if (canvas) {
      const point = new Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
      canvas.zoomToPoint(point, clamped);
      canvas.renderAll();
    }
    set({ zoom: clamped });
  },
  setPan: (x, y) => {
    const { canvas } = get();
    set({ panX: x, panY: y, hasManuallyPanned: true });
    if (canvas) {
      canvas.relativePan(new Point(x, y));
      canvas.renderAll();
    }
  },
  resetView: () => {
    const { canvas } = get();
    set({ zoom: INITIAL_ZOOM, panX: 0, panY: 0, hasManuallyPanned: false });
    if (canvas) {
      canvas.zoomToPoint(
        new Point(canvas.getWidth() / 2, canvas.getHeight() / 2),
        INITIAL_ZOOM
      );
      canvas.absolutePan(new Point(0, 0));
      canvas.renderAll();
    }
  },
  zoomIn: (step = 0.25) => get().setZoom(get().zoom * (1 + step)),
  zoomOut: (step = 0.2) => get().setZoom(get().zoom * (1 - step)),
  zoomToFit: () => {
    const { canvas } = get();
    if (!canvas) return;
    const objects = canvas.getObjects();
    if (objects.length === 0) {
      get().resetView();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    objects.forEach((obj) => {
      const b = obj.getBoundingRect();
      minX = Math.min(minX, b.left);
      minY = Math.min(minY, b.top);
      maxX = Math.max(maxX, b.left + b.width);
      maxY = Math.max(maxY, b.top + b.height);
    });
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 50;
    const cw = canvas.getWidth();
    const ch = canvas.getHeight();
    const z = Math.min(
      (cw - padding * 2) / contentW,
      (ch - padding * 2) / contentH,
      5
    );
    canvas.setZoom(z);
    const panX = cw / 2 - (minX + contentW / 2) * z;
    const panY = ch / 2 - (minY + contentH / 2) * z;
    canvas.absolutePan(new Point(panX, panY));
    set({ zoom: z, panX, panY });
    canvas.renderAll();
  },
  panUp: (distance = 50) => {
    const { canvas } = get();
    if (!canvas) return;
    const vpt = canvas.viewportTransform;
    if (vpt) {
      vpt[5] += distance;
      canvas.setViewportTransform(vpt);
      canvas.renderAll();
      set({ hasManuallyPanned: true });
    }
  },
  panDown: (distance = 50) => {
    const { canvas } = get();
    if (!canvas) return;
    const vpt = canvas.viewportTransform;
    if (vpt) {
      vpt[5] -= distance;
      canvas.setViewportTransform(vpt);
      canvas.renderAll();
      set({ hasManuallyPanned: true });
    }
  },
  panLeft: (distance = 50) => {
    const { canvas } = get();
    if (!canvas) return;
    const vpt = canvas.viewportTransform;
    if (vpt) {
      vpt[4] += distance;
      canvas.setViewportTransform(vpt);
      canvas.renderAll();
      set({ hasManuallyPanned: true });
    }
  },
  panRight: (distance = 50) => {
    const { canvas } = get();
    if (!canvas) return;
    const vpt = canvas.viewportTransform;
    if (vpt) {
      vpt[4] -= distance;
      canvas.setViewportTransform(vpt);
      canvas.renderAll();
      set({ hasManuallyPanned: true });
    }
  },

  // History
  history: [],
  historyIndex: -1,
  maxHistorySize: 50,
  pushHistory: (entry) => {
    const { history, historyIndex, maxHistorySize, activeSurface } = get();
    const next: CanvasHistory = {
      id: uuidv4(),
      timestamp: new Date(),
      surface: activeSurface,
      ...entry,
    };
    const trimmed = history.slice(0, historyIndex + 1);
    trimmed.push(next);
    while (trimmed.length > maxHistorySize) trimmed.shift();
    set({ history: trimmed, historyIndex: trimmed.length - 1 });
  },
  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < 0) return;
    const item = history[historyIndex];
    // Replay inverse without recording new history.
    switch (item.action) {
      case 'add':
        if (item.layerId) silentRemove(get, set, item.surface, item.layerId);
        break;
      case 'remove':
        if (item.beforeState && !Array.isArray(item.beforeState)) {
          silentAdd(get, set, item.surface, item.beforeState);
        }
        break;
      case 'modify':
        if (item.layerId && item.beforeState && !Array.isArray(item.beforeState)) {
          silentReplace(get, set, item.surface, item.layerId, item.beforeState);
        }
        break;
      default:
        break;
    }
    set({ historyIndex: historyIndex - 1 });
  },
  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIdx = historyIndex + 1;
    const item = history[newIdx];
    switch (item.action) {
      case 'add':
        if (item.afterState && !Array.isArray(item.afterState)) {
          silentAdd(get, set, item.surface, item.afterState);
        }
        break;
      case 'remove':
        if (item.layerId) silentRemove(get, set, item.surface, item.layerId);
        break;
      case 'modify':
        if (item.layerId && item.afterState && !Array.isArray(item.afterState)) {
          silentReplace(get, set, item.surface, item.layerId, item.afterState);
        }
        break;
      default:
        break;
    }
    set({ historyIndex: newIdx });
  },
  canUndo: () => get().historyIndex >= 0,
  canRedo: () => get().historyIndex < get().history.length - 1,
  clearHistory: () => set({ history: [], historyIndex: -1 }),

  // Clipboard
  clipboardLayers: [],
  copySelectedLayers: () => {
    const { selectedLayers, layers } = get();
    const data: LayerData[] = [];
    selectedLayers.forEach((obj) => {
      const id =
        (obj as unknown as { data?: { id?: string } }).data?.id ||
        (obj as unknown as { id?: string }).id;
      if (!id) return;
      const layer = layers.find((l) => l.id === id);
      if (layer) data.push(layer);
    });
    set({ clipboardLayers: data });
  },
  pasteLayersFromClipboard: () => {
    const { clipboardLayers } = get();
    clipboardLayers.forEach((layer) => {
      const { id: _id, createdAt: _c, updatedAt: _u, zIndex: _z, ...rest } = layer;
      void _id;
      void _c;
      void _u;
      void _z;
      get().addLayer({
        ...rest,
        name: `${layer.name} Copy`,
        left: layer.left + 20,
        top: layer.top + 20,
      });
    });
  },

  // Dirty / save tracking
  isDirty: false,
  lastSaved: null,
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),
  markDirty: () => set({ isDirty: true }),
  markSaved: () => set({ isDirty: false, lastSaved: new Date() }),

  // Import / export
  exportCanvasData: () => {
    const state = get();
    return {
      designId: state.designId,
      designName: state.designName,
      productId: state.productId,
      layersBySurface: state.layersBySurface,
      // canvasSize is the jsonb column the API stores; wedge mockupTint
      // inside it so we don't need a schema change for the tint to survive
      // autosave + reload. DesignCanvas + importCanvasData read it back out.
      canvasSize: {
        ...state.canvasSize,
        mockupTint: state.mockupTint ?? null,
      } as CanvasSize & { mockupTint: string | null },
      mockupTint: state.mockupTint,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
  },
  importCanvasData: (data) => {
    if (!data) return;
    if ('layersBySurface' in data && data.layersBySurface) {
      const layersBySurface: Record<string, LayerData[]> = {};
      for (const [slug, list] of Object.entries(data.layersBySurface)) {
        layersBySurface[slug] = (list as LayerData[]).map((l) => ({
          ...l,
          createdAt: l.createdAt ? new Date(l.createdAt) : new Date(),
          updatedAt: l.updatedAt ? new Date(l.updatedAt) : new Date(),
        }));
      }
      const state = get();
      const activeSurface =
        state.activeSurface || Object.keys(layersBySurface)[0] || '';
      const designId =
        'id' in data && typeof data.id === 'string'
          ? data.id
          : 'designId' in data && typeof data.designId === 'string'
            ? data.designId
            : null;
      const designName =
        'name' in data && typeof data.name === 'string'
          ? data.name
          : 'designName' in data && typeof data.designName === 'string'
            ? data.designName
            : state.designName;
      const productId =
        'productId' in data && typeof data.productId === 'number'
          ? data.productId
          : state.productId;
      const canvasSize: CanvasSize =
        'canvasSize' in data && data.canvasSize
          ? data.canvasSize
          : state.canvasSize;

      // mockupTint may live either as a top-level field or wedged inside
      // canvasSize (where exportCanvasData stashes it so we don't need a
      // dedicated DB column).
      const cs = canvasSize as unknown as Record<string, unknown>;
      const stashedTint =
        cs && 'mockupTint' in cs
          ? (cs.mockupTint as string | null | undefined)
          : undefined;
      const mockupTint =
        'mockupTint' in data && typeof data.mockupTint !== 'undefined'
          ? (data.mockupTint as string | null)
          : typeof stashedTint !== 'undefined'
            ? stashedTint
            : state.mockupTint;

      set({
        designId,
        designName,
        productId,
        layersBySurface,
        layers: layersBySurface[activeSurface] || [],
        activeSurface,
        canvasSize,
        mockupTint,
        isDirty: false,
      });
    }
  },
  loadDesign: (doc) => get().importCanvasData(doc),
}));

/* ──────────────────────────────────────────────────────────────────────────
 * Silent helpers used by undo/redo — they mutate layers without pushing a
 * history entry. They operate on the surface stored in the history item, so
 * undo correctly targets the surface where the action originally happened.
 * ────────────────────────────────────────────────────────────────────────── */

type GetFn = () => CanvasStoreState;
type SetFn = (partial: Partial<CanvasStoreState>) => void;

function silentAdd(
  get: GetFn,
  set: SetFn,
  surface: string,
  layer: LayerData
) {
  const state = get();
  const existing = state.layersBySurface[surface] || [];
  const updated = {
    ...state.layersBySurface,
    [surface]: [...existing, layer],
  };
  set({
    layersBySurface: updated,
    layers:
      surface === state.activeSurface ? updated[surface] : state.layers,
    isDirty: true,
  });
}

function silentRemove(
  get: GetFn,
  set: SetFn,
  surface: string,
  layerId: string
) {
  const state = get();
  const existing = state.layersBySurface[surface] || [];
  const filtered = existing.filter((l) => l.id !== layerId);
  const updated = { ...state.layersBySurface, [surface]: filtered };
  set({
    layersBySurface: updated,
    layers: surface === state.activeSurface ? filtered : state.layers,
    isDirty: true,
  });
}

function silentReplace(
  get: GetFn,
  set: SetFn,
  surface: string,
  layerId: string,
  layer: LayerData
) {
  const state = get();
  const existing = state.layersBySurface[surface] || [];
  const updated = {
    ...state.layersBySurface,
    [surface]: existing.map((l) => (l.id === layerId ? layer : l)),
  };
  set({
    layersBySurface: updated,
    layers:
      surface === state.activeSurface ? updated[surface] : state.layers,
    isDirty: true,
  });
}

// Re-export findLayerAcrossSurfaces for callers that need cross-surface lookup.
export { findLayerAcrossSurfaces };
