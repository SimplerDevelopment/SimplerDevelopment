'use client';

import React, { useEffect, useState } from 'react';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import type { DesignerSurface } from '@/lib/designer/types';

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  surfaces: DesignerSurface[];
  productName: string;
  /** Final-price string to show under the preview (e.g. "$125.00"). */
  totalLabel?: string | null;
  quantity: number;
  onConfirm?: () => void;
}

const TINT_OPTIONS: Array<{ label: string; hex: string | null }> = [
  { label: 'None', hex: null },
  { label: 'White', hex: '#ffffff' },
  { label: 'Heather Grey', hex: '#c9cbcd' },
  { label: 'Black', hex: '#111111' },
  { label: 'Navy', hex: '#1f2a44' },
  { label: 'Royal Blue', hex: '#1d4ed8' },
  { label: 'Forest Green', hex: '#1f5132' },
  { label: 'Red', hex: '#b71c1c' },
  { label: 'Burgundy', hex: '#65161f' },
  { label: 'Mustard', hex: '#c9a227' },
];

/**
 * Final-review modal that shows what the customer's design actually looks
 * like rendered cleanly — no print-area dashes, no snap guides — across
 * every configured surface. Mirrors what they would see on the printed
 * product. Capture happens with canvas.toDataURL after temporarily hiding
 * the print-area overlay + guides, same approach as ExportButton.
 */
export default function PreviewModal({
  open,
  onClose,
  surfaces,
  productName,
  totalLabel,
  quantity,
  onConfirm,
}: PreviewModalProps) {
  const canvas = useCanvasStore((s) => s.canvas);
  const activeSurface = useCanvasStore((s) => s.activeSurface);
  const setActiveSurface = useCanvasStore((s) => s.setActiveSurface);
  // The store exposes per-surface layer storage so we can render thumbnails
  // even for surfaces the customer hasn't visited yet.
  const layersBySurface = useCanvasStore((s) => s.layersBySurface);
  const mockupTint = useCanvasStore((s) => s.mockupTint);
  const setMockupTint = useCanvasStore((s) => s.setMockupTint);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (typeof document !== 'undefined') {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // For each surface, switch the active surface (which triggers DesignCanvas
  // to repaint with that surface's layers), capture toDataURL, then restore
  // the original active surface. Done sequentially to avoid two repaints
  // colliding. Print-area overlay and guides are hidden during capture.
  useEffect(() => {
    if (!open || !canvas) return;
    let cancelled = false;
    const originalSurface = activeSurface;

    const captureOne = (slug: string): Promise<string> =>
      new Promise((resolve) => {
        setActiveSurface(slug);
        const expectedLayerCount =
          useCanvasStore.getState().layersBySurface[slug]?.length ?? 0;

        // Fabric layer sync is async — image layers fetch + decode before they
        // land on the canvas. A fixed 250ms wait isn't enough for surfaces with
        // image layers, which left the Front pane stuck on a spinner. Poll
        // (capped) until the canvas has the expected user-layer count, then
        // capture. Falls back after ~3 s so a slow image can't hang the modal.
        const POLL_MS = 60;
        const MAX_POLLS = 50;
        let polls = 0;

        const isUserObject = (obj: unknown): boolean => {
          const meta = obj as {
            id?: string;
            _designerPrintArea?: boolean;
            _designerGuide?: string;
            excludeFromExport?: boolean;
            data?: { id?: string };
          };
          if (meta.id === 'designer-canvas-background') return false;
          if (meta._designerPrintArea) return false;
          if (meta._designerGuide) return false;
          if (meta.excludeFromExport) return false;
          return Boolean(meta.data?.id);
        };

        const captureNow = () => {
          try {
            const hidden: Array<{ obj: { visible?: boolean }; was: boolean | undefined }> = [];
            canvas.getObjects().forEach((obj) => {
              const tagged = obj as unknown as {
                visible?: boolean;
                _designerPrintArea?: boolean;
                _designerGuide?: boolean;
                excludeFromExport?: boolean;
              };
              if (tagged._designerPrintArea || tagged._designerGuide || tagged.excludeFromExport) {
                hidden.push({ obj: tagged, was: tagged.visible });
                tagged.visible = false;
              }
            });
            canvas.requestRenderAll();
            const data = canvas.toDataURL({
              format: 'png',
              multiplier: 1,
              quality: 0.92,
            });
            hidden.forEach(({ obj, was }) => {
              obj.visible = was;
            });
            canvas.requestRenderAll();
            resolve(data);
          } catch {
            resolve('');
          }
        };

        const tick = () => {
          if (cancelled) return resolve('');
          const userObjects = canvas.getObjects().filter(isUserObject).length;
          if (userObjects >= expectedLayerCount) {
            // One more frame so any pending renderAll is flushed.
            requestAnimationFrame(captureNow);
            return;
          }
          if (++polls >= MAX_POLLS) {
            // Best-effort capture even if we never matched the count.
            requestAnimationFrame(captureNow);
            return;
          }
          setTimeout(tick, POLL_MS);
        };

        // Give React/effects one frame to schedule the surface swap before we
        // start polling, otherwise the first read sees the previous surface.
        requestAnimationFrame(() => setTimeout(tick, POLL_MS));
      });

    (async () => {
      const next: Record<string, string> = {};
      for (const s of surfaces) {
        if (cancelled) break;
        // Skip empty surfaces — show a placeholder card instead.
        if (!layersBySurface[s.slug]?.length) continue;
        // eslint-disable-next-line no-await-in-loop
        next[s.slug] = await captureOne(s.slug);
      }
      if (!cancelled) {
        setPreviews(next);
        // Restore the customer's original active surface so closing the
        // modal lands them where they were editing.
        setActiveSurface(originalSurface);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Re-run when the customer flips shirt colour from the swatch strip below
    // so the previews repaint without forcing the modal to close+open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mockupTint]);

  // Reset stale previews while the next batch captures, so the spinner
  // re-appears instead of showing the prior tint's image.
  useEffect(() => {
    if (!open) return;
    setPreviews({});
  }, [open, mockupTint]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Design preview"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-background border border-border shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Preview your {productName}
            </h2>
            <p className="text-xs text-muted-foreground">
              This is what will be printed — print area, guides, and rulers are hidden.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>

        {/* Tint swatch strip — lets the customer flip the preview through
            every shirt colour without leaving the modal. Mirrors the
            ProductColorPicker palette so the experience is consistent. */}
        <div className="px-5 pt-3 pb-2 border-b border-border flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Shirt colour
          </span>
          <div className="inline-flex flex-wrap items-center gap-1">
            {TINT_OPTIONS.map((opt) => {
              const active = (opt.hex ?? null) === (mockupTint ?? null);
              const isNone = opt.hex === null;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setMockupTint(opt.hex)}
                  aria-pressed={active}
                  title={opt.label}
                  aria-label={opt.label}
                  className={`relative w-6 h-6 rounded-full border-2 transition-shadow ${
                    active
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-border hover:border-foreground/40'
                  }`}
                  style={{
                    backgroundColor: isNone ? 'transparent' : opt.hex ?? undefined,
                    backgroundImage: isNone
                      ? 'repeating-linear-gradient(45deg, transparent 0 4px, currentColor 4px 5px)'
                      : undefined,
                    color: 'rgba(120,120,120,0.55)',
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="p-5 grid gap-4 grid-cols-1 sm:grid-cols-2">
          {surfaces.map((s) => {
            const url = previews[s.slug];
            const empty = !layersBySurface[s.slug]?.length;
            return (
              <div
                key={s.slug}
                className="rounded-lg border border-border overflow-hidden bg-muted/30"
              >
                <div className="px-3 py-2 flex items-center justify-between border-b border-border">
                  <span className="text-sm font-medium text-foreground">{s.name}</span>
                  {empty && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Empty
                    </span>
                  )}
                </div>
                <div className="aspect-[4/3] flex items-center justify-center bg-white">
                  {empty ? (
                    <span className="material-icons text-3xl text-muted-foreground/50">
                      block
                    </span>
                  ) : url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={`${s.name} preview`}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="material-icons animate-spin text-muted-foreground">
                      refresh
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-muted/20">
          <div className="text-sm text-muted-foreground">
            {totalLabel && (
              <span>
                <span className="font-semibold text-foreground tabular-nums">
                  {totalLabel}
                </span>
                <span className="ml-1">
                  for {quantity} {quantity === 1 ? 'piece' : 'pieces'}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md border border-border bg-background hover:bg-muted text-foreground"
            >
              Keep editing
            </button>
            {onConfirm && (
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <span className="material-icons text-sm align-middle mr-1">
                  shopping_cart
                </span>
                Add to cart
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
