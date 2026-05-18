'use client';

import { useCallback, useState } from 'react';
import type { FabricObject } from 'fabric';

import { useCanvasStore } from '@/lib/designer/canvasStore';

/**
 * Floating "Export PNG" button anchored bottom-right. Renders the active
 * surface to a 2x retina PNG and triggers a browser download. Print-area
 * overlays and any object flagged `excludeFromExport` are temporarily hidden
 * for a clean export.
 */
export default function ExportButton() {
  const designName = useCanvasStore((s) => s.designName);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onExport = useCallback(async () => {
    const canvas = useCanvasStore.getState().canvas;
    if (!canvas) {
      setError('Canvas is not ready yet.');
      return;
    }
    setExporting(true);
    setError(null);

    // Hide print-area overlay + any excludeFromExport objects so they don't
    // bleed into the export. Track what we changed so we can restore.
    const restoreList: Array<{ obj: FabricObject; visible: boolean }> = [];
    try {
      const objects = canvas.getObjects();
      for (const obj of objects) {
        const flags = obj as unknown as {
          _designerPrintArea?: boolean;
          excludeFromExport?: boolean;
          visible?: boolean;
        };
        if (flags._designerPrintArea || flags.excludeFromExport) {
          restoreList.push({ obj, visible: obj.visible !== false });
          obj.visible = false;
        }
      }
      canvas.renderAll();

      const dataUrl = canvas.toDataURL({
        format: 'png',
        multiplier: 2,
      });

      const safe =
        (designName || 'design').replace(/\W+/g, '-').replace(/^-+|-+$/g, '') ||
        'design';
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${safe}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      // Always restore visibility.
      for (const { obj, visible } of restoreList) {
        obj.visible = visible;
      }
      canvas.renderAll();
      setExporting(false);
    }
  }, [designName]);

  return (
    <>
      <button
        type="button"
        onClick={onExport}
        disabled={exporting}
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-md text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition disabled:opacity-60 disabled:cursor-wait"
        title="Export current view as PNG"
        aria-label="Export current view as PNG"
      >
        <span className={`material-icons text-base ${exporting ? 'animate-spin' : ''}`}>
          {exporting ? 'sync' : 'download'}
        </span>
        {exporting ? 'Exporting…' : 'Export PNG'}
      </button>

      {error && (
        <div className="fixed bottom-20 right-4 z-40 px-3 py-2 rounded-lg bg-red-600 text-white text-xs shadow-lg max-w-xs">
          {error}
        </div>
      )}
    </>
  );
}
