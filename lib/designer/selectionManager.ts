'use client';

import type { Canvas, FabricObject } from 'fabric';
import { ActiveSelection, Group } from 'fabric';

export interface SelectionChangeEvent {
  selected: FabricObject[];
  deselected: FabricObject[];
}

export type SelectionChangeCallback = (event: SelectionChangeEvent) => void;

export interface SelectionManagerOptions {
  enableMultiSelection?: boolean;
  enableGroupSelection?: boolean;
  preserveObjectStacking?: boolean;
}

/**
 * Helper around Fabric's selection events. Subscribers receive notifications
 * when the active selection changes; the manager exposes high-level commands
 * (selectByIds, deleteSelected, selectAll, group/ungroup, z-order).
 *
 * This is a port of `productDesigner/lib/canvas/selection-manager.ts`,
 * trimmed of Layer-type coupling so it speaks pure Fabric.
 */
export class SelectionManager {
  private canvas: Canvas;
  private callbacks = new Set<SelectionChangeCallback>();
  private selectedObjects = new Set<FabricObject>();
  private options: Required<SelectionManagerOptions>;

  constructor(canvas: Canvas, options: SelectionManagerOptions = {}) {
    this.canvas = canvas;
    this.options = {
      enableMultiSelection: true,
      enableGroupSelection: true,
      preserveObjectStacking: true,
      ...options,
    };
    this.initializeCanvas();
    this.bindEvents();
  }

  private initializeCanvas(): void {
    this.canvas.selection = this.options.enableMultiSelection;
    this.canvas.preserveObjectStacking = this.options.preserveObjectStacking;
    this.canvas.selectionColor = 'rgba(37, 99, 235, 0.1)';
    this.canvas.selectionBorderColor = '#2563eb';
    this.canvas.selectionLineWidth = 2;
    this.canvas.selectionDashArray = [5, 5];
  }

  private bindEvents(): void {
    // Fabric's selection-event payload types are TPointerEvent-tagged and not
    // a stable public surface — cast to a callback shape that takes `unknown`
    // so we can extract `target` without coupling to Fabric internals.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.canvas.on('selection:created', this.handleSelected as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.canvas.on('selection:updated', this.handleSelected as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.canvas.on('selection:cleared', this.handleCleared as any);
  }

  private handleSelected = (e: unknown) => {
    const selection = (e as { target?: FabricObject }).target;
    if (!selection) return;
    const list = this.unwrapSelection(selection);
    const previous = Array.from(this.selectedObjects);
    this.selectedObjects.clear();
    list.forEach((o) => this.selectedObjects.add(o));
    this.notify({
      selected: list.filter((o) => !previous.includes(o)),
      deselected: previous.filter((o) => !list.includes(o)),
    });
  };

  private handleCleared = () => {
    const previous = Array.from(this.selectedObjects);
    this.selectedObjects.clear();
    this.notify({ selected: [], deselected: previous });
  };

  private unwrapSelection(selection: FabricObject): FabricObject[] {
    if (selection.type === 'activeSelection' || selection.type === 'group') {
      return (selection as Group).getObjects();
    }
    return [selection];
  }

  private notify(event: SelectionChangeEvent): void {
    this.callbacks.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('SelectionManager callback error:', err);
      }
    });
  }

  onSelectionChange(cb: SelectionChangeCallback): () => void {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }

  selectObject(object: FabricObject): void {
    this.canvas.setActiveObject(object);
    this.canvas.requestRenderAll();
  }

  selectObjects(objects: FabricObject[]): void {
    if (!this.options.enableMultiSelection || objects.length === 0) return;
    if (objects.length === 1) {
      this.selectObject(objects[0]);
      return;
    }
    const sel = new ActiveSelection(objects, { canvas: this.canvas });
    this.canvas.setActiveObject(sel as unknown as FabricObject);
    this.canvas.requestRenderAll();
  }

  selectByIds(ids: string[]): void {
    const objects = this.canvas.getObjects().filter((o) => {
      const id =
        (o as unknown as { data?: { id?: string } }).data?.id ||
        (o as unknown as { id?: string }).id;
      return id ? ids.includes(id) : false;
    });
    this.selectObjects(objects);
  }

  clearSelection(): void {
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  selectAll(): void {
    const objects = this.canvas.getObjects().filter((o) => o.selectable !== false);
    this.selectObjects(objects);
  }

  deleteSelected(): FabricObject[] {
    const objects = Array.from(this.selectedObjects);
    objects.forEach((obj) => this.canvas.remove(obj));
    this.clearSelection();
    return objects;
  }

  destroy(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.canvas.off('selection:created', this.handleSelected as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.canvas.off('selection:updated', this.handleSelected as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.canvas.off('selection:cleared', this.handleCleared as any);
    this.callbacks.clear();
    this.selectedObjects.clear();
  }
}
