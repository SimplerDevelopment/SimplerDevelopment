'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import { useAutoSave } from '@/lib/designer/hooks/useAutoSave';
import { useKeyboardShortcuts } from '@/lib/designer/hooks/useKeyboardShortcuts';
import type {
  DesignDoc,
  DesignerSurface,
  ExportedDesignData,
  UploadedImageResult,
} from '@/lib/designer/types';

import AddLayerPanel from './AddLayerPanel';
import AlignmentToolbar from './AlignmentToolbar';
import CanvasControls from './CanvasControls';
import DesignCanvas from './DesignCanvas';
import LayersPanel from './LayersPanel';
import PropertiesPanel from './PropertiesPanel';
import SurfaceSelector from './SurfaceSelector';

type SidebarTab = 'add' | 'layers' | 'properties';

interface DesignerShellProps {
  productId: number;
  productName: string;
  surfaces: DesignerSurface[];
  /** Optional existing in-progress design to bootstrap from. */
  initialDesign?: DesignDoc;
  /** Save updates to an existing design (PUT). */
  onSave: (doc: DesignDoc) => Promise<{ id: string } | void>;
  /** Create a new design (POST). Called on first save when there's no id yet. */
  onCreate: (doc: DesignDoc) => Promise<{ id: string }>;
  /** Image uploader supplied by the parent — wires to the storefront API. */
  onUploadImage: (file: File) => Promise<UploadedImageResult>;
  /** Attach the (saved) design to the cart. */
  onAddToCart: (designId: string) => Promise<void>;
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
  surfaces,
  initialDesign,
  onSave,
  onCreate,
  onUploadImage,
  onAddToCart,
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
  const selectedLayers = useCanvasStore((s) => s.selectedLayers);

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('layers');
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  const { isSaving, forceSave, hasUnsavedChanges, error } = useAutoSave({
    onSave: handleSave,
    intervalMs: 15_000,
  });

  useKeyboardShortcuts({ onSave: () => void forceSave() });

  const handleAddToCart = useCallback(async () => {
    setStatusMessage(null);
    try {
      setIsAddingToCart(true);
      // Make sure we have a saved id first.
      await forceSave();
      const id = useCanvasStore.getState().designId;
      if (!id) {
        setStatusMessage('Please save your design before adding to cart.');
        return;
      }
      await onAddToCart(id);
      setStatusMessage('Added to cart!');
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? `Failed: ${err.message}` : 'Failed to add to cart'
      );
    } finally {
      setIsAddingToCart(false);
    }
  }, [forceSave, onAddToCart]);

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
        <input
          type="text"
          value={designName}
          onChange={(e) => setDesignName(e.target.value)}
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
              Saved
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={togglePrintArea}
          aria-pressed={showPrintArea}
          title={
            showPrintArea
              ? 'Hide print-area overlay'
              : 'Show print-area overlay'
          }
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm ${
            showPrintArea
              ? 'border-primary text-primary bg-primary/5 hover:bg-primary/10'
              : 'border-border text-foreground bg-background hover:bg-muted'
          }`}
        >
          <span className="material-icons text-base">crop_free</span>
          <span className="hidden md:inline">
            {showPrintArea ? 'Print area on' : 'Print area off'}
          </span>
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

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className="w-80 border-r border-border bg-background flex flex-col min-h-0">
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
              <AddLayerPanel onUploadImage={onUploadImage} />
            )}
            {sidebarTab === 'layers' && (
              <LayersPanel onShowAddLayerPanel={() => setSidebarTab('add')} />
            )}
            {sidebarTab === 'properties' && <PropertiesPanel />}
          </div>
        </aside>

        {/* Canvas area */}
        <main className="flex-1 relative bg-muted/40 overflow-auto p-4">
          <div className="flex flex-col items-center gap-3">
            {surfaces.length > 1 && <SurfaceSelector surfaces={surfaces} />}
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
        </main>
      </div>
    </div>
  );
}

export default DesignerShell;
