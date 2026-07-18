'use client';

import { useCallback, useRef, useState } from 'react';
import type { FabricObject } from 'fabric';

import { useCanvasStore } from '@/lib/designer/canvasStore';

const BACKGROUND_ID = 'designer-canvas-background';

type ExportMode = 'mockup' | 'print-ready';

/**
 * Floating export button anchored bottom-right. Two modes, both reusing
 * the same hide-overlays-then-toDataURL plumbing:
 *
 *   * mockup       — 2× canvas snapshot with print-area / guides hidden
 *                    but the mockup shirt image preserved. The "share
 *                    your design" download a customer expects.
 *   * print-ready  — same hidden overlays plus the background mockup
 *                    image is hidden so the resulting PNG is the
 *                    layers alone on a transparent backdrop, ready
 *                    to hand to a printer. Rendered at 3× so the
 *                    300 DPI guarantee for a typical 800-unit-wide
 *                    canvas comes out around 2400 px.
 */
export default function ExportButton() {
  const designName = useCanvasStore((s) => s.designName);
  const [exporting, setExporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const runExport = useCallback(
    async (mode: ExportMode) => {
      const canvas = useCanvasStore.getState().canvas;
      if (!canvas) {
        setError('Canvas is not ready yet.');
        return;
      }
      setExporting(true);
      setError(null);

      // Hide overlays + (for print-ready) the mockup background. Track
      // changes so we can restore in the finally block.
      const restoreList: Array<{ obj: FabricObject; visible: boolean }> = [];
      try {
        const objects = canvas.getObjects();
        for (const obj of objects) {
          const flags = obj as unknown as {
            _designerPrintArea?: boolean;
            _designerGuide?: boolean;
            excludeFromExport?: boolean;
            id?: string;
            visible?: boolean;
          };
          const shouldHide =
            flags._designerPrintArea ||
            flags._designerGuide ||
            flags.excludeFromExport ||
            (mode === 'print-ready' && flags.id === BACKGROUND_ID);
          if (shouldHide) {
            restoreList.push({ obj, visible: obj.visible !== false });
            obj.visible = false;
          }
        }
        canvas.renderAll();

        const dataUrl = canvas.toDataURL({
          format: 'png',
          multiplier: mode === 'print-ready' ? 3 : 2,
        });

        const safe =
          (designName || 'design').replace(/\W+/g, '-').replace(/^-+|-+$/g, '') ||
          'design';
        const suffix = mode === 'print-ready' ? '-print-ready' : '';
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${safe}${suffix}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Export failed');
      } finally {
        for (const { obj, visible } of restoreList) {
          obj.visible = visible;
        }
        canvas.renderAll();
        setExporting(false);
        setMenuOpen(false);
      }
    },
    [designName],
  );

  return (
    <>
      <div ref={menuRef} className="fixed bottom-4 right-4 z-30">
        {/* Mode menu, only when not exporting. Anchored above the trigger
            so it doesn't collide with the print-ready item on small
            screens. */}
        {menuOpen && !exporting && (
          <div
            role="menu"
            className="absolute bottom-full mb-2 right-0 w-64 rounded-lg border border-border bg-background shadow-xl p-1 text-sm"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => void runExport('mockup')}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-muted flex items-start gap-2"
            >
              <span className="material-icons text-base mt-0.5">photo</span>
              <span className="flex-1">
                <span className="block font-medium text-foreground">
                  Mockup PNG
                </span>
                <span className="block text-[10px] text-muted-foreground leading-snug">
                  Design on the shirt — share with friends.
                </span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void runExport('print-ready')}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-muted flex items-start gap-2"
            >
              <span className="material-icons text-base mt-0.5 text-primary">
                local_printshop
              </span>
              <span className="flex-1">
                <span className="block font-medium text-foreground">
                  Print-ready PNG
                </span>
                <span className="block text-[10px] text-muted-foreground leading-snug">
                  Layers only, transparent background, 3× scale. Hand to
                  your printer.
                </span>
              </span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={exporting}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-md text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition disabled:opacity-60 disabled:cursor-wait"
          title="Export design as PNG"
          aria-label="Export design as PNG"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <span className={`material-icons text-base ${exporting ? 'animate-spin' : ''}`}>
            {exporting ? 'sync' : 'download'}
          </span>
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
      </div>

      {error && (
        <div className="fixed bottom-20 right-4 z-40 px-3 py-2 rounded-lg bg-red-600 text-white text-xs shadow-lg max-w-xs">
          {error}
        </div>
      )}
    </>
  );
}
