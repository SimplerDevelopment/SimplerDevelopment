/**
 * Client-side palette extraction from an image.
 *
 * Quantizes pixels to a small color space, counts occurrences, returns the
 * most prevalent colors. Pure client code — uses <canvas> to read pixels.
 *
 * Algorithm: 5-bit-per-channel quantization (32³ = 32,768 possible buckets).
 * Fast, deterministic, and gives "close enough" palette suggestions for
 * brand-theming — we're not chasing photographic fidelity.
 */

export interface PaletteColor {
  hex: string;
  /** Prevalence 0-1 across sampled pixels */
  weight: number;
  /** HSL for downstream heuristics */
  h: number;
  s: number;
  l: number;
}

/** Max dimension used for sampling. Bigger = slower, not noticeably better. */
const SAMPLE_SIZE = 200;

/** Pixels with alpha below this are skipped. */
const MIN_ALPHA = 128;

export async function extractPalette(source: File | string, count = 8): Promise<PaletteColor[]> {
  const img = await loadImage(source);

  const scale = Math.min(1, SAMPLE_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D unsupported');
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // 5-bit quantization: 0-7 bits per channel
  const counts = new Map<number, number>();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < MIN_ALPHA) continue;
    const r = data[i] >> 3;
    const g = data[i + 1] >> 3;
    const b = data[i + 2] >> 3;
    const key = (r << 10) | (g << 5) | b;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }

  if (total === 0) return [];

  // Merge near-identical buckets (within ~1 step in any channel) to avoid
  // spurious duplicates from JPEG noise.
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const merged: Array<{ r: number; g: number; b: number; count: number }> = [];
  const MERGE_DISTANCE = 2;
  for (const [key, c] of sorted) {
    const r = (key >> 10) & 31;
    const g = (key >> 5) & 31;
    const b = key & 31;
    const existing = merged.find(
      (m) =>
        Math.abs(m.r - r) <= MERGE_DISTANCE &&
        Math.abs(m.g - g) <= MERGE_DISTANCE &&
        Math.abs(m.b - b) <= MERGE_DISTANCE,
    );
    if (existing) {
      // Weighted average toward existing (more prevalent) bucket
      const w2 = existing.count + c;
      existing.r = Math.round((existing.r * existing.count + r * c) / w2);
      existing.g = Math.round((existing.g * existing.count + g * c) / w2);
      existing.b = Math.round((existing.b * existing.count + b * c) / w2);
      existing.count = w2;
    } else {
      merged.push({ r, g, b, count: c });
    }
    if (merged.length >= count * 4) break; // enough candidates
  }

  return merged
    .slice(0, count)
    .map(({ r, g, b, count: c }) => {
      // Re-expand to 0-255, centered in the bucket
      const R = (r << 3) | (r >> 2);
      const G = (g << 3) | (g >> 2);
      const B = (b << 3) | (b >> 2);
      const { h, s, l } = rgbToHsl(R, G, B);
      return {
        hex: rgbToHex(R, G, B),
        weight: c / total,
        h,
        s,
        l,
      };
    });
}

function loadImage(source: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = typeof source === 'string' ? source : URL.createObjectURL(source);
  });
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case R:
        h = (G - B) / d + (G < B ? 6 : 0);
        break;
      case G:
        h = (B - R) / d + 2;
        break;
      case B:
        h = (R - G) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

/** Hue distance in degrees, handling wrap-around. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}
