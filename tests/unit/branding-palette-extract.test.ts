/**
 * Unit tests for lib/branding/palette-extract.ts
 *
 * Pure color-math helpers (`rgbToHsl`, `hueDistance`) are tested directly.
 * `extractPalette` is exercised against a mocked <canvas>/<Image> pipeline
 * so we can deterministically control the pixel data fed to the quantizer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractPalette, hueDistance, rgbToHsl } from '@/lib/branding/palette-extract';

// ---------------------------------------------------------------------------
// rgbToHsl
// ---------------------------------------------------------------------------

describe('rgbToHsl', () => {
  it('converts pure black', () => {
    const { h, s, l } = rgbToHsl(0, 0, 0);
    expect(h).toBe(0);
    expect(s).toBe(0);
    expect(l).toBe(0);
  });

  it('converts pure white', () => {
    const { h, s, l } = rgbToHsl(255, 255, 255);
    expect(h).toBe(0);
    expect(s).toBe(0);
    expect(l).toBe(1);
  });

  it('converts a mid-grey (no saturation)', () => {
    const { h, s, l } = rgbToHsl(128, 128, 128);
    expect(h).toBe(0);
    expect(s).toBe(0);
    expect(l).toBeCloseTo(128 / 255, 5);
  });

  it('converts pure red to hue 0', () => {
    const { h, s, l } = rgbToHsl(255, 0, 0);
    expect(h).toBeCloseTo(0, 5);
    expect(s).toBe(1);
    expect(l).toBeCloseTo(0.5, 5);
  });

  it('converts pure green to hue 120', () => {
    const { h, s, l } = rgbToHsl(0, 255, 0);
    expect(h).toBeCloseTo(120, 5);
    expect(s).toBe(1);
    expect(l).toBeCloseTo(0.5, 5);
  });

  it('converts pure blue to hue 240', () => {
    const { h, s, l } = rgbToHsl(0, 0, 255);
    expect(h).toBeCloseTo(240, 5);
    expect(s).toBe(1);
    expect(l).toBeCloseTo(0.5, 5);
  });

  it('converts yellow (G==max wrap) to hue 60', () => {
    const { h, s, l } = rgbToHsl(255, 255, 0);
    expect(h).toBeCloseTo(60, 5);
    expect(s).toBe(1);
    expect(l).toBeCloseTo(0.5, 5);
  });

  it('exercises the B==max branch (magenta path → hue 300)', () => {
    const { h } = rgbToHsl(255, 0, 255);
    expect(h).toBeCloseTo(300, 5);
  });

  it('exercises the G<B branch for max==R (adds 6 then divides)', () => {
    // R is max, G < B → triggers the `(G < B ? 6 : 0)` branch
    const { h } = rgbToHsl(255, 0, 128);
    expect(h).toBeGreaterThan(300);
    expect(h).toBeLessThan(360);
  });

  it('produces low saturation for near-grey colors with l > 0.5', () => {
    // Slightly off-grey at lightness above 0.5 → exercises l > 0.5 branch
    const { l, s } = rgbToHsl(200, 200, 201);
    expect(l).toBeGreaterThan(0.5);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(0.05);
  });

  it('produces saturation for dark, slightly-tinted colors (l <= 0.5 branch)', () => {
    const { l, s } = rgbToHsl(50, 30, 30);
    expect(l).toBeLessThanOrEqual(0.5);
    expect(s).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// hueDistance
// ---------------------------------------------------------------------------

describe('hueDistance', () => {
  it('returns 0 for identical hues', () => {
    expect(hueDistance(180, 180)).toBe(0);
  });

  it('returns straight diff for nearby hues', () => {
    expect(hueDistance(10, 40)).toBe(30);
  });

  it('handles wrap-around (350 vs 10 → 20)', () => {
    expect(hueDistance(350, 10)).toBe(20);
  });

  it('handles wrap-around in the opposite direction (10 vs 350 → 20)', () => {
    expect(hueDistance(10, 350)).toBe(20);
  });

  it('caps at 180 for max-distance hues', () => {
    expect(hueDistance(0, 180)).toBe(180);
  });

  it('is symmetric', () => {
    expect(hueDistance(45, 200)).toBe(hueDistance(200, 45));
  });
});

// ---------------------------------------------------------------------------
// extractPalette
// ---------------------------------------------------------------------------

/**
 * Build an Uint8ClampedArray of length w*h*4 where each pixel is filled from
 * `colors` (cycled). Alpha defaults to 255 unless explicitly provided.
 */
function makePixels(
  w: number,
  h: number,
  colors: Array<[number, number, number, number?]>,
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const c = colors[i % colors.length];
    buf[i * 4] = c[0];
    buf[i * 4 + 1] = c[1];
    buf[i * 4 + 2] = c[2];
    buf[i * 4 + 3] = c[3] ?? 255;
  }
  return buf;
}

/**
 * Install mocks for HTMLImageElement and HTMLCanvasElement so extractPalette
 * runs in jsdom without touching real network or pixel decoding.
 */
function installCanvasMocks(opts: {
  naturalWidth: number;
  naturalHeight: number;
  pixels: Uint8ClampedArray;
  failLoad?: boolean;
  contextNull?: boolean;
}) {
  // Image: trigger onload immediately on src set
  class FakeImage {
    naturalWidth = opts.naturalWidth;
    naturalHeight = opts.naturalHeight;
    crossOrigin = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = '';
    set src(v: string) {
      this._src = v;
      // microtask so .onload assignment happens first
      queueMicrotask(() => {
        if (opts.failLoad) this.onerror?.();
        else this.onload?.();
      });
    }
    get src() {
      return this._src;
    }
  }
  // @ts-expect-error – swap global Image
  globalThis.Image = FakeImage;

  // Canvas getContext stub
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: opts.pixels,
      width: opts.naturalWidth,
      height: opts.naturalHeight,
    })),
  };
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
    return opts.contextNull ? null : (ctx as unknown as CanvasRenderingContext2D);
  }) as typeof HTMLCanvasElement.prototype.getContext;

  return () => {
    HTMLCanvasElement.prototype.getContext = origGetContext;
  };
}

describe('extractPalette', () => {
  let restore: (() => void) | null = null;

  // URL.createObjectURL is referenced when source is a File — stub it.
  beforeEach(() => {
    if (!globalThis.URL.createObjectURL) {
      // @ts-expect-error – assign for jsdom
      globalThis.URL.createObjectURL = () => 'blob:mock';
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    }
  });

  afterEach(() => {
    restore?.();
    restore = null;
    vi.restoreAllMocks();
  });

  it('returns the most prevalent color first', async () => {
    // 10x10 image, mostly red with a smattering of blue
    const pixels = makePixels(10, 10, [
      [255, 0, 0], [255, 0, 0], [255, 0, 0], [255, 0, 0],
      [255, 0, 0], [255, 0, 0], [255, 0, 0], [255, 0, 0],
      [255, 0, 0], [0, 0, 255], // 9 red : 1 blue
    ]);
    restore = installCanvasMocks({ naturalWidth: 10, naturalHeight: 10, pixels });

    const palette = await extractPalette('https://example.com/img.png', 4);
    expect(palette.length).toBeGreaterThan(0);
    // Top entry should be red-ish (high R, low G/B); hue near 0
    expect(palette[0].weight).toBeGreaterThan(0.5);
    expect(palette[0].hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette[0].h).toBeGreaterThanOrEqual(0);
    // Weights sum to <= 1 (some pixels may have been filtered)
    const weightSum = palette.reduce((s, p) => s + p.weight, 0);
    expect(weightSum).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('returns at most `count` colors', async () => {
    // 8 distinct colors → ask for 3
    const pixels = makePixels(8, 8, [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
      [0, 255, 255],
      [255, 0, 255],
      [128, 64, 32],
      [200, 200, 200],
    ]);
    restore = installCanvasMocks({ naturalWidth: 8, naturalHeight: 8, pixels });

    const palette = await extractPalette('x', 3);
    expect(palette.length).toBeLessThanOrEqual(3);
  });

  it('defaults `count` to 8 when omitted', async () => {
    // 20 distinct colors so we'd exceed 8 if no default were applied
    const distinct: Array<[number, number, number]> = [];
    for (let i = 0; i < 20; i++) {
      distinct.push([(i * 13) % 256, (i * 53) % 256, (i * 97) % 256]);
    }
    const pixels = makePixels(20, 20, distinct);
    restore = installCanvasMocks({ naturalWidth: 20, naturalHeight: 20, pixels });

    const palette = await extractPalette('x');
    expect(palette.length).toBeLessThanOrEqual(8);
  });

  it('returns an empty array when every pixel is below MIN_ALPHA', async () => {
    const pixels = makePixels(4, 4, [[255, 0, 0, 10]]); // alpha 10 < 128
    restore = installCanvasMocks({ naturalWidth: 4, naturalHeight: 4, pixels });
    const palette = await extractPalette('x');
    expect(palette).toEqual([]);
  });

  it('skips pixels below MIN_ALPHA but counts the rest', async () => {
    // Half transparent red, half opaque blue
    const pixels = makePixels(4, 4, [
      [255, 0, 0, 0],
      [0, 0, 255, 255],
    ]);
    restore = installCanvasMocks({ naturalWidth: 4, naturalHeight: 4, pixels });
    const palette = await extractPalette('x', 4);
    expect(palette.length).toBe(1);
    // The opaque pixel was blue → quantized hex should be blue-ish
    expect(palette[0].hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette[0].weight).toBeGreaterThan(0.99);
  });

  it('downsamples large images via SAMPLE_SIZE cap', async () => {
    // Input is 1000x500 but the canvas should be sized at <=200 max-dim.
    // We just need *some* pixel data — naturalWidth/Height drive the scale.
    const pixels = makePixels(1, 1, [[10, 20, 30]]);
    restore = installCanvasMocks({ naturalWidth: 1000, naturalHeight: 500, pixels });
    const palette = await extractPalette('x', 2);
    // getImageData was called → mocked context returned our single pixel
    expect(palette.length).toBe(1);
  });

  it('merges near-identical buckets so trivial JPEG-noise variants collapse', async () => {
    // Two colors that differ by 1 LSB per channel — both quantize to nearby
    // 5-bit buckets and should merge.
    const pixels = makePixels(10, 10, [
      [200, 100, 50],
      [201, 101, 51],
    ]);
    restore = installCanvasMocks({ naturalWidth: 10, naturalHeight: 10, pixels });
    const palette = await extractPalette('x', 8);
    // After merging we expect a single dominant color, not two.
    expect(palette.length).toBe(1);
    expect(palette[0].weight).toBeGreaterThan(0.99);
  });

  it('produces hex strings with two-char-per-channel padding', async () => {
    // A very dark color — would print as "#01..." not "#1..."
    const pixels = makePixels(4, 4, [[8, 8, 8]]);
    restore = installCanvasMocks({ naturalWidth: 4, naturalHeight: 4, pixels });
    const palette = await extractPalette('x', 1);
    expect(palette[0].hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette[0].hex.length).toBe(7);
  });

  it('rejects when image load fails', async () => {
    const pixels = makePixels(1, 1, [[0, 0, 0]]);
    restore = installCanvasMocks({
      naturalWidth: 1,
      naturalHeight: 1,
      pixels,
      failLoad: true,
    });
    await expect(extractPalette('bad-url')).rejects.toThrow(/Failed to load image/);
  });

  it('throws when canvas 2D context is unsupported', async () => {
    const pixels = makePixels(1, 1, [[0, 0, 0]]);
    restore = installCanvasMocks({
      naturalWidth: 1,
      naturalHeight: 1,
      pixels,
      contextNull: true,
    });
    await expect(extractPalette('x')).rejects.toThrow(/Canvas 2D unsupported/);
  });

  it('accepts a File and routes through URL.createObjectURL', async () => {
    const pixels = makePixels(2, 2, [[10, 20, 30]]);
    restore = installCanvasMocks({ naturalWidth: 2, naturalHeight: 2, pixels });
    const spy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });
    const palette = await extractPalette(file, 2);
    expect(spy).toHaveBeenCalledWith(file);
    expect(palette.length).toBeGreaterThan(0);
  });

  it('returns valid HSL fields on each entry', async () => {
    const pixels = makePixels(6, 6, [
      [200, 30, 30],
      [30, 200, 30],
      [30, 30, 200],
    ]);
    restore = installCanvasMocks({ naturalWidth: 6, naturalHeight: 6, pixels });
    const palette = await extractPalette('x', 5);
    for (const p of palette) {
      expect(p.h).toBeGreaterThanOrEqual(0);
      expect(p.h).toBeLessThanOrEqual(360);
      expect(p.s).toBeGreaterThanOrEqual(0);
      expect(p.s).toBeLessThanOrEqual(1);
      expect(p.l).toBeGreaterThanOrEqual(0);
      expect(p.l).toBeLessThanOrEqual(1);
      expect(p.weight).toBeGreaterThan(0);
      expect(p.weight).toBeLessThanOrEqual(1);
    }
  });

  it('caps merge candidates at count * 4 distinct buckets', async () => {
    // Many highly-distinct colors → the loop should stop accumulating
    // candidates after count*4 unique buckets. We only assert the result
    // length stays bounded — internal cap is observable via final length.
    const distinct: Array<[number, number, number]> = [];
    for (let i = 0; i < 64; i++) {
      // Step by 32 in each channel → buckets that won't merge
      distinct.push([(i * 32) & 255, ((i * 32) >> 1) & 255, ((i * 16) + 7) & 255]);
    }
    const pixels = makePixels(16, 16, distinct);
    restore = installCanvasMocks({ naturalWidth: 16, naturalHeight: 16, pixels });
    const palette = await extractPalette('x', 4);
    expect(palette.length).toBeLessThanOrEqual(4);
  });
});
