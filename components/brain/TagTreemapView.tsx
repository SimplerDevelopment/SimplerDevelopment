'use client';

/**
 * TagTreemapView — squarified treemap of tag → note count.
 *
 * Each tile = one tag, area ∝ note count. Click → IDE filtered by tag.
 * Untagged bucket renders as a special bottom-row tile with a dashed
 * border.
 *
 * Uses the squarified treemap algorithm (van Wijk, 1999) — keeps tile
 * aspect ratios close to 1 so labels are legible. ~80 lines of layout
 * code, no external deps.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface TagCount {
  tag: string;
  count: number;
}

interface TagsCountsResponse {
  success: boolean;
  data?: {
    tags: TagCount[];
    untagged: number;
    total: number;
  };
  error?: string;
}

interface Tile {
  tag: string;
  count: number;
  x: number; // %
  y: number; // %
  w: number; // %
  h: number; // %
  isUntagged?: boolean;
}

const UNTAGGED_KEY = '__untagged__';

/**
 * Squarified treemap. Operates in [0..W] × [0..H] units (we use 100×100
 * percentages). `items` must be sorted desc by value.
 *
 * Returns rectangles {x, y, w, h, item}.
 */
function squarify<T extends { value: number }>(
  items: T[],
  x: number,
  y: number,
  w: number,
  h: number,
): Array<{ x: number; y: number; w: number; h: number; item: T }> {
  const out: Array<{ x: number; y: number; w: number; h: number; item: T }> = [];
  if (items.length === 0 || w <= 0 || h <= 0) return out;

  const total = items.reduce((s, it) => s + it.value, 0);
  if (total <= 0) return out;

  // Scale values so total area === w * h.
  const scale = (w * h) / total;
  const scaled = items.map(it => ({ ...it, _area: it.value * scale }));

  // Recurse on a working list (mutates indices).
  let cx = x;
  let cy = y;
  let cw = w;
  let ch = h;
  let i = 0;

  // Worst aspect ratio in a row laid along the shorter side.
  const worst = (row: typeof scaled, side: number): number => {
    if (row.length === 0) return Infinity;
    const sum = row.reduce((s, r) => s + r._area, 0);
    let rmax = -Infinity;
    let rmin = Infinity;
    for (const r of row) {
      if (r._area > rmax) rmax = r._area;
      if (r._area < rmin) rmin = r._area;
    }
    const s2 = sum * sum;
    const w2 = side * side;
    return Math.max((w2 * rmax) / s2, s2 / (w2 * rmin));
  };

  const layoutRow = (row: typeof scaled, side: number, alongHorizontal: boolean) => {
    const sum = row.reduce((s, r) => s + r._area, 0);
    if (sum <= 0) return;
    if (alongHorizontal) {
      // Row sits across the top of the current rect, height = sum/cw.
      const rowH = sum / cw;
      let rx = cx;
      for (const r of row) {
        const rw = r._area / rowH;
        out.push({ x: rx, y: cy, w: rw, h: rowH, item: r as unknown as T });
        rx += rw;
      }
      cy += rowH;
      ch -= rowH;
    } else {
      // Row sits down the left of the current rect, width = sum/ch.
      const rowW = sum / ch;
      let ry = cy;
      for (const r of row) {
        const rh = r._area / rowW;
        out.push({ x: cx, y: ry, w: rowW, h: rh, item: r as unknown as T });
        ry += rh;
      }
      cx += rowW;
      cw -= rowW;
    }
  };

  while (i < scaled.length) {
    const alongHorizontal = cw >= ch;
    const side = alongHorizontal ? cw : ch;
    const row: typeof scaled = [];
    let bestWorst = Infinity;
    while (i < scaled.length) {
      const candidate = [...row, scaled[i]];
      const candWorst = worst(candidate, side);
      if (candWorst <= bestWorst) {
        row.push(scaled[i]);
        bestWorst = candWorst;
        i += 1;
      } else {
        break;
      }
    }
    if (row.length === 0) break; // safety
    layoutRow(row, side, alongHorizontal);
  }

  return out;
}

/** Hash tag name → HSL hue, biased toward the brand blue (~210). */
function tagColor(tag: string, isUntagged?: boolean): { bg: string; border: string; text: string } {
  if (isUntagged) {
    return {
      bg: 'hsl(220 14% 92%)',
      border: 'hsl(220 14% 70%)',
      text: 'hsl(220 14% 28%)',
    };
  }
  let h = 0;
  for (let i = 0; i < tag.length; i += 1) {
    h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  }
  // Bias toward 180–260 (blue family); width 80°.
  const hue = 180 + (h % 80);
  const sat = 55 + ((h >> 8) % 25); // 55..80
  const light = 52 + ((h >> 16) % 14); // 52..66
  return {
    bg: `hsl(${hue} ${sat}% ${light}%)`,
    border: `hsl(${hue} ${sat}% ${Math.max(light - 18, 20)}%)`,
    text: 'white',
  };
}

interface ContainerSize {
  width: number;
  height: number;
}

export default function TagTreemapView() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });
  const [data, setData] = useState<TagsCountsResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // Fetch tag counts.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const r = await fetch('/api/portal/brain/knowledge?tags=counts');
        const json: TagsCountsResponse = await r.json().catch(() => ({ success: false }));
        if (cancelled) return;
        if (!r.ok || !json.success || !json.data) {
          setError(json.error ?? `Failed to load (HTTP ${r.status})`);
          setData(null);
        } else {
          setData(json.data);
          setError(null);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resize observer for the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build tile layout. Untagged sits in its own row at the bottom (~12% of
  // height) so it doesn't compete for area with real tags.
  const tiles = useMemo<Tile[]>(() => {
    if (!data) return [];
    const sorted = [...data.tags]
      .filter(t => t.count > 0)
      .sort((a, b) => b.count - a.count);

    const hasUntagged = data.untagged > 0;
    const taggedTotal = sorted.reduce((s, t) => s + t.count, 0);
    const untaggedRowH = hasUntagged && taggedTotal > 0 ? 12 : hasUntagged ? 100 : 0;
    const taggedRowH = 100 - untaggedRowH;

    const result: Tile[] = [];

    if (sorted.length > 0 && taggedRowH > 0) {
      const laid = squarify(
        sorted.map(t => ({ value: t.count, tag: t.tag, count: t.count })),
        0,
        0,
        100,
        taggedRowH,
      );
      for (const r of laid) {
        result.push({
          tag: r.item.tag,
          count: r.item.count,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
        });
      }
    }

    if (hasUntagged) {
      result.push({
        tag: 'Untagged',
        count: data.untagged,
        x: 0,
        y: taggedRowH,
        w: 100,
        h: untaggedRowH,
        isUntagged: true,
      });
    }

    return result;
  }, [data]);

  const onTileClick = useCallback(
    (tile: Tile) => {
      if (tile.isUntagged) {
        router.push('/portal/brain/knowledge');
        return;
      }
      router.push(`/portal/brain/knowledge?tag=${encodeURIComponent(tile.tag)}`);
    },
    [router],
  );

  const onTileKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, tile: Tile) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onTileClick(tile);
      }
    },
    [onTileClick],
  );

  // Font size: clamp between 12 and 32, scaled to tile area in pixels.
  const fontSizeFor = (tile: Tile): number => {
    const wPx = (tile.w / 100) * size.width;
    const hPx = (tile.h / 100) * size.height;
    const min = Math.min(wPx, hPx);
    const area = Math.sqrt(wPx * hPx);
    // Pick the smaller of (min/4) and (sqrt area / 6) so labels fit.
    const target = Math.min(min / 4, area / 6);
    return Math.max(12, Math.min(32, Math.round(target)));
  };

  if (loading) {
    return (
      <div ref={containerRef} className="relative w-full h-full bg-muted/30 overflow-hidden">
        <div className="absolute inset-2 grid grid-cols-4 grid-rows-3 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-md bg-muted animate-pulse"
              style={{
                gridColumn: i === 0 ? 'span 2' : i === 1 ? 'span 2' : 'span 1',
                gridRow: i === 0 ? 'span 2' : 'span 1',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-muted/30 p-6">
        <div className="text-center max-w-md">
          <span className="material-icons text-4xl text-destructive mb-2">error_outline</span>
          <p className="text-sm font-medium text-foreground mb-1">Failed to load tag treemap</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (tiles.length === 0) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-muted/30 p-6">
        <div className="text-center max-w-md">
          <span className="material-icons text-4xl text-muted-foreground mb-2">label_off</span>
          <p className="text-sm font-medium text-foreground mb-1">No tags yet</p>
          <p className="text-xs text-muted-foreground">
            Add tags to your notes to see them visualized here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-background"
      role="group"
      aria-label="Tag treemap"
    >
      {tiles.map(tile => {
        const key = tile.isUntagged ? UNTAGGED_KEY : tile.tag;
        const colors = tagColor(tile.tag, tile.isUntagged);
        const fs = fontSizeFor(tile);
        const showLabel = (tile.w / 100) * size.width > 60 && (tile.h / 100) * size.height > 24;
        const isHovered = hoveredKey === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onTileClick(tile)}
            onKeyDown={e => onTileKeyDown(e, tile)}
            onMouseEnter={() => setHoveredKey(key)}
            onMouseLeave={() => setHoveredKey(prev => (prev === key ? null : prev))}
            onFocus={() => setHoveredKey(key)}
            onBlur={() => setHoveredKey(prev => (prev === key ? null : prev))}
            title={`${tile.tag} — ${tile.count} ${tile.count === 1 ? 'note' : 'notes'}`}
            aria-label={`${tile.tag}, ${tile.count} ${tile.count === 1 ? 'note' : 'notes'}`}
            className={`absolute flex flex-col items-center justify-center text-center overflow-hidden transition-transform duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:z-20 ${
              isHovered ? 'z-10 scale-[1.015] shadow-lg' : ''
            } ${tile.isUntagged ? 'border-dashed' : ''}`}
            style={{
              left: `${tile.x}%`,
              top: `${tile.y}%`,
              width: `${tile.w}%`,
              height: `${tile.h}%`,
              backgroundColor: colors.bg,
              borderWidth: tile.isUntagged ? 2 : 1,
              borderStyle: tile.isUntagged ? 'dashed' : 'solid',
              borderColor: colors.border,
              color: colors.text,
            }}
          >
            {showLabel && (
              <>
                <span
                  className="font-semibold leading-tight px-2 truncate max-w-full"
                  style={{ fontSize: `${fs}px` }}
                >
                  {tile.tag}
                </span>
                <span
                  className="opacity-80 leading-tight"
                  style={{ fontSize: `${Math.max(11, Math.round(fs * 0.55))}px` }}
                >
                  {tile.count} {tile.count === 1 ? 'note' : 'notes'}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
