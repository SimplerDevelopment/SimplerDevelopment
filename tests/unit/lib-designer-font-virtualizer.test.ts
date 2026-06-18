// @vitest-environment jsdom
/**
 * Unit tests for lib/designer/fontVirtualizer.ts
 *
 * Exports under test:
 *   - loadGoogleFont       (injects <link>, calls document.fonts API)
 *   - getFontVirtualizer   (singleton factory, optional canvas wiring)
 *   - initializeFontVirtualization (thin wrapper over getFontVirtualizer)
 *   - FontVirtualizer class methods:
 *       registerGoogleFont, unregisterFont, hasVirtualizedFont,
 *       updateVirtualizedFont, clear, setCanvas
 *
 * The module uses `'use client'` (Next.js directive) but has no React deps —
 * jsdom provides document + window so font injection tests can run.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Canvas, FabricText } from 'fabric';

// ── document.fonts stub ───────────────────────────────────────────────────────
// jsdom does not implement FontFaceSet — stub it before the module loads.
// Class must be declared before it is instantiated.
const mockFontsLoad = vi.fn().mockResolvedValue([]);

class MockFontFaceSet {
  load = mockFontsLoad;
  ready: Promise<MockFontFaceSet> = Promise.resolve(this);
}

Object.defineProperty(document, 'fonts', {
  value: new MockFontFaceSet(),
  writable: true,
  configurable: true,
});

// ── module import ─────────────────────────────────────────────────────────────
// Import AFTER stubbing document.fonts so the module's loadedFonts set starts
// empty and the stub is in place.
const {
  loadGoogleFont,
  getFontVirtualizer,
  initializeFontVirtualization,
  FontVirtualizer,
} = await import('@/lib/designer/fontVirtualizer');

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal FabricText-like object. We only need `set` and `fontFamily`
 * to exercise the virtualizer logic.
 */
function makeFabricText(family = 'Arial'): FabricText {
  const obj = {
    fontFamily: family,
    set: vi.fn().mockImplementation(function (
      this: Record<string, unknown>,
      props: Record<string, unknown>,
    ) {
      Object.assign(this, props);
    }),
  } as unknown as FabricText;
  return obj;
}

/**
 * Build a minimal Canvas mock that exposes `renderAll`.
 */
function makeFabricCanvas(): Canvas {
  return {
    renderAll: vi.fn().mockReturnValue(undefined),
  } as unknown as Canvas;
}

/** Clear <link data-font-family> tags between tests. */
function clearFontLinks() {
  document.querySelectorAll('link[data-font-family]').forEach((el) => el.remove());
}

// ── loadGoogleFont ────────────────────────────────────────────────────────────

describe('loadGoogleFont', () => {
  beforeEach(() => {
    clearFontLinks();
    mockFontsLoad.mockClear();
    // Reset the module-level loadedFonts cache by re-importing won't work in
    // ESM (cached). Instead we work around it by using unique family names per
    // test group so idempotency behaviour is tested explicitly.
  });

  it('injects a <link> tag into document.head for a new font', async () => {
    await loadGoogleFont({ family: 'Roboto_test_1' });
    const link = document.querySelector('link[data-font-family="Roboto_test_1"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('rel')).toBe('stylesheet');
  });

  it('href encodes spaces as + in family name', async () => {
    await loadGoogleFont({ family: 'Open Sans_test_1' });
    const link = document.querySelector('link[data-font-family="Open Sans_test_1"]');
    expect(link?.getAttribute('href')).toContain('Open+Sans_test_1');
  });

  it('uses provided variants in the URL', async () => {
    await loadGoogleFont({ family: 'Lato_test_1', variants: ['400', '700', '900'] });
    const link = document.querySelector('link[data-font-family="Lato_test_1"]');
    expect(link?.getAttribute('href')).toContain('400,700,900');
  });

  it('defaults to wght@400 when variants is not provided', async () => {
    await loadGoogleFont({ family: 'Merriweather_test_1' });
    const link = document.querySelector('link[data-font-family="Merriweather_test_1"]');
    expect(link?.getAttribute('href')).toContain('wght@400');
  });

  it('defaults to wght@400 when variants is an empty array', async () => {
    await loadGoogleFont({ family: 'Playfair_test_1', variants: [] });
    const link = document.querySelector('link[data-font-family="Playfair_test_1"]');
    expect(link?.getAttribute('href')).toContain('wght@400');
  });

  it('is idempotent — does not insert duplicate <link> on second call', async () => {
    await loadGoogleFont({ family: 'Nunito_test_1' });
    await loadGoogleFont({ family: 'Nunito_test_1' });
    const links = document.querySelectorAll('link[data-font-family="Nunito_test_1"]');
    // First call inserts the link; second call exits early (already in loadedFonts set).
    expect(links.length).toBe(1);
  });

  it('calls document.fonts.load with correct size and family', async () => {
    mockFontsLoad.mockClear();
    await loadGoogleFont({ family: 'Oswald_test_1' });
    expect(mockFontsLoad).toHaveBeenCalledWith('16px "Oswald_test_1"');
  });

  it('resolves without throwing when document.fonts.load rejects (non-fatal)', async () => {
    mockFontsLoad.mockRejectedValueOnce(new Error('font load failed'));
    await expect(loadGoogleFont({ family: 'ErrorFont_test_1' })).resolves.toBeUndefined();
  });

  it('skips DOM injection when window is undefined', async () => {
    // Stub window away — loadGoogleFont guards with typeof window === 'undefined'
    const original = globalThis.window;
    // @ts-expect-error — intentionally removing window for this test
    delete globalThis.window;
    await expect(loadGoogleFont({ family: 'NoWindow_test_1' })).resolves.toBeUndefined();
    globalThis.window = original;
    // Confirm no link was injected
    const link = document.querySelector('link[data-font-family="NoWindow_test_1"]');
    expect(link).toBeNull();
  });
});

// ── FontVirtualizer — registerGoogleFont / hasVirtualizedFont / unregisterFont

describe('FontVirtualizer — register / unregister', () => {
  let virtualizer: InstanceType<typeof FontVirtualizer>;

  beforeEach(() => {
    clearFontLinks();
    mockFontsLoad.mockClear();
    // Use a fresh instance per test to avoid cross-test state.
    virtualizer = new FontVirtualizer();
  });

  it('hasVirtualizedFont returns false before registration', () => {
    expect(virtualizer.hasVirtualizedFont('layer-1')).toBe(false);
  });

  it('hasVirtualizedFont returns true after registerGoogleFont', async () => {
    const text = makeFabricText();
    await virtualizer.registerGoogleFont('layer-1', text, { family: 'Roboto_reg_1' });
    expect(virtualizer.hasVirtualizedFont('layer-1')).toBe(true);
  });

  it('locks fontFamily property on the fabric object after registration', async () => {
    const text = makeFabricText('Arial');
    await virtualizer.registerGoogleFont('layer-2', text, { family: 'Impact_lock' });

    // fontFamily getter should return the locked family
    expect(text.fontFamily).toBe('Impact_lock');

    // Attempt to overwrite should be ignored
    text.fontFamily = 'SomeOtherFont';
    expect(text.fontFamily).toBe('Impact_lock');
  });

  it('unregisterFont removes the layer from tracking', async () => {
    const text = makeFabricText();
    await virtualizer.registerGoogleFont('layer-3', text, { family: 'Tahoma_unreg' });
    expect(virtualizer.hasVirtualizedFont('layer-3')).toBe(true);
    virtualizer.unregisterFont('layer-3');
    expect(virtualizer.hasVirtualizedFont('layer-3')).toBe(false);
  });

  it('unregisterFont restores normal fontFamily writable property', async () => {
    const text = makeFabricText('Arial');
    await virtualizer.registerGoogleFont('layer-4', text, { family: 'Georgia_restore' });

    virtualizer.unregisterFont('layer-4');

    // After unregister the property descriptor should be writable again
    const descriptor = Object.getOwnPropertyDescriptor(text, 'fontFamily');
    expect(descriptor?.writable).toBe(true);
  });

  it('unregisterFont is a no-op for unknown layerId', () => {
    // Should not throw
    expect(() => virtualizer.unregisterFont('unknown-layer')).not.toThrow();
  });

  it('registers multiple layers independently', async () => {
    const text1 = makeFabricText();
    const text2 = makeFabricText();
    await virtualizer.registerGoogleFont('layerA', text1, { family: 'Font_A' });
    await virtualizer.registerGoogleFont('layerB', text2, { family: 'Font_B' });

    expect(virtualizer.hasVirtualizedFont('layerA')).toBe(true);
    expect(virtualizer.hasVirtualizedFont('layerB')).toBe(true);
    expect(text1.fontFamily).toBe('Font_A');
    expect(text2.fontFamily).toBe('Font_B');
  });
});

// ── FontVirtualizer — updateVirtualizedFont ───────────────────────────────────

describe('FontVirtualizer — updateVirtualizedFont', () => {
  let virtualizer: InstanceType<typeof FontVirtualizer>;

  beforeEach(() => {
    clearFontLinks();
    mockFontsLoad.mockClear();
    virtualizer = new FontVirtualizer();
  });

  it('updates the locked font family to the new font', async () => {
    const text = makeFabricText();
    await virtualizer.registerGoogleFont('layer-upd', text, { family: 'OldFont_upd' });
    expect(text.fontFamily).toBe('OldFont_upd');

    await virtualizer.updateVirtualizedFont('layer-upd', { family: 'NewFont_upd' });
    // set() is called with the new fontFamily on the fabricObject
    const setText = text.set as ReturnType<typeof vi.fn>;
    const allSetCalls = setText.mock.calls.map((c: unknown[]) => c[0]) as Array<
      Record<string, unknown>
    >;
    const updateCalls = allSetCalls.filter(
      (c) => typeof c === 'object' && c !== null && c.fontFamily === 'NewFont_upd',
    );
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it('update calls set({ fontFamily }) with new family on the fabric object', async () => {
    const text = makeFabricText();
    await virtualizer.registerGoogleFont('layer-set', text, { family: 'OldFont_set' });
    const setText = text.set as ReturnType<typeof vi.fn>;
    setText.mockClear();

    await virtualizer.updateVirtualizedFont('layer-set', { family: 'UpdatedFont_set' });

    const setCalls = setText.mock.calls.map((c: unknown[]) => c[0]);
    const fontFamilyCalls = setCalls.filter(
      (c: unknown) => typeof c === 'object' && c !== null && 'fontFamily' in (c as object),
    );
    expect(fontFamilyCalls.length).toBeGreaterThan(0);
  });

  it('is a no-op for unknown layerId', async () => {
    // Should not throw
    await expect(
      virtualizer.updateVirtualizedFont('nonexistent', { family: 'X' }),
    ).resolves.toBeUndefined();
  });
});

// ── FontVirtualizer — clear ───────────────────────────────────────────────────

describe('FontVirtualizer — clear', () => {
  it('removes all registered layers', async () => {
    const virtualizer = new FontVirtualizer();
    const text1 = makeFabricText();
    const text2 = makeFabricText();
    await virtualizer.registerGoogleFont('c1', text1, { family: 'Font_clear_1' });
    await virtualizer.registerGoogleFont('c2', text2, { family: 'Font_clear_2' });

    virtualizer.clear();

    expect(virtualizer.hasVirtualizedFont('c1')).toBe(false);
    expect(virtualizer.hasVirtualizedFont('c2')).toBe(false);
  });

  it('devirtualizes fabric objects on clear', async () => {
    const virtualizer = new FontVirtualizer();
    const text = makeFabricText('Arial');
    await virtualizer.registerGoogleFont('layer-clear', text, { family: 'Font_devirt' });

    // While virtualized, fontFamily is locked
    expect(text.fontFamily).toBe('Font_devirt');

    virtualizer.clear();

    // After clear, the property descriptor should be writable again
    const descriptor = Object.getOwnPropertyDescriptor(text, 'fontFamily');
    expect(descriptor?.writable).toBe(true);
  });

  it('clear on an empty virtualizer does not throw', () => {
    const virtualizer = new FontVirtualizer();
    expect(() => virtualizer.clear()).not.toThrow();
  });
});

// ── FontVirtualizer — setCanvas / renderAll interception ─────────────────────

describe('FontVirtualizer — setCanvas and renderAll interception', () => {
  it('wraps canvas.renderAll to enforce virtualized fonts', async () => {
    const virtualizer = new FontVirtualizer();
    const canvas = makeFabricCanvas();
    const originalRenderAll = canvas.renderAll as ReturnType<typeof vi.fn>;

    virtualizer.setCanvas(canvas);

    const text = makeFabricText();
    await virtualizer.registerGoogleFont('layer-canvas', text, { family: 'Font_canvas' });

    // Calling renderAll should call the original
    canvas.renderAll();
    expect(originalRenderAll).toHaveBeenCalledTimes(1);
  });

  it('enforces virtualized font family during renderAll', async () => {
    const virtualizer = new FontVirtualizer();
    const canvas = makeFabricCanvas();
    virtualizer.setCanvas(canvas);

    const text = makeFabricText();
    await virtualizer.registerGoogleFont('layer-enforce', text, { family: 'Font_enforce' });

    // Manually corrupt _virtualizedFontFamily (simulating Fabric internals resetting it)
    (text as unknown as { _virtualizedFontFamily: string })._virtualizedFontFamily =
      'Font_enforce';

    // Force fontFamily to a different value at the object level (bypass the lock)
    Object.defineProperty(text, 'fontFamily', {
      value: 'WrongFont',
      writable: true,
      configurable: true,
      enumerable: true,
    });

    canvas.renderAll();

    // After renderAll, set should have been called to restore the locked font
    const setText = text.set as ReturnType<typeof vi.fn>;
    const setCallArgs = setText.mock.calls.map((c: unknown[]) => c[0]) as Array<
      Record<string, unknown>
    >;
    const fontCalls = setCallArgs.filter((c) => c && 'fontFamily' in c);
    expect(fontCalls.some((c) => c.fontFamily === 'Font_enforce')).toBe(true);
  });

  it('does not intercept renderAll a second time when setCanvas is called twice', () => {
    const virtualizer = new FontVirtualizer();
    const canvas = makeFabricCanvas();
    const renderAllSpy = canvas.renderAll;

    virtualizer.setCanvas(canvas);
    virtualizer.setCanvas(canvas); // second call should be a no-op guard

    canvas.renderAll();
    // Original was called exactly once — no double-wrapping
    expect((renderAllSpy as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});

// ── getFontVirtualizer / initializeFontVirtualization ────────────────────────

describe('getFontVirtualizer singleton', () => {
  it('returns the same instance on repeated calls', () => {
    const a = getFontVirtualizer();
    const b = getFontVirtualizer();
    expect(a).toBe(b);
  });

  it('wires a canvas when passed to getFontVirtualizer', () => {
    const canvas = makeFabricCanvas();
    const virt = getFontVirtualizer(canvas);
    expect(virt).toBeDefined();
  });

  it('initializeFontVirtualization returns a FontVirtualizer instance', () => {
    const canvas = makeFabricCanvas();
    const virt = initializeFontVirtualization(canvas);
    expect(virt).toBeInstanceOf(FontVirtualizer);
  });
});

// ── afterEach global cleanup ──────────────────────────────────────────────────

afterEach(() => {
  clearFontLinks();
});
