'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatMoney } from '@/lib/utils/money';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import { useAutoSave } from '@/lib/designer/hooks/useAutoSave';
import { useKeyboardShortcuts } from '@/lib/designer/hooks/useKeyboardShortcuts';
import type {
  DesignDoc,
  DesignerSurface,
  ExportedDesignData,
  UploadedImageResult,
} from '@/lib/designer/types';

import { useAddImageLayer } from '@/lib/designer/hooks/useAddImageLayer';
import type { AiImageStyle } from '@/lib/designer/aiPromptBuilder';
import { assessPrintQuality } from '@/lib/designer/printQuality';
import AddLayerPanel from './AddLayerPanel';
import AiImageModal from './AiImageModal';
import AlignmentToolbar from './AlignmentToolbar';
import CanvasControls from './CanvasControls';
import DesignCanvas from './DesignCanvas';
import LayersPanel from './LayersPanel';
import PropertiesPanel from './PropertiesPanel';
import PreviewModal from './PreviewModal';
import ProductColorPicker from './ProductColorPicker';
import ShortcutsModal from './ShortcutsModal';
import SnapshotsDropdown from './SnapshotsDropdown';
import SurfaceSelector from './SurfaceSelector';

type SidebarTab = 'add' | 'layers' | 'properties';

// Short relative time ("just now", "2 min ago", "1 hr ago") used by the save
// indicator. Returns null when we have no timestamp yet.
function relativeTime(date: Date | null | undefined): string | null {
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 5_000) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

interface DesignerShellProps {
  productId: number;
  productName: string;
  /** Base unit price in cents — used to show live "$N.NN × Q" in the toolbar. */
  productPriceCents?: number;
  /** ISO 4217 currency code. Defaults to USD. */
  currency?: string;
  /** Optional href for a "Back" / exit affordance in the toolbar. */
  exitHref?: string;
  surfaces: DesignerSurface[];
  /** Optional existing in-progress design to bootstrap from. */
  initialDesign?: DesignDoc;
  /** Save updates to an existing design (PUT). */
  onSave: (doc: DesignDoc) => Promise<{ id: string } | void>;
  /** Create a new design (POST). Called on first save when there's no id yet. */
  onCreate: (doc: DesignDoc) => Promise<{ id: string }>;
  /** Image uploader supplied by the parent — wires to the storefront API. */
  onUploadImage: (file: File) => Promise<UploadedImageResult>;
  /**
   * Caller-supplied AI image generator. Returns the variants array so the
   * modal can render a picker when the customer asked for n > 1.
   */
  onGenerateAiImage?: (req: {
    prompt: string;
    style: 'illustration' | 'photo' | 'graphic' | 'auto';
    transparent: boolean;
    n?: number;
  }) => Promise<{ variants: UploadedImageResult[] }>;
  /**
   * Caller-supplied AI text-suggestion generator. Returns up to N short
   * tagline / slogan candidates for the customer to pick from. Optional —
   * the Suggest button in the Text properties panel is hidden when
   * undefined.
   */
  onGenerateAiText?: (req: {
    prompt: string;
    currentText?: string;
    productName?: string;
    n?: number;
  }) => Promise<{ suggestions: string[] }>;
  /**
   * Attach the (saved) design to the cart. Receives the saved design id and
   * the quantity picked from the toolbar.
   */
  onAddToCart: (designId: string, quantity: number) => Promise<void>;
  /**
   * When true, this shell is opened by portal staff editing a store-mode
   * design (not a customer). Hides the quantity stepper, price label, and
   * Add-to-cart button — staff isn't buying, they're authoring. The Save
   * button stays so edits can be persisted back to the design row.
   */
  staffMode?: boolean;
  className?: string;
}

/**
 * Top-level assembled designer. Designed to be dropped onto a Next.js storefront
 * route with all data pre-fetched: pass the product info, the configured
 * surfaces, and (optionally) an existing design doc.
 */
export function DesignerShell({
  productId,
  productName,
  productPriceCents,
  currency = 'USD',
  exitHref,
  surfaces,
  initialDesign,
  onSave,
  onCreate,
  onUploadImage,
  onGenerateAiImage,
  onGenerateAiText,
  onAddToCart,
  staffMode = false,
  className = '',
}: DesignerShellProps) {
  const setSurfaces = useCanvasStore((s) => s.setSurfaces);
  const setDesign = useCanvasStore((s) => s.setDesign);
  const setDesignName = useCanvasStore((s) => s.setDesignName);
  const importCanvasData = useCanvasStore((s) => s.importCanvasData);
  const activeSurface = useCanvasStore((s) => s.activeSurface);
  const setActiveSurface = useCanvasStore((s) => s.setActiveSurface);
  const designName = useCanvasStore((s) => s.designName);
  const designId = useCanvasStore((s) => s.designId);
  const showPrintArea = useCanvasStore((s) => s.showPrintArea);
  const togglePrintArea = useCanvasStore((s) => s.togglePrintArea);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const toggleGrid = useCanvasStore((s) => s.toggleGrid);
  const selectedLayers = useCanvasStore((s) => s.selectedLayers);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  // The store exposes canUndo/canRedo as functions; subscribe to the underlying
  // history fields so this component re-renders when the stack changes.
  const canUndo = useCanvasStore((s) => s.historyIndex >= 0);
  const canRedo = useCanvasStore(
    (s) => s.historyIndex < s.history.length - 1
  );

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('layers');
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [quantity, setQuantity] = useState<number>(1);
  const [dragOver, setDragOver] = useState(false);
  // Sidebar starts closed on small viewports so the canvas owns the screen
  // by default. The toggle button below md flips it open as an overlay
  // (backdrop dim, slides in from the left). On md+ the aside is part of
  // the flex layout and this state is ignored.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // AI image modal state — lives at the shell level so the Regenerate
  // button in PropertiesPanel can re-open it even when the customer has
  // switched away from the Add Layer tab (AddLayerPanel unmounts on tab
  // switch, taking any locally-mounted modal with it).
  const [aiModal, setAiModal] = useState<{
    open: boolean;
    prefill?: { prompt: string; style: AiImageStyle; transparent: boolean };
    regenerateLayerId?: string;
  }>({ open: false });

  // Drag-and-drop image upload — same code path as the file picker.
  const addImageLayer = useAddImageLayer({ onUploadImage });

  // Cross-component requests to open the AI modal — used by AddLayerPanel's
  // "Generate with AI" button (which now lives in a different tab from
  // PropertiesPanel's "Regenerate") and by the Properties Regenerate flow.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!onGenerateAiImage) return;
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | {
            layerId?: string;
            prompt?: string;
            style?: AiImageStyle;
            transparent?: boolean;
          }
        | undefined;
      if (detail?.layerId && detail.prompt && detail.style) {
        setAiModal({
          open: true,
          prefill: {
            prompt: detail.prompt,
            style: detail.style,
            transparent: detail.transparent ?? true,
          },
          regenerateLayerId: detail.layerId,
        });
      } else {
        setAiModal({ open: true });
      }
    };
    window.addEventListener('designer:request-ai-regenerate', onOpen);
    window.addEventListener('designer:open-ai-modal', onOpen);
    return () => {
      window.removeEventListener('designer:request-ai-regenerate', onOpen);
      window.removeEventListener('designer:open-ai-modal', onOpen);
    };
  }, [onGenerateAiImage]);

  const updateLayer = useCanvasStore((s) => s.updateLayer);
  const storeCanvas = useCanvasStore((s) => s.canvas);

  // Bootstrap store from props on mount.
  useEffect(() => {
    setSurfaces(surfaces);
    if (initialDesign) {
      importCanvasData(initialDesign);
      setDesign(initialDesign.id, initialDesign.name, initialDesign.productId);
    } else {
      setDesign(null, `${productName} Design`, productId);
      if (surfaces.length > 0) setActiveSurface(surfaces[0].slug);
    }
    // We intentionally only run this on mount / when surfaces change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaces, initialDesign?.id]);

  // Save handler — routes to onCreate or onSave depending on whether an id exists.
  const handleSave = useCallback(
    async (payload: ExportedDesignData) => {
      const state = useCanvasStore.getState();
      const currentId = state.designId;
      // Convert the in-memory snapshot into the DesignDoc shape callers expect.
      const baseDoc: Omit<DesignDoc, 'id'> = {
        productId: payload.productId ?? productId,
        name: payload.designName,
        layersBySurface: payload.layersBySurface,
        canvasSize: payload.canvasSize,
        status: state.status,
      };
      if (!currentId) {
        const res = await onCreate({ id: '', ...baseDoc });
        setDesign(res.id, payload.designName, payload.productId ?? productId);
      } else {
        await onSave({ id: currentId, ...baseDoc });
      }
    },
    [onCreate, onSave, productId, setDesign]
  );

  const { isSaving, forceSave, hasUnsavedChanges, lastSaved, error } = useAutoSave({
    onSave: handleSave,
    intervalMs: 15_000,
  });

  // Mirror the current designName into the browser tab title so customers can
  // pick this tab out of a wall of open tabs while shopping multiple sites.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.title;
    const dirtyMark = hasUnsavedChanges ? '• ' : '';
    document.title = `${dirtyMark}${designName || 'Untitled'} — ${productName}`;
    return () => { document.title = prev; };
  }, [designName, productName, hasUnsavedChanges]);

  // Warn before the tab closes / navigates away if there are unsaved
  // changes. Autosave runs every 15 s but a customer who closes the tab
  // mid-edit still loses ~15 s of work without this guard — and on a fresh
  // design with no designId yet, autosave hasn't created the row yet so
  // they'd lose *everything*. The modern browsers ignore the custom
  // message string and show their own generic confirm — we just need to
  // call preventDefault + returnValue to trigger it.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges]);

  // Tick once a minute so the "Saved 2 min ago" indicator updates as the
  // customer keeps working without re-saving.
  const [, forceRelTick] = useState(0);
  useEffect(() => {
    if (!lastSaved || hasUnsavedChanges || isSaving) return;
    const id = setInterval(() => forceRelTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSaved, hasUnsavedChanges, isSaving]);

  useKeyboardShortcuts({
    onSave: () => void forceSave(),
    onToggleHelp: () => setShortcutsOpen((s) => !s),
  });

  // System-clipboard paste — a screenshot from the OS or an image copied
  // from a webpage drops onto the canvas as a new layer. Same code path as
  // the drag-and-drop handler. Skipped while the customer is typing in an
  // input/textarea/contenteditable (rename layer, snapshot name field,
  // text-layer editor) so Ctrl/Cmd+V into those still pastes plain text.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      const imageItem = Array.from(items).find(
        (it) => it.kind === 'file' && it.type.startsWith('image/')
      );
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      // Material-icons "content_paste" hint via the status banner so the
      // customer gets feedback even if the upload takes a beat.
      setStatusMessage('Pasting image…');
      void addImageLayer(file).finally(() => {
        // Clear the "Pasting…" hint after the upload settles. The newly
        // added layer is auto-selected, which is feedback enough.
        setStatusMessage((m) => (m === 'Pasting image…' ? null : m));
      });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addImageLayer]);

  const handleAddToCart = useCallback(async () => {
    setStatusMessage(null);

    // Pre-flight: warn if any image layer is going to print blurry. We
    // already show a per-layer banner in the Properties panel, but a
    // customer can absolutely add-to-cart without ever clicking the bad
    // layer. Use the same `assessPrintQuality` heuristic as the panel so
    // the gate matches what the customer was told.
    if (typeof window !== 'undefined') {
      const layersBySurface = useCanvasStore.getState().layersBySurface;
      let poorCount = 0;
      for (const list of Object.values(layersBySurface)) {
        for (const layer of list) {
          if (layer.type !== 'image') continue;
          const d = layer.data as { originalWidth?: number } | undefined;
          const verdict = assessPrintQuality({
            naturalWidth: d?.originalWidth,
            layerWidth: layer.width,
            scaleX: layer.scaleX,
          });
          if (verdict?.level === 'poor') poorCount += 1;
        }
      }
      if (poorCount > 0) {
        const proceed = window.confirm(
          poorCount === 1
            ? 'One image on your design is low-resolution and will look blurry when printed. Add to cart anyway?'
            : `${poorCount} images on your design are low-resolution and will look blurry when printed. Add to cart anyway?`,
        );
        if (!proceed) return;
      }
    }

    try {
      setIsAddingToCart(true);
      // Make sure we have a saved id first.
      await forceSave();
      const id = useCanvasStore.getState().designId;
      if (!id) {
        setStatusMessage('Please save your design before adding to cart.');
        return;
      }
      await onAddToCart(id, Math.max(1, Math.min(999, Math.floor(quantity) || 1)));
      setStatusMessage('Added to cart!');
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? `Failed: ${err.message}` : 'Failed to add to cart'
      );
    } finally {
      setIsAddingToCart(false);
    }
  }, [forceSave, onAddToCart, quantity]);

  const currentSurface = useMemo(
    () => surfaces.find((s) => s.slug === activeSurface) || surfaces[0],
    [surfaces, activeSurface]
  );

  return (
    <div
      className={`flex flex-col h-full min-h-[600px] bg-background text-foreground ${className}`}
    >
      {/* Top toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background">
        {exitHref && (
          <a
            href={exitHref}
            aria-label={`Back to ${productName}`}
            title={`Back to ${productName}`}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <span className="material-icons text-base">arrow_back</span>
          </a>
        )}
        {/* Mobile sidebar toggle — only visible on viewports too narrow for
            the persistent left sidebar to fit comfortably (md and below). */}
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open layers and tools"
          title="Open layers and tools"
          className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span className="material-icons text-base">menu</span>
        </button>
        <input
          type="text"
          value={designName}
          onChange={(e) => setDesignName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          placeholder={`${productName} design`}
          className="flex-1 max-w-md px-2 py-1 text-sm font-medium rounded-md border border-transparent hover:border-border focus:border-border focus:bg-background bg-transparent text-foreground"
          aria-label="Design name"
        />

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isSaving ? (
            <>
              <span className="material-icons text-base animate-spin">refresh</span>
              Saving…
            </>
          ) : hasUnsavedChanges ? (
            <>
              <span className="material-icons text-base">edit</span>
              Unsaved
            </>
          ) : designId ? (
            <>
              <span className="material-icons text-base">check_circle</span>
              <span title={lastSaved ? lastSaved.toLocaleString() : undefined}>
                {lastSaved ? `Saved ${relativeTime(lastSaved)}` : 'Saved'}
              </span>
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={togglePrintArea}
          aria-pressed={showPrintArea}
          aria-label={
            showPrintArea
              ? 'Hide print-area overlay'
              : 'Show print-area overlay'
          }
          title={
            showPrintArea
              ? 'Print area shown — click to hide'
              : 'Print area hidden — click to show'
          }
          className={`inline-flex items-center justify-center w-8 h-8 rounded-md border ${
            showPrintArea
              ? 'border-primary text-primary bg-primary/5 hover:bg-primary/10'
              : 'border-border text-foreground bg-background hover:bg-muted'
          }`}
        >
          <span className="material-icons text-base">crop_free</span>
        </button>
        <button
          type="button"
          onClick={toggleGrid}
          aria-pressed={showGrid}
          aria-label={showGrid ? 'Hide alignment grid' : 'Show alignment grid'}
          title={
            showGrid
              ? 'Grid shown — click to hide'
              : 'Grid hidden — click to show 25 px alignment grid'
          }
          className={`inline-flex items-center justify-center w-8 h-8 rounded-md border ${
            showGrid
              ? 'border-primary text-primary bg-primary/5 hover:bg-primary/10'
              : 'border-border text-foreground bg-background hover:bg-muted'
          }`}
        >
          <span className="material-icons text-base">grid_on</span>
        </button>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => undo()}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="inline-flex items-center justify-center p-1.5 rounded-md border border-border bg-background hover:bg-muted text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-icons text-base">undo</span>
          </button>
          <button
            type="button"
            onClick={() => redo()}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            className="inline-flex items-center justify-center p-1.5 rounded-md border border-border bg-background hover:bg-muted text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-icons text-base">redo</span>
          </button>
        </div>

        <SnapshotsDropdown />

        <button
          type="button"
          onClick={() => setShortcutsOpen(true)}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
          className="inline-flex items-center justify-center p-1.5 rounded-md border border-border bg-background hover:bg-muted text-foreground"
        >
          <span className="material-icons text-base">help_outline</span>
        </button>

        <button
          type="button"
          onClick={() => void forceSave()}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted text-sm text-foreground disabled:opacity-50"
        >
          <span className="material-icons text-base">save</span>
          Save
        </button>
        {/* Quantity stepper + price + Add to cart are hidden in staff mode —
            portal staff editing the store-authored design isn't buying. */}
        {!staffMode && (
          <div className="flex items-center rounded-md border border-border bg-background overflow-hidden">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
              className="px-2 py-1.5 text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-icons text-base">remove</span>
            </button>
            <input
              type="number"
              min={1}
              max={999}
              value={quantity}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setQuantity(Number.isNaN(v) ? 1 : Math.max(1, Math.min(999, v)));
              }}
              aria-label="Quantity"
              className="w-12 text-center text-sm bg-transparent border-x border-border focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(999, q + 1))}
              disabled={quantity >= 999}
              aria-label="Increase quantity"
              className="px-2 py-1.5 text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-icons text-base">add</span>
            </button>
          </div>
        )}
        {!staffMode && typeof productPriceCents === 'number' && productPriceCents > 0 && (
          <div
            className="text-sm font-semibold text-foreground tabular-nums"
            aria-live="polite"
            aria-label={`Total ${formatMoney(productPriceCents * quantity, { currency })}`}
          >
            {formatMoney(productPriceCents * quantity, { currency })}
          </div>
        )}
        {staffMode && (
          <div
            className="text-xs font-medium uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded"
            title="You're editing the store-authored design. Saves write back to the product's design row."
          >
            <span className="material-icons text-sm align-middle mr-1">admin_panel_settings</span>
            Staff edit
          </div>
        )}
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          title="See what your design will look like printed"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted text-sm text-foreground"
        >
          <span className="material-icons text-base">visibility</span>
          Preview
        </button>
        {!staffMode && (
        <button
          type="button"
          onClick={() => void handleAddToCart()}
          disabled={isAddingToCart}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-sm disabled:opacity-50"
        >
          {isAddingToCart ? (
            <span className="material-icons text-base animate-spin">refresh</span>
          ) : (
            <span className="material-icons text-base">shopping_cart</span>
          )}
          Add to cart
        </button>
        )}
      </div>

      {/* Status row */}
      {(statusMessage || error) && (
        <div
          className={`px-4 py-2 text-sm border-b border-border ${
            error ? 'text-destructive' : 'text-foreground'
          }`}
        >
          {error || statusMessage}
        </div>
      )}

      {/* Alignment / distribution toolbar — only visible with a live selection */}
      {selectedLayers.length > 0 && (
        <div className="flex justify-center px-4 py-2 border-b border-border bg-background">
          <AlignmentToolbar surface={currentSurface ?? null} />
        </div>
      )}

      <div className="flex-1 flex min-h-0 relative">
        {/* Backdrop for the mobile slide-in sidebar — only visible on small
            viewports while the sidebar is open. */}
        {mobileSidebarOpen && (
          <div
            className="md:hidden fixed inset-0 z-30 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
        {/* Sidebar — slide-in drawer below md, persistent flex column at md+. */}
        <aside
          className={`w-80 border-r border-border bg-background flex flex-col min-h-0
            md:relative md:translate-x-0 md:z-auto
            fixed inset-y-0 left-0 z-40 transform transition-transform duration-200
            ${mobileSidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full md:translate-x-0'}`}
        >
          {/* Mobile close affordance — collapses the drawer back into the
              canvas. On md+ the sidebar can't close, so this stays hidden. */}
          <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Tools</span>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close layers and tools"
              className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <span className="material-icons text-base">close</span>
            </button>
          </div>
          <div className="flex border-b border-border">
            {(['add', 'layers', 'properties'] as SidebarTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSidebarTab(tab)}
                className={`flex-1 px-3 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                  sidebarTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'add' ? 'Add layer' : tab}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {sidebarTab === 'add' && (
              <AddLayerPanel
                onUploadImage={onUploadImage}
                onGenerateAiImage={onGenerateAiImage}
              />
            )}
            {sidebarTab === 'layers' && (
              <LayersPanel onShowAddLayerPanel={() => setSidebarTab('add')} />
            )}
            {sidebarTab === 'properties' && (
              <PropertiesPanel
                onGenerateAiText={onGenerateAiText}
                productName={productName}
              />
            )}
          </div>
        </aside>

        {/* Canvas area — also a drop target for image files so customers can
            drag a photo from their desktop straight onto the print area. */}
        <main
          className="flex-1 relative bg-muted/40 overflow-auto p-4"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              if (!dragOver) setDragOver(true);
            }
          }}
          onDragLeave={(e) => {
            // Only clear when the drag leaves the entire main element, not when
            // it crosses over a child node.
            if (e.currentTarget === e.target) setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = Array.from(e.dataTransfer.files).find((f) =>
              f.type.startsWith('image/')
            );
            if (file) void addImageLayer(file);
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center flex-wrap gap-3 justify-center">
              {surfaces.length > 1 && <SurfaceSelector surfaces={surfaces} />}
              <ProductColorPicker />
            </div>
            {currentSurface ? (
              <DesignCanvas
                key={currentSurface.slug}
                surface={currentSurface}
                productId={productId}
              />
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <span className="material-icons text-3xl block mb-2">image</span>
                No design surfaces configured for this product.
              </div>
            )}
          </div>
          <div className="absolute bottom-4 right-4">
            <CanvasControls />
          </div>
          {/* Drop-zone overlay — only visible while a file is being dragged */}
          {dragOver && (
            <div
              className="pointer-events-none absolute inset-2 z-20 rounded-xl border-2 border-dashed border-primary bg-primary/5 flex items-center justify-center"
              aria-hidden="true"
            >
              <div className="text-center text-primary">
                <span className="material-icons text-4xl block mb-1">
                  add_photo_alternate
                </span>
                <p className="text-sm font-medium">
                  Drop image to add it as a layer
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        surfaces={surfaces}
        productName={productName}
        quantity={quantity}
        totalLabel={
          typeof productPriceCents === 'number' && productPriceCents > 0
            ? formatMoney(productPriceCents * quantity, { currency })
            : null
        }
        onConfirm={() => void handleAddToCart()}
      />
      {onGenerateAiImage && (
        <AiImageModal
          open={aiModal.open}
          prefill={aiModal.prefill}
          regenerateLayerName={
            aiModal.regenerateLayerId ? 'this image' : undefined
          }
          onClose={() => setAiModal({ open: false })}
          onGenerate={async (req) => {
            // Just forward to the page-level fetcher; it returns the
            // normalised `{ variants }` shape. Regenerate mode forces n=1
            // because the in-place layer swap can't compose with a picker.
            return onGenerateAiImage({
              prompt: req.prompt,
              style: req.style,
              transparent: req.transparent,
              n: aiModal.regenerateLayerId ? 1 : req.n,
            });
          }}
          onPick={async (variant, req) => {
            if (aiModal.regenerateLayerId && storeCanvas) {
              // Regenerate path — swap the existing Fabric image's source
              // in place so the layer keeps its position, scale, and
              // ordering. The store data update carries the new prompt +
              // url through to the next autosave.
              const targetId = aiModal.regenerateLayerId;
              const fab = storeCanvas.getObjects().find((o) => {
                const id =
                  (o as unknown as { data?: { id?: string } }).data?.id ||
                  (o as unknown as { id?: string }).id;
                return id === targetId;
              });
              if (fab) {
                await (fab as unknown as {
                  setSrc: (
                    src: string,
                    options?: { crossOrigin?: string },
                  ) => Promise<unknown>;
                }).setSrc(variant.url, { crossOrigin: 'anonymous' });
                (fab as unknown as { setCoords?: () => void }).setCoords?.();
                storeCanvas.renderAll();
              }
              updateLayer(targetId, {
                name: `AI · ${req.prompt.slice(0, 40)}`,
                data: {
                  url: variant.url,
                  originalWidth: variant.width,
                  originalHeight: variant.height,
                  ai: {
                    prompt: req.prompt,
                    style: req.style,
                    transparent: req.transparent,
                  },
                },
              });
              return;
            }
            // Fresh add path — drop into the canvas as a new image layer.
            await addImageLayer.addFromResult(
              variant,
              `AI · ${req.prompt.slice(0, 40)}`,
              {
                ai: {
                  prompt: req.prompt,
                  style: req.style,
                  transparent: req.transparent,
                },
              },
            );
          }}
        />
      )}
    </div>
  );
}

export default DesignerShell;
