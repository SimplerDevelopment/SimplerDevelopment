'use client';

import { useCallback, useEffect, useState } from 'react';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import type { CanvasSize, LayerData } from '@/lib/designer/types';

interface TemplatesDrawerProps {
  siteId: number;
  productId: number;
}

interface TemplateRow {
  id: string;
  name: string;
  productId: number;
  layersBySurface: Record<string, LayerData[]>;
  canvasSize?: CanvasSize;
  thumbnailUrl?: string | null;
  updatedAt?: string;
}

/**
 * Floating "Templates" launcher anchored bottom-left. Opens a slide-in drawer
 * with a grid of site-wide templates. Clicking a template imports its
 * `layersBySurface` into the active design (the current design becomes dirty
 * so autosave persists the change). A "Save current as template" button in
 * the drawer header clones the active design into a new template row.
 */
export default function TemplatesDrawer({ siteId, productId }: TemplatesDrawerProps) {
  const designId = useCanvasStore((s) => s.designId);
  const importCanvasData = useCanvasStore((s) => s.importCanvasData);

  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        templates: '1',
        productId: String(productId),
      });
      const res = await fetch(`/api/storefront/${siteId}/designs?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load templates');
      }
      const list: TemplateRow[] = Array.isArray(json.data) ? json.data : [];
      setTemplates(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [siteId, productId]);

  useEffect(() => {
    if (open) void fetchTemplates();
  }, [open, fetchTemplates]);

  const onPick = useCallback(
    (tpl: TemplateRow) => {
      importCanvasData({
        designId: null, // keep the current design id; we're overlaying layers
        designName: useCanvasStore.getState().designName,
        productId: tpl.productId,
        layersBySurface: tpl.layersBySurface || {},
        canvasSize:
          tpl.canvasSize ||
          useCanvasStore.getState().canvasSize,
        exportedAt: new Date().toISOString(),
        version: '1.0',
      });
      useCanvasStore.getState().markDirty();
      setOpen(false);
      setInfo(`Loaded "${tpl.name}"`);
      window.setTimeout(() => setInfo(null), 2500);
    },
    [importCanvasData]
  );

  const onSaveAsTemplate = useCallback(async () => {
    if (!designId) {
      setError('Save your design first before turning it into a template.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const sessionId =
        typeof window !== 'undefined'
          ? localStorage.getItem('cart_session_id') || undefined
          : undefined;

      // Best-effort canvas thumbnail. Hide overlays + guides so the preview
      // matches the print-ready output, then restore them in a finally
      // block. Null on failure — the API treats the field as optional.
      let thumbnailDataUrl: string | null = null;
      const canvas = useCanvasStore.getState().canvas;
      if (canvas) {
        const hidden: Array<{
          obj: { visible?: boolean };
          was: boolean | undefined;
        }> = [];
        try {
          canvas.getObjects().forEach((obj) => {
            const tagged = obj as unknown as {
              visible?: boolean;
              _designerPrintArea?: boolean;
              _designerGuide?: boolean;
              excludeFromExport?: boolean;
            };
            if (
              tagged._designerPrintArea ||
              tagged._designerGuide ||
              tagged.excludeFromExport
            ) {
              hidden.push({ obj: tagged, was: tagged.visible });
              tagged.visible = false;
            }
          });
          canvas.requestRenderAll();
          thumbnailDataUrl = canvas.toDataURL({
            format: 'png',
            multiplier: 0.3,
            quality: 0.85,
          });
        } catch {
          thumbnailDataUrl = null;
        } finally {
          hidden.forEach(({ obj, was }) => {
            obj.visible = was;
          });
          canvas.requestRenderAll();
        }
      }

      const res = await fetch(
        `/api/storefront/${siteId}/designs/${designId}/save-as-template`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, thumbnailDataUrl }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to save as template');
      }
      setInfo('Saved as template.');
      window.setTimeout(() => setInfo(null), 2500);
      await fetchTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save as template');
    } finally {
      setSaving(false);
    }
  }, [siteId, designId, fetchTemplates]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 left-4 z-30 flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-md text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
        aria-label="Templates"
        title="Templates"
      >
        <span className="material-icons text-base">library_books</span>
        Templates
      </button>

      {info && (
        <div className="fixed bottom-20 left-4 z-40 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs shadow-lg">
          {info}
        </div>
      )}

      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close templates drawer"
            className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <aside className="fixed top-0 bottom-0 left-0 z-40 w-[360px] max-w-[95vw] bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col">
            <header className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2 font-semibold">
                <span className="material-icons text-base">library_books</span>
                Templates
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSaveAsTemplate}
                  disabled={saving || !designId}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-white text-xs disabled:opacity-50 hover:opacity-90 transition"
                  title="Save current design as a template"
                >
                  <span className="material-icons text-sm">
                    {saving ? 'sync' : 'save'}
                  </span>
                  {saving ? 'Saving…' : 'Save as template'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  aria-label="Close"
                >
                  <span className="material-icons text-base">close</span>
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-3">
              {error && (
                <div className="mb-3 p-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                  {error}
                </div>
              )}
              {loading ? (
                <div className="flex items-center justify-center py-8 text-neutral-500 text-sm">
                  <span className="material-icons animate-spin mr-1 text-base">
                    refresh
                  </span>
                  Loading…
                </div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 p-3">
                  No templates yet. Build a design you like and click
                  &ldquo;Save as template&rdquo; to add the first one.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => onPick(tpl)}
                      className="group flex flex-col items-stretch text-left rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-primary hover:shadow transition overflow-hidden bg-white dark:bg-neutral-950"
                      title={tpl.name}
                    >
                      <div className="aspect-[4/3] bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center overflow-hidden">
                        {tpl.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={tpl.thumbnailUrl}
                            alt={tpl.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="material-icons text-3xl text-neutral-400">
                            image
                          </span>
                        )}
                      </div>
                      <div className="p-2 text-xs truncate">{tpl.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
