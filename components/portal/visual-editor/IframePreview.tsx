'use client';

import type { RefObject } from 'react';

/**
 * Iframe-driven editor canvas — viewport sizing, pan/zoom transform, drop
 * overlay for external block drags, and the floating zoom-level indicator.
 *
 * The iframe renders the live page; selection overlays and the postMessage
 * bridge are the iframe's responsibility, not this component's. The drag
 * overlay is mounted on top of the iframe only when a block-picker drag is
 * active so the parent can translate cursor coordinates into iframe space
 * before forwarding them via the bridge.
 */
export function IframePreview({
  iframeRef,
  iframeSrc,
  handleIframeLoad,
  viewport,
  zoomLevel,
  panOffset,
  canvasRef,
  handleCanvasMouseDown,
  handleCanvasMouseMove,
  handleCanvasMouseUp,
  zoomIn,
  zoomOut,
  zoomReset,
  allowIframeScroll,
  blocks,
  previewMode,
  externalDragType,
  onExternalDragMove,
  onExternalDragEnd,
  onExternalDragCancel,
  onExternalDragLeave,
}: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  iframeSrc: string;
  handleIframeLoad: () => void;
  viewport: 'desktop' | 'tablet' | 'mobile';
  zoomLevel: number;
  panOffset: { x: number; y: number };
  canvasRef: RefObject<HTMLDivElement | null>;
  handleCanvasMouseDown: (e: React.MouseEvent) => void;
  handleCanvasMouseMove: (e: React.MouseEvent) => void;
  handleCanvasMouseUp: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  allowIframeScroll: boolean;
  blocks: unknown[];
  previewMode: boolean;
  externalDragType: string | null;
  onExternalDragMove: (x: number, y: number) => void;
  onExternalDragEnd: (x: number, y: number) => void;
  onExternalDragCancel: () => void;
  onExternalDragLeave: () => void;
}) {
  const viewportWidth = { desktop: '1440px', tablet: '768px', mobile: '375px' }[viewport];
  const viewportHeight = { desktop: '810px', tablet: '900px', mobile: '900px' }[viewport];

  return (
    <div className="flex-1 flex flex-col bg-muted relative">
      <div
        ref={canvasRef}
        className="flex-1 overflow-hidden relative"
        style={{ background: 'radial-gradient(circle, hsl(var(--muted-foreground) / 0.15) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        <div
          style={{
            position: 'absolute',
            left: `${panOffset.x}px`,
            top: `${panOffset.y}px`,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '24px',
            width: '100%',
          }}
        >
          <div
            className={`${allowIframeScroll ? 'overflow-auto' : 'overflow-hidden'} relative shadow-xl rounded-lg border border-border/50`}
            style={{
              width: viewportWidth,
              height: viewportHeight,
              flexShrink: 0,
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top center',
            }}
          >
            <iframe ref={iframeRef} src={iframeSrc} onLoad={handleIframeLoad} className="w-full h-full border-0" title="Visual Editor" />
            {/* Empty state overlay when all blocks have been deleted */}
            {blocks.length === 0 && !previewMode && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-card z-10">
                <span className="material-icons text-4xl text-muted-foreground/40 mb-3">layers_clear</span>
                <p className="text-sm font-medium text-muted-foreground mb-1">No blocks on this page</p>
                <p className="text-xs text-muted-foreground/70">Add blocks from the panel on the left</p>
              </div>
            )}
            {/* Overlay to capture drag events over iframe */}
            {externalDragType && (
              <div
                className="absolute inset-0 z-10"
                style={{ cursor: 'copy' }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  const rect = iframe.getBoundingClientRect();
                  const scale = zoomLevel / 100;
                  const x = (e.clientX - rect.left) / scale;
                  const y = (e.clientY - rect.top) / scale;
                  onExternalDragMove(x, y);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  const rect = iframe.getBoundingClientRect();
                  const scale = zoomLevel / 100;
                  const x = (e.clientX - rect.left) / scale;
                  const y = (e.clientY - rect.top) / scale;
                  onExternalDragEnd(x, y);
                }}
                onDragLeave={(e) => {
                  // Only cancel if leaving the overlay entirely
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    onExternalDragCancel();
                    onExternalDragLeave();
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Zoom controls — shown in both preview and edit modes */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card/90 backdrop-blur border border-border rounded-lg px-2 py-1 shadow-lg z-10">
        <button type="button" onClick={zoomOut} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={zoomLevel <= 30} title="Zoom out">
          <span className="material-icons text-sm">remove</span>
        </button>
        <button type="button" onClick={zoomReset} className="px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground min-w-[3rem] text-center" title="Reset zoom">
          {zoomLevel}%
        </button>
        <button type="button" onClick={zoomIn} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={zoomLevel >= 200} title="Zoom in">
          <span className="material-icons text-sm">add</span>
        </button>
      </div>
    </div>
  );
}
