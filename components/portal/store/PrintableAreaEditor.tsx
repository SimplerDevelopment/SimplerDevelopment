'use client';

/**
 * Drag-to-set printable area for a designable product side.
 *
 * The stored bounds (printableX/Y/Width/Height) are pixel coordinates in the
 * MOCKUP IMAGE's own space — not the displayed size, and not the garment's.
 * lib/printing/renderPrintFile.ts maps the customer's canvas out of that space
 * before cropping, so a wrong number here produces a print file that looks
 * correct in the designer and arrives misaligned on the garment. That failure is
 * invisible until something physical comes back wrong, which is exactly why this
 * exists instead of four number inputs.
 *
 * All interaction happens in DISPLAY space and converts to natural space on
 * commit, via `scale = displayWidth / naturalWidth`. The image is rendered with
 * width:100% and height:auto, so one scale factor covers both axes.
 *
 * Pointer events rather than a drag library: the whole interaction is ~60 lines
 * and needs exact control of the scale conversion, which a generic dragger would
 * only get in the way of.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Bounds {
  printableX: number;
  printableY: number;
  printableWidth: number | null;
  printableHeight: number | null;
}

type DragMode = null | { kind: 'move' | 'resize'; startX: number; startY: number; orig: Bounds };

const MIN_PX = 20; // never let the box collapse to something un-grabbable

export function PrintableAreaEditor({
  imageUrl,
  value,
  onChange,
}: {
  imageUrl: string;
  value: Bounds;
  onChange: (b: Bounds) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [displayW, setDisplayW] = useState(0);
  const [drag, setDrag] = useState<DragMode>(null);

  // Track the rendered width so the scale factor stays correct across resizes.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDisplayW(el.clientWidth));
    ro.observe(el);
    setDisplayW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scale = natural && displayW ? displayW / natural.w : 0;

  // Fall back to the full image when width/height are null — that is what null
  // means downstream ("printable_width: null = full image" in the schema).
  const w = value.printableWidth ?? natural?.w ?? 0;
  const h = value.printableHeight ?? natural?.h ?? 0;

  const commit = useCallback(
    (next: Bounds) => {
      if (!natural) return;
      // Clamp into the image. A box hanging off the edge would crop to
      // transparent pixels in the print file rather than erroring.
      const cw = Math.max(MIN_PX, Math.min(next.printableWidth ?? natural.w, natural.w));
      const ch = Math.max(MIN_PX, Math.min(next.printableHeight ?? natural.h, natural.h));
      onChange({
        printableX: Math.round(Math.max(0, Math.min(next.printableX, natural.w - cw))),
        printableY: Math.round(Math.max(0, Math.min(next.printableY, natural.h - ch))),
        printableWidth: Math.round(cw),
        printableHeight: Math.round(ch),
      });
    },
    [natural, onChange],
  );

  useEffect(() => {
    if (!drag || !scale) return;
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - drag.startX) / scale;
      const dy = (e.clientY - drag.startY) / scale;
      if (drag.kind === 'move') {
        commit({ ...drag.orig, printableX: drag.orig.printableX + dx, printableY: drag.orig.printableY + dy });
      } else {
        commit({
          ...drag.orig,
          printableWidth: (drag.orig.printableWidth ?? 0) + dx,
          printableHeight: (drag.orig.printableHeight ?? 0) + dy,
        });
      }
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag, scale, commit]);

  const start = (kind: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      kind,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...value, printableWidth: w, printableHeight: h },
    });
  };

  return (
    <div className="space-y-2">
      <div ref={wrapRef} className="relative select-none overflow-hidden rounded-lg border border-border bg-muted/20">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external mockup URLs; next/image would need per-host config */}
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          className="block h-auto w-full"
          onLoad={(e) => {
            const el = e.currentTarget;
            setNatural({ w: el.naturalWidth, h: el.naturalHeight });
          }}
          draggable={false}
        />

        {natural && scale > 0 && (
          <div
            role="presentation"
            onPointerDown={start('move')}
            className="absolute cursor-move border-2 border-dashed border-primary bg-primary/10"
            style={{
              left: value.printableX * scale,
              top: value.printableY * scale,
              width: w * scale,
              height: h * scale,
            }}
          >
            <div
              role="presentation"
              onPointerDown={start('resize')}
              title="Drag to resize"
              className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-background bg-primary"
            />
          </div>
        )}
      </div>

      {natural ? (
        <p className="font-mono text-xs text-muted-foreground">
          x {value.printableX} · y {value.printableY} · {w}×{h} px
          <span className="ml-2 opacity-60">(image {natural.w}×{natural.h})</span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Loading mockup…</p>
      )}
    </div>
  );
}
