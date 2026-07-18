// @vitest-environment node
/**
 * Unit tests for lib/designer/layerFactory.ts
 *
 * Fabric is mocked entirely — every Fabric class is a plain JS object so no
 * real canvas / DOM is required.  The fabric mock lives at the top of this
 * file and is hoisted by vitest's vi.mock().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Fabric mock — must be declared before any import that pulls in the module.
// ---------------------------------------------------------------------------

interface MockFabricObj {
  type: string;
  text?: string;
  left?: number;
  top?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  opacity?: number;
  visible?: boolean;
  selectable?: boolean;
  evented?: boolean;
  fill?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  stroke?: string | null;
  strokeWidth?: number;
  shadow?: unknown;
  data?: Record<string, unknown>;
  _opts?: Record<string, unknown>;
  set(k: string, v: unknown): void;
}

function makeMockObj(type: string, extra: Record<string, unknown> = {}): MockFabricObj {
  const obj: MockFabricObj = {
    type,
    ...extra,
    set(k: string, v: unknown) {
      (this as unknown as Record<string, unknown>)[k] = v;
    },
  };
  return obj;
}

// Captured constructor calls so tests can inspect what was passed.
const FabricTextCalls: Array<{ text: string; opts: Record<string, unknown> }> = [];
const ShadowCalls: Array<Record<string, unknown>> = [];
let mockFromURLResult: MockFabricObj | null = null;

vi.mock('fabric', () => {
  class FabricText {
    type = 'text';
    text: string;
    _opts: Record<string, unknown>;
    fill?: string;
    fontFamily?: string;
    fontSize?: number;
    fontFamily_?: string;
    data?: Record<string, unknown>;
    stroke?: string | null;
    strokeWidth?: number;
    shadow?: unknown;

    constructor(text: string, opts: Record<string, unknown> = {}) {
      this.text = text;
      this._opts = opts;
      Object.assign(this, opts);
      FabricTextCalls.push({ text, opts });
    }

    set(k: string, v: unknown) {
      (this as unknown as Record<string, unknown>)[k] = v;
    }
  }

  class FabricImage {
    type = 'image';
    data?: Record<string, unknown>;
    _setOpts?: Record<string, unknown>;

    set(opts: Record<string, unknown>) {
      this._setOpts = opts;
      Object.assign(this, opts);
    }

    static async fromURL(_url: string, _opts?: Record<string, unknown>): Promise<MockFabricObj> {
      if (!mockFromURLResult) throw new Error('fromURL: no mock result');
      return mockFromURLResult;
    }
  }

  class Shadow {
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;

    constructor(opts: { color: string; offsetX: number; offsetY: number; blur: number }) {
      this.color = opts.color;
      this.offsetX = opts.offsetX;
      this.offsetY = opts.offsetY;
      this.blur = opts.blur;
      ShadowCalls.push({ ...opts });
    }
  }

  class Path {
    type = 'path';
  }

  class ActiveSelection {
    type = 'activeSelection';
  }

  class Group {
    type = 'group';
  }

  return { FabricText, FabricImage, Shadow, Path, ActiveSelection, Group };
});

// uuid is also used; mock it to return a predictable value.
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

// ---------------------------------------------------------------------------
// Now import the module under test (after mocks are hoisted).
// ---------------------------------------------------------------------------
import {
  createFabricText,
  createFabricIcon,
  createFabricImage,
  layerToFabricObject,
  fabricObjectToLayer,
  applyShadowEffectToFabricObject,
  applyOutlineEffectToFabricObject,
} from '@/lib/designer/layerFactory';
import type { LayerData } from '@/lib/designer/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseLayer(overrides: Partial<LayerData> = {}): LayerData {
  return {
    id: 'layer-1',
    type: 'text',
    name: 'Test Layer',
    visible: true,
    locked: false,
    opacity: 1,
    left: 10,
    top: 20,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    zIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    data: { text: 'Hello', fontFamily: 'Arial', fontSize: 24, fill: '#ff0000', textAlign: 'left', lineHeight: 1.2, charSpacing: 0, fontWeight: 'normal' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  FabricTextCalls.length = 0;
  ShadowCalls.length = 0;
  mockFromURLResult = null;
});

describe('createFabricText', () => {
  it('creates a FabricText with defaults when no options supplied', () => {
    const obj = createFabricText('Hello');
    expect(obj.text).toBe('Hello');
    // defaults
    expect((obj as unknown as { fontFamily: string }).fontFamily).toBe('Arial');
    expect((obj as unknown as { fontSize: number }).fontSize).toBe(24);
    expect((obj as unknown as { fill: string }).fill).toBe('#000000');
  });

  it('spreads provided options over the defaults', () => {
    const obj = createFabricText('Test', { fontSize: 36, fill: '#ff0000', fontFamily: 'Georgia' });
    expect((obj as unknown as { fontSize: number }).fontSize).toBe(36);
    expect((obj as unknown as { fill: string }).fill).toBe('#ff0000');
    expect((obj as unknown as { fontFamily: string }).fontFamily).toBe('Georgia');
  });

  it('stamps data.type = "text" on the object', () => {
    const obj = createFabricText('X');
    expect((obj as unknown as { data: Record<string, unknown> }).data.type).toBe('text');
  });

  it('uses provided data.id when given', () => {
    const obj = createFabricText('Y', { data: { id: 'my-id' } });
    expect((obj as unknown as { data: Record<string, unknown> }).data.id).toBe('my-id');
  });

  it('falls back to uuid when data.id is absent', () => {
    const obj = createFabricText('Z');
    expect((obj as unknown as { data: Record<string, unknown> }).data.id).toBe('test-uuid-1234');
  });

  it('strips null/undefined options (does not overwrite defaults)', () => {
    // passing fontFamily: undefined should fall back to the default 'Arial'
    const obj = createFabricText('Q', { fontFamily: undefined, fontSize: undefined });
    expect((obj as unknown as { fontFamily: string }).fontFamily).toBe('Arial');
    expect((obj as unknown as { fontSize: number }).fontSize).toBe(24);
  });
});

describe('createFabricIcon', () => {
  it('maps known icon names to unicode glyphs', () => {
    const obj = createFabricIcon('star');
    expect(obj.text).toBe('★');

    const heart = createFabricIcon('heart');
    expect(heart.text).toBe('♥');
  });

  it('falls back to star glyph for unknown icon names', () => {
    const obj = createFabricIcon('nonexistent-icon');
    expect(obj.text).toBe('★');
  });

  it('stamps data.type = "icon" and iconName on the object', () => {
    const obj = createFabricIcon('check');
    const data = (obj as unknown as { data: Record<string, unknown> }).data;
    expect(data.type).toBe('icon');
    expect(data.iconName).toBe('check');
  });

  it('applies defaults: fontSize 48, fill #333333', () => {
    const obj = createFabricIcon('circle');
    expect((obj as unknown as { fontSize: number }).fontSize).toBe(48);
    expect((obj as unknown as { fill: string }).fill).toBe('#333333');
  });

  it('overrides defaults with provided options', () => {
    const obj = createFabricIcon('moon', { fontSize: 64, fill: '#ffffff' });
    expect((obj as unknown as { fontSize: number }).fontSize).toBe(64);
    expect((obj as unknown as { fill: string }).fill).toBe('#ffffff');
  });

  it('covers all icons in UNICODE_ICON_MAP', () => {
    const icons = ['circle', 'square', 'triangle', 'diamond', 'arrow', 'check',
      'close', 'plus', 'minus', 'bolt', 'sun', 'moon', 'music', 'smile', 'flag', 'crown', 'flower'];
    for (const name of icons) {
      const obj = createFabricIcon(name);
      expect(obj.text).not.toBe('');
    }
  });
});

describe('createFabricImage', () => {
  it('resolves with a FabricImage when URL loads successfully', async () => {
    const fakeImg = makeMockObj('image');
    mockFromURLResult = fakeImg;
    const img = await createFabricImage('https://example.com/img.png');
    expect(img).toBe(fakeImg);
  });

  it('stamps data.type = "image" and url on the result', async () => {
    // Use an object whose set() merges a whole options bag (as createFabricImage calls img.set(defaults))
    const fakeImg: MockFabricObj & { _setOpts?: Record<string, unknown> } = {
      ...makeMockObj('image'),
      set(opts: unknown) {
        if (typeof opts === 'object' && opts !== null && !Array.isArray(opts)) {
          Object.assign(this, opts);
        }
      },
    };
    mockFromURLResult = fakeImg;
    await createFabricImage('https://example.com/photo.jpg');
    const data = (fakeImg as unknown as { data: Record<string, unknown> }).data;
    expect(data?.type).toBe('image');
    expect(data?.url).toBe('https://example.com/photo.jpg');
  });

  it('throws when fromURL rejects (simulated load failure)', async () => {
    // Patch fromURL on the module's FabricImage to reject
    const { FabricImage } = await import('fabric');
    const spy = vi.spyOn(FabricImage, 'fromURL').mockRejectedValueOnce(new Error('Failed to load image'));
    await expect(createFabricImage('bad-url')).rejects.toThrow('Failed to load image');
    spy.mockRestore();
  });

  it('uses provided data.id', async () => {
    const fakeImg: MockFabricObj = {
      ...makeMockObj('image'),
      set(opts: unknown) {
        if (typeof opts === 'object' && opts !== null && !Array.isArray(opts)) {
          Object.assign(this, opts);
        }
      },
    };
    mockFromURLResult = fakeImg;
    await createFabricImage('https://example.com/x.png', { data: { id: 'img-id-1' } });
    const data = (fakeImg as unknown as { data: Record<string, unknown> }).data;
    expect(data?.id).toBe('img-id-1');
  });
});

describe('layerToFabricObject', () => {
  it('returns a FabricText for type=text layers', async () => {
    const obj = await layerToFabricObject(baseLayer());
    expect(obj).not.toBeNull();
    expect(obj!.type).toBe('text');
  });

  it('returns a FabricText for type=icon layers', async () => {
    const layer = baseLayer({
      type: 'icon',
      data: { iconName: 'star', fill: '#ff0000' },
    });
    const obj = await layerToFabricObject(layer);
    expect(obj).not.toBeNull();
    expect(obj!.type).toBe('text');
  });

  it('returns null for type=image when url is missing', async () => {
    const layer = baseLayer({ type: 'image', data: {} });
    const result = await layerToFabricObject(layer);
    expect(result).toBeNull();
  });

  it('resolves type=image with a FabricImage when url present', async () => {
    const fakeImg = makeMockObj('image');
    mockFromURLResult = fakeImg;
    const layer = baseLayer({ type: 'image', data: { url: 'https://x.com/img.png' } });
    const obj = await layerToFabricObject(layer);
    expect(obj).toBe(fakeImg);
  });

  it('returns null for unknown layer types', async () => {
    const layer = baseLayer({ type: 'text' });
    // Manually set an unrecognised type on the object after creation
    const badLayer = { ...layer, type: 'shape' } as unknown as LayerData;
    const result = await layerToFabricObject(badLayer);
    expect(result).toBeNull();
  });

  it('passes selectable=false and evented=false for locked layers', async () => {
    const layer = baseLayer({ locked: true });
    await layerToFabricObject(layer);
    const lastCall = FabricTextCalls[FabricTextCalls.length - 1];
    expect(lastCall.opts.selectable).toBe(false);
    expect(lastCall.opts.evented).toBe(false);
  });

  it('applies shadow effect for text layer with enabled shadow', async () => {
    const layer = baseLayer({
      data: {
        text: 'Shadowed',
        fontFamily: 'Arial',
        fontSize: 20,
        fill: '#000',
        textAlign: 'left' as const,
        lineHeight: 1,
        charSpacing: 0,
        fontWeight: 'normal',
        shadow: {
          enabled: true,
          color: '#ff0000',
          offsetX: 2,
          offsetY: 3,
          blur: 5,
        },
      },
    });
    await layerToFabricObject(layer);
    // Shadow constructor should have been called
    expect(ShadowCalls.length).toBeGreaterThan(0);
    expect(ShadowCalls[0].color).toBe('#ff0000');
  });

  it('does not apply shadow when shadow.enabled is false', async () => {
    const layer = baseLayer({
      data: {
        text: 'NoShadow',
        fontFamily: 'Arial',
        fontSize: 20,
        fill: '#000',
        textAlign: 'left' as const,
        lineHeight: 1,
        charSpacing: 0,
        fontWeight: 'normal',
        shadow: { enabled: false, color: '#000', offsetX: 0, offsetY: 0, blur: 0 },
      },
    });
    await layerToFabricObject(layer);
    expect(ShadowCalls.length).toBe(0);
  });
});

describe('fabricObjectToLayer', () => {
  it('extracts position and transform from the fabric object', () => {
    const fakeObj = makeMockObj('text', { left: 50, top: 60, scaleX: 1.5, scaleY: 1.5, angle: 45, opacity: 0.8 });
    const result = fabricObjectToLayer(fakeObj as unknown as Parameters<typeof fabricObjectToLayer>[0]);
    expect(result.left).toBe(50);
    expect(result.top).toBe(60);
    expect(result.scaleX).toBe(1.5);
    expect(result.angle).toBe(45);
    expect(result.opacity).toBe(0.8);
  });

  it('defaults missing transforms to 0/1', () => {
    const fakeObj = makeMockObj('text');
    const result = fabricObjectToLayer(fakeObj as unknown as Parameters<typeof fabricObjectToLayer>[0]);
    expect(result.left).toBe(0);
    expect(result.top).toBe(0);
    expect(result.scaleX).toBe(1);
    expect(result.scaleY).toBe(1);
    expect(result.angle).toBe(0);
    expect(result.opacity).toBe(1);
  });

  it('defaults visible to true when obj.visible is not set', () => {
    const fakeObj = makeMockObj('text');
    const result = fabricObjectToLayer(fakeObj as unknown as Parameters<typeof fabricObjectToLayer>[0]);
    expect(result.visible).toBe(true);
  });

  it('sets visible=false when obj.visible is false', () => {
    const fakeObj = makeMockObj('text', { visible: false });
    const result = fabricObjectToLayer(fakeObj as unknown as Parameters<typeof fabricObjectToLayer>[0]);
    expect(result.visible).toBe(false);
  });

  it('copies fill/color for text layers using current.type', () => {
    const fakeObj = makeMockObj('text', { fill: '#abcdef' });
    const current = baseLayer();
    const result = fabricObjectToLayer(
      fakeObj as unknown as Parameters<typeof fabricObjectToLayer>[0],
      current,
    );
    expect((result.data as Record<string, unknown>).fill).toBe('#abcdef');
    expect((result.data as Record<string, unknown>).color).toBe('#abcdef');
  });

  it('copies text, fontSize, fontFamily, fontWeight for text layers', () => {
    const fakeObj = makeMockObj('text', {
      fill: '#000',
      text: 'Updated',
      fontSize: 32,
      fontFamily: 'Georgia',
      fontWeight: 'bold',
    });
    const current = baseLayer();
    const result = fabricObjectToLayer(
      fakeObj as unknown as Parameters<typeof fabricObjectToLayer>[0],
      current,
    );
    const d = result.data as Record<string, unknown>;
    expect(d.text).toBe('Updated');
    expect(d.fontSize).toBe(32);
    expect(d.fontFamily).toBe('Georgia');
    expect(d.fontWeight).toBe('bold');
  });

  it('captures stroke/strokeWidth for text layers', () => {
    const fakeObj = makeMockObj('text', {
      fill: '#000',
      stroke: '#ff0000',
      strokeWidth: 2,
    });
    const current = baseLayer();
    const result = fabricObjectToLayer(
      fakeObj as unknown as Parameters<typeof fabricObjectToLayer>[0],
      current,
    );
    const d = result.data as Record<string, unknown>;
    expect(d.stroke).toBe('#ff0000');
    expect(d.strokeWidth).toBe(2);
  });

  it('sets shadow=null in data when obj.shadow is null', () => {
    const fakeObj = makeMockObj('text', { fill: '#000', shadow: null });
    const current = baseLayer();
    const result = fabricObjectToLayer(
      fakeObj as unknown as Parameters<typeof fabricObjectToLayer>[0],
      current,
    );
    const d = result.data as Record<string, unknown>;
    expect(d.shadow).toBeNull();
  });

  it('serialises shadow object when obj.shadow is set', () => {
    const fakeObj = makeMockObj('text', {
      fill: '#000',
      shadow: { color: '#0000ff', offsetX: 3, offsetY: 4, blur: 6 },
    });
    const current = baseLayer();
    const result = fabricObjectToLayer(
      fakeObj as unknown as Parameters<typeof fabricObjectToLayer>[0],
      current,
    );
    const d = result.data as Record<string, unknown>;
    const shadow = d.shadow as Record<string, unknown>;
    expect(shadow.enabled).toBe(true);
    expect(shadow.color).toBe('#0000ff');
    expect(shadow.offsetX).toBe(3);
    expect(shadow.blur).toBe(6);
  });

  it('copies fill/color/size for icon layers', () => {
    const fakeObj = makeMockObj('text', { fill: '#00ff00', fontSize: 64 });
    const current = baseLayer({ type: 'icon', data: { iconName: 'star', fill: '#000', size: 48 } });
    const result = fabricObjectToLayer(
      fakeObj as unknown as Parameters<typeof fabricObjectToLayer>[0],
      current,
    );
    const d = result.data as Record<string, unknown>;
    expect(d.fill).toBe('#00ff00');
    expect(d.size).toBe(64);
  });

  it('merges current.data as base when current is provided', () => {
    const fakeObj = makeMockObj('text', { fill: '#111' });
    const current = baseLayer({ data: { text: 'preserved', fill: '#000', fontFamily: 'Arial', fontSize: 16, textAlign: 'left', lineHeight: 1, charSpacing: 0, fontWeight: 'normal' } });
    const result = fabricObjectToLayer(
      fakeObj as unknown as Parameters<typeof fabricObjectToLayer>[0],
      current,
    );
    // Base text field preserved from current.data
    expect((result.data as Record<string, unknown>).text).toBe('preserved');
  });

  it('handles obj.type = "i-text" as a text type for fill extraction', () => {
    const fakeObj = { ...makeMockObj('i-text', { fill: '#cafe00' }), type: 'i-text' };
    const result = fabricObjectToLayer(fakeObj as unknown as Parameters<typeof fabricObjectToLayer>[0]);
    const d = result.data as Record<string, unknown>;
    // i-text should trigger fill/color copy (no current needed)
    expect(d.fill).toBe('#cafe00');
  });
});

describe('applyShadowEffectToFabricObject', () => {
  it('applies shadow when effect is enabled', () => {
    const fakeObj = makeMockObj('text');
    applyShadowEffectToFabricObject(
      fakeObj as unknown as Parameters<typeof applyShadowEffectToFabricObject>[0],
      { enabled: true, color: '#ff0000', offsetX: 5, offsetY: 5, blur: 10 },
    );
    expect(ShadowCalls.length).toBe(1);
    expect(ShadowCalls[0].color).toBe('#ff0000');
    expect(ShadowCalls[0].offsetX).toBe(5);
    expect(ShadowCalls[0].blur).toBe(10);
    // The shadow should have been set on the object
    expect(fakeObj.shadow).toBeTruthy();
  });

  it('clears shadow when effect is null', () => {
    const fakeObj = makeMockObj('text');
    applyShadowEffectToFabricObject(
      fakeObj as unknown as Parameters<typeof applyShadowEffectToFabricObject>[0],
      null,
    );
    expect(fakeObj.shadow).toBeNull();
  });

  it('clears shadow when effect.enabled is false', () => {
    const fakeObj = makeMockObj('text');
    applyShadowEffectToFabricObject(
      fakeObj as unknown as Parameters<typeof applyShadowEffectToFabricObject>[0],
      { enabled: false, color: '#000', offsetX: 0, offsetY: 0, blur: 0 },
    );
    expect(fakeObj.shadow).toBeNull();
  });

  it('defaults color to #000000 when effect.color is empty', () => {
    const fakeObj = makeMockObj('text');
    applyShadowEffectToFabricObject(
      fakeObj as unknown as Parameters<typeof applyShadowEffectToFabricObject>[0],
      { enabled: true, color: '', offsetX: 1, offsetY: 1, blur: 2 },
    );
    expect(ShadowCalls[0].color).toBe('#000000');
  });
});

describe('applyOutlineEffectToFabricObject', () => {
  it('sets stroke and strokeWidth when width > 0', () => {
    const fakeObj = makeMockObj('text');
    applyOutlineEffectToFabricObject(
      fakeObj as unknown as Parameters<typeof applyOutlineEffectToFabricObject>[0],
      '#ff0000',
      3,
    );
    expect(fakeObj.stroke).toBe('#ff0000');
    expect(fakeObj.strokeWidth).toBe(3);
  });

  it('clears stroke when width is 0', () => {
    const fakeObj = makeMockObj('text', { stroke: '#ff0000', strokeWidth: 3 });
    applyOutlineEffectToFabricObject(
      fakeObj as unknown as Parameters<typeof applyOutlineEffectToFabricObject>[0],
      '#ff0000',
      0,
    );
    expect(fakeObj.stroke).toBeNull();
    expect(fakeObj.strokeWidth).toBe(0);
  });

  it('clears stroke when width is negative', () => {
    const fakeObj = makeMockObj('text', { stroke: '#ff0000', strokeWidth: 3 });
    applyOutlineEffectToFabricObject(
      fakeObj as unknown as Parameters<typeof applyOutlineEffectToFabricObject>[0],
      '#ff0000',
      -1,
    );
    expect(fakeObj.stroke).toBeNull();
    expect(fakeObj.strokeWidth).toBe(0);
  });
});
