'use client';

import React from 'react';

import { useCanvasStore } from '@/lib/designer/canvasStore';

interface CanvasControlsProps {
  className?: string;
}

/**
 * Overlay control cluster: D-pad pan + zoom in/out + reset view.
 * Pulls all actions directly from the store.
 */
export default function CanvasControls({ className = '' }: CanvasControlsProps) {
  const zoom = useCanvasStore((s) => s.zoom);
  const setZoom = useCanvasStore((s) => s.setZoom);
  const resetView = useCanvasStore((s) => s.resetView);
  const panUp = useCanvasStore((s) => s.panUp);
  const panDown = useCanvasStore((s) => s.panDown);
  const panLeft = useCanvasStore((s) => s.panLeft);
  const panRight = useCanvasStore((s) => s.panRight);
  const zoomToFit = useCanvasStore((s) => s.zoomToFit);

  const zoomPercentage = Math.round(zoom * 100);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="bg-background border border-border rounded-md shadow-sm p-1">
        <div className="flex flex-col items-center">
          <button
            type="button"
            aria-label="Pan up"
            onClick={() => panUp()}
            className="w-9 h-7 rounded-md hover:bg-muted text-foreground inline-flex items-center justify-center"
          >
            <span className="material-icons text-base">expand_less</span>
          </button>
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Pan left"
              onClick={() => panLeft()}
              className="w-7 h-9 rounded-md hover:bg-muted text-foreground inline-flex items-center justify-center"
            >
              <span className="material-icons text-base">chevron_left</span>
            </button>
            <button
              type="button"
              aria-label="Reset view"
              onClick={resetView}
              className="w-7 h-9 rounded-md hover:bg-muted text-foreground inline-flex items-center justify-center"
              title="Reset view"
            >
              <span className="material-icons text-base">center_focus_strong</span>
            </button>
            <button
              type="button"
              aria-label="Pan right"
              onClick={() => panRight()}
              className="w-7 h-9 rounded-md hover:bg-muted text-foreground inline-flex items-center justify-center"
            >
              <span className="material-icons text-base">chevron_right</span>
            </button>
          </div>
          <button
            type="button"
            aria-label="Pan down"
            onClick={() => panDown()}
            className="w-9 h-7 rounded-md hover:bg-muted text-foreground inline-flex items-center justify-center"
          >
            <span className="material-icons text-base">expand_more</span>
          </button>
        </div>
      </div>

      <div className="bg-background border border-border rounded-md shadow-sm p-1 flex items-center gap-1">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setZoom(Math.max(0.1, zoom * 0.8))}
          disabled={zoom <= 0.1}
          className="w-7 h-7 rounded-md hover:bg-muted text-foreground disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
        >
          <span className="material-icons text-base">remove</span>
        </button>
        <span className="text-xs text-foreground min-w-10 text-center font-medium">
          {zoomPercentage}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setZoom(Math.min(5, zoom * 1.25))}
          disabled={zoom >= 5}
          className="w-7 h-7 rounded-md hover:bg-muted text-foreground disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
        >
          <span className="material-icons text-base">add</span>
        </button>
        <button
          type="button"
          aria-label="Fit to content"
          onClick={zoomToFit}
          className="w-7 h-7 rounded-md hover:bg-muted text-foreground inline-flex items-center justify-center"
          title="Fit to content"
        >
          <span className="material-icons text-base">fit_screen</span>
        </button>
      </div>
    </div>
  );
}
