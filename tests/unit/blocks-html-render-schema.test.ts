// @vitest-environment jsdom
//
// Unit tests for lib/blocks/html-render-schema.ts — schema clipboard +
// JSON import/export for html-render blocks. Exercises:
//   - buildSchemaSnapshot / applySchemaSnapshot (incl. deep-clone safety)
//   - writeSchemaClipboard / readSchemaClipboard / clearSchemaClipboard
//     (happy path, SSR guard, corrupt JSON, invalid shape)
//   - parseImportedSchema (every validation branch)
//   - downloadSchemaJson (DOM side-effects + slug + timestamp formatting)
//
// We force jsdom (rather than the spec's suggested `node`) because the
// module's main responsibilities are localStorage + Blob + anchor download —
// all of which only exist in a DOM environment. The SSR (`typeof window
// === 'undefined'`) guards are exercised by temporarily stubbing `window`
// to undefined inside dedicated tests.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildSchemaSnapshot,
  applySchemaSnapshot,
  writeSchemaClipboard,
  readSchemaClipboard,
  clearSchemaClipboard,
  downloadSchemaJson,
  parseImportedSchema,
  type HtmlRenderSchema,
} from '@/lib/blocks/html-render-schema';
import type { HtmlRenderBlock, HtmlRenderField, HtmlRenderLoop } from '@/types/blocks';

const STORAGE_KEY = 'sd-html-render-schema-clipboard';

function makeField(over: Partial<HtmlRenderField> = {}): HtmlRenderField {
  return { name: 'title', type: 'text', ...over };
}

function makeBlock(over: Partial<HtmlRenderBlock> = {}): HtmlRenderBlock {
  return {
    id: 'blk_1',
    type: 'html-render',
    order: 0,
    html: '<h1>{{title}}</h1>',
    fields: [makeField()],
    values: { title: 'Hello' },
    ...over,
  };
}

function makeLoop(over: Partial<HtmlRenderLoop> = {}): HtmlRenderLoop {
  return { source: 'posts', postType: 'blog', limit: 5, orderBy: 'recent', ...over };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('buildSchemaSnapshot', () => {
  it('captures html, fields, loop, copiedAt, sourceLabel', () => {
    const fixedNow = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fixedNow));

    const block = makeBlock({
      html: '<p>{{x}}</p>',
      fields: [makeField({ name: 'x' })],
      loop: makeLoop(),
    });

    const snap = buildSchemaSnapshot(block, 'My Block');

    expect(snap.version).toBe(1);
    expect(snap.copiedAt).toBe(fixedNow);
    expect(snap.sourceLabel).toBe('My Block');
    expect(snap.html).toBe('<p>{{x}}</p>');
    expect(snap.fields).toEqual([{ name: 'x', type: 'text' }]);
    expect(snap.loop).toEqual({ source: 'posts', postType: 'blog', limit: 5, orderBy: 'recent' });
  });

  it('omits sourceLabel when not supplied', () => {
    const snap = buildSchemaSnapshot(makeBlock());
    expect(snap.sourceLabel).toBeUndefined();
  });

  it('deep-clones fields so later mutations to the source do not leak', () => {
    const original: HtmlRenderField = { name: 'a', type: 'text', label: 'A' };
    const block = makeBlock({ fields: [original] });

    const snap = buildSchemaSnapshot(block);
    // Mutate the original; snapshot must stay intact.
    original.label = 'CHANGED';
    (block.fields as HtmlRenderField[])[0].name = 'mutated';

    expect(snap.fields).toEqual([{ name: 'a', type: 'text', label: 'A' }]);
    expect(snap.fields[0]).not.toBe(original);
  });

  it('deep-clones loop when present, and leaves it undefined otherwise', () => {
    const loop = makeLoop();
    const snap = buildSchemaSnapshot(makeBlock({ loop }));
    expect(snap.loop).toEqual(loop);
    expect(snap.loop).not.toBe(loop);

    const snap2 = buildSchemaSnapshot(makeBlock({ loop: undefined }));
    expect(snap2.loop).toBeUndefined();
  });

  it('defaults missing html to empty string and missing fields to []', () => {
    // The type system says these are required, but real-world callers
    // sometimes hand in stub blocks during scaffolding. The defaults must
    // hold so we never persist `undefined`.
    const partial = { id: 'b', type: 'html-render', order: 0 } as unknown as HtmlRenderBlock;
    const snap = buildSchemaSnapshot(partial);
    expect(snap.html).toBe('');
    expect(snap.fields).toEqual([]);
    expect(snap.loop).toBeUndefined();
  });
});

describe('applySchemaSnapshot', () => {
  it('returns html/fields/values/loop ready to spread onto a target block', () => {
    const schema: HtmlRenderSchema = {
      version: 1,
      copiedAt: 1,
      sourceLabel: 'src',
      html: '<div>{{a}}</div>',
      fields: [makeField({ name: 'a' })],
      loop: makeLoop({ postType: 'case-study' }),
    };

    const patch = applySchemaSnapshot(schema);

    expect(patch.html).toBe('<div>{{a}}</div>');
    expect(patch.fields).toEqual([{ name: 'a', type: 'text' }]);
    // Values must always be wiped on apply — the recipient starts blank.
    expect(patch.values).toEqual({});
    expect(patch.loop).toEqual({ source: 'posts', postType: 'case-study', limit: 5, orderBy: 'recent' });
  });

  it('preserves undefined loop when source schema has none', () => {
    const schema: HtmlRenderSchema = {
      version: 1,
      copiedAt: 1,
      html: '',
      fields: [],
    };
    const patch = applySchemaSnapshot(schema);
    expect(patch.loop).toBeUndefined();
  });

  it('deep-clones fields and loop so subsequent edits to the patch do not corrupt the schema', () => {
    const schema: HtmlRenderSchema = {
      version: 1,
      copiedAt: 1,
      html: '',
      fields: [makeField({ name: 'a' })],
      loop: makeLoop(),
    };
    const patch = applySchemaSnapshot(schema);

    (patch.fields as HtmlRenderField[])[0].name = 'mutated';
    (patch.loop as HtmlRenderLoop).postType = 'other';

    expect(schema.fields[0].name).toBe('a');
    expect(schema.loop?.postType).toBe('blog');
  });
});

describe('writeSchemaClipboard / readSchemaClipboard / clearSchemaClipboard', () => {
  it('round-trips a schema through localStorage', () => {
    const schema: HtmlRenderSchema = {
      version: 1,
      copiedAt: 42,
      sourceLabel: 'src',
      html: '<p>{{a}}</p>',
      fields: [makeField({ name: 'a' })],
    };
    expect(writeSchemaClipboard(schema)).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"html":"<p>{{a}}</p>"');

    const read = readSchemaClipboard();
    expect(read).toEqual(schema);
  });

  it('returns null when nothing has been stored', () => {
    expect(readSchemaClipboard()).toBeNull();
  });

  it('returns null when localStorage holds non-JSON garbage', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json{');
    expect(readSchemaClipboard()).toBeNull();
  });

  it('returns null when version is missing or wrong', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ html: '', fields: [] }));
    expect(readSchemaClipboard()).toBeNull();

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, html: '', fields: [] }));
    expect(readSchemaClipboard()).toBeNull();
  });

  it('returns null when html is not a string', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, copiedAt: 0, html: 123, fields: [] }),
    );
    expect(readSchemaClipboard()).toBeNull();
  });

  it('returns null when fields is not an array', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, copiedAt: 0, html: '', fields: 'nope' }),
    );
    expect(readSchemaClipboard()).toBeNull();
  });

  it('returns null when the JSON parses to a primitive (parsed?.version short-circuit)', () => {
    window.localStorage.setItem(STORAGE_KEY, 'null');
    expect(readSchemaClipboard()).toBeNull();

    window.localStorage.setItem(STORAGE_KEY, '"hello"');
    expect(readSchemaClipboard()).toBeNull();
  });

  it('clearSchemaClipboard removes the slot', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, html: '', fields: [] }));
    clearSchemaClipboard();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clearSchemaClipboard is a no-op when storage throws', () => {
    // jsdom's Storage methods live on the prototype and aren't trivially
    // spy-able via vi.spyOn on the instance. Swap the whole localStorage
    // reference for the duration of the test via Object.defineProperty.
    const removeSpy = vi.fn(() => {
      throw new Error('quota');
    });
    const originalStorage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { ...originalStorage, removeItem: removeSpy, setItem: () => {}, getItem: () => null },
    });
    try {
      expect(() => clearSchemaClipboard()).not.toThrow();
      expect(removeSpy).toHaveBeenCalledWith(STORAGE_KEY);
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: originalStorage,
      });
    }
  });

  it('writeSchemaClipboard returns false when localStorage throws', () => {
    const originalStorage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        setItem: () => {
          throw new Error('quota');
        },
        getItem: () => null,
        removeItem: () => {},
      },
    });
    try {
      const schema: HtmlRenderSchema = { version: 1, copiedAt: 0, html: '', fields: [] };
      expect(writeSchemaClipboard(schema)).toBe(false);
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: originalStorage,
      });
    }
  });

  it('readSchemaClipboard returns null when localStorage.getItem throws', () => {
    const originalStorage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {},
        removeItem: () => {},
      },
    });
    try {
      expect(readSchemaClipboard()).toBeNull();
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: originalStorage,
      });
    }
  });

  it('all three guard SSR (window === undefined)', () => {
    vi.stubGlobal('window', undefined);
    const schema: HtmlRenderSchema = { version: 1, copiedAt: 0, html: '', fields: [] };
    expect(writeSchemaClipboard(schema)).toBe(false);
    expect(readSchemaClipboard()).toBeNull();
    expect(() => clearSchemaClipboard()).not.toThrow();
  });
});

describe('parseImportedSchema', () => {
  it('accepts a valid schema JSON', () => {
    const schema: HtmlRenderSchema = {
      version: 1,
      copiedAt: 1,
      html: '<p>{{x}}</p>',
      fields: [makeField({ name: 'x' })],
    };
    const result = parseImportedSchema(JSON.stringify(schema));
    expect(result).toEqual(schema);
    // Must be the parsed schema, not an error wrapper.
    expect((result as { error?: string }).error).toBeUndefined();
  });

  it('returns an error for invalid JSON syntax', () => {
    const result = parseImportedSchema('not-json{');
    expect(result).toMatchObject({ error: expect.stringMatching(/^Invalid JSON: /) });
  });

  it('error message preserves the parser message when available', () => {
    const result = parseImportedSchema('{bad}') as { error: string };
    // Should be more informative than just "parse failed" — jsdom uses
    // V8/SpiderMonkey-flavored messages, but it will be an Error.message.
    expect(result.error.startsWith('Invalid JSON: ')).toBe(true);
    expect(result.error).not.toBe('Invalid JSON: parse failed');
  });

  it('rejects null (typeof null === "object" but parsed is falsy)', () => {
    expect(parseImportedSchema('null')).toEqual({ error: 'Schema must be a JSON object' });
  });

  it('rejects non-object primitives', () => {
    expect(parseImportedSchema('"a string"')).toEqual({ error: 'Schema must be a JSON object' });
    expect(parseImportedSchema('42')).toEqual({ error: 'Schema must be a JSON object' });
    expect(parseImportedSchema('true')).toEqual({ error: 'Schema must be a JSON object' });
  });

  it('rejects an unsupported version, including missing version', () => {
    expect(parseImportedSchema(JSON.stringify({ html: '', fields: [] }))).toEqual({
      error: 'Unsupported schema version: undefined',
    });
    expect(parseImportedSchema(JSON.stringify({ version: 2, html: '', fields: [] }))).toEqual({
      error: 'Unsupported schema version: 2',
    });
  });

  it('rejects when html is missing or not a string', () => {
    expect(parseImportedSchema(JSON.stringify({ version: 1, fields: [] }))).toEqual({
      error: 'Missing `html` template',
    });
    expect(parseImportedSchema(JSON.stringify({ version: 1, html: 5, fields: [] }))).toEqual({
      error: 'Missing `html` template',
    });
  });

  it('rejects when fields is missing or not an array', () => {
    expect(parseImportedSchema(JSON.stringify({ version: 1, html: '' }))).toEqual({
      error: 'Missing `fields` array',
    });
    expect(parseImportedSchema(JSON.stringify({ version: 1, html: '', fields: { 0: 'x' } }))).toEqual({
      error: 'Missing `fields` array',
    });
  });

  it('does NOT enforce that each field is a real HtmlRenderField (cast-only)', () => {
    // Documented behavior: the function only checks the outer shape. If
    // someone hands in an array of garbage, they get the cast back. This
    // test pins that contract so future tightening is intentional.
    const ok = parseImportedSchema(
      JSON.stringify({ version: 1, html: '', fields: ['not a field'] }),
    );
    expect((ok as { error?: string }).error).toBeUndefined();
    expect((ok as HtmlRenderSchema).fields).toEqual(['not a field']);
  });
});

describe('downloadSchemaJson', () => {
  it('builds a Blob, anchors a download, clicks, and cleans up', () => {
    const createObjectURL = vi.fn(() => 'blob:fake-url');
    const revokeObjectURL = vi.fn();
    // jsdom does not implement URL.createObjectURL; stub it.
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    // Spy the anchor's click — jsdom's default navigates and warns.
    const clickSpy = vi.fn();
    const realCreateElement = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = clickSpy;
      }
      return el;
    });

    const schema: HtmlRenderSchema = {
      version: 1,
      copiedAt: Date.UTC(2026, 0, 2, 3, 4, 5), // 2026-01-02T03:04:05Z
      sourceLabel: 'Hero Section',
      html: '<h1>{{t}}</h1>',
      fields: [makeField({ name: 't' })],
    };

    downloadSchemaJson(schema);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');

    expect(createSpy).toHaveBeenCalledWith('a');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');

    // The anchor should no longer be attached to the document.
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('slugifies sourceLabel, lowercases it, and caps at 40 chars', () => {
    const createObjectURL = vi.fn(() => 'blob:fake-url');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });

    const anchors: HTMLAnchorElement[] = [];
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag) as HTMLElement;
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = vi.fn();
        anchors.push(el as HTMLAnchorElement);
      }
      return el;
    });

    const schema: HtmlRenderSchema = {
      version: 1,
      copiedAt: Date.UTC(2026, 4, 19, 12, 0, 0), // 2026-05-19T12:00:00Z
      sourceLabel: 'My!!! GREAT Block — With Punctuation & Spaces, and a very loooooong tail',
      html: '',
      fields: [],
    };
    downloadSchemaJson(schema);

    expect(anchors).toHaveLength(1);
    const filename = anchors[0].getAttribute('download') as string;
    // slug portion = first 40 chars of the slugified label
    const [slug, stampWithExt] = filename.split(/-(?=\d{4}-\d{2}-\d{2})/);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).not.toContain('!');
    expect(stampWithExt).toBe('2026-05-19-12-00-00.json');
  });

  it('falls back to "html-render-schema" when sourceLabel is absent', () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const anchors: HTMLAnchorElement[] = [];
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag) as HTMLElement;
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = vi.fn();
        anchors.push(el as HTMLAnchorElement);
      }
      return el;
    });

    downloadSchemaJson({
      version: 1,
      copiedAt: Date.UTC(2026, 0, 1, 0, 0, 0),
      html: '',
      fields: [],
    });

    expect(anchors[0].getAttribute('download')).toBe('html-render-schema-2026-01-01-00-00-00.json');
  });

  it('is a no-op (does not throw) in SSR contexts', () => {
    vi.stubGlobal('window', undefined);
    expect(() =>
      downloadSchemaJson({ version: 1, copiedAt: 0, html: '', fields: [] }),
    ).not.toThrow();
  });

  it('serializes the schema with two-space indentation inside the blob', () => {
    // Capture the raw string the Blob was constructed with — jsdom's Blob
    // does not implement `.text()`, so we sniff the constructor args instead.
    const capturedParts: BlobPart[][] = [];
    const RealBlob = global.Blob;
    class SpyBlob extends RealBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        capturedParts.push(parts);
      }
    }
    vi.stubGlobal('Blob', SpyBlob);
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });

    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag) as HTMLElement;
      if (tag === 'a') (el as HTMLAnchorElement).click = vi.fn();
      return el;
    });

    const schema: HtmlRenderSchema = {
      version: 1,
      copiedAt: 0,
      html: '<p>{{a}}</p>',
      fields: [makeField({ name: 'a' })],
    };
    downloadSchemaJson(schema);

    expect(capturedParts).toHaveLength(1);
    const text = capturedParts[0][0] as string;
    expect(typeof text).toBe('string');
    // Two-space pretty-print signature: a newline immediately followed by
    // exactly two spaces before the first key.
    expect(text).toContain('\n  "version": 1');
    expect(JSON.parse(text)).toEqual(schema);
  });
});
