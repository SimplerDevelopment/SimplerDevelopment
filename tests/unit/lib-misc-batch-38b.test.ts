// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// db mock — drives lib/portal/promote-content-type.ts
// ---------------------------------------------------------------------------
type PostTypeRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  active: boolean;
  websiteId: number | null;
};

interface DbState {
  selectQueue: Array<PostTypeRow[]>;
  insertReturn: PostTypeRow[];
  selectCalls: Array<{ where: unknown }>;
  insertCalls: Array<{ values: Partial<PostTypeRow> }>;
}

const dbState: DbState = {
  selectQueue: [],
  insertReturn: [],
  selectCalls: [],
  insertCalls: [],
};

function makeSelectChain() {
  const chain: Record<string, unknown> = {
    from() {
      return chain;
    },
    where(predicate: unknown) {
      // Capture for assertions
      dbState.selectCalls.push({ where: predicate });
      return chain;
    },
    limit(_n: number) {
      const next = dbState.selectQueue.shift() ?? [];
      return Promise.resolve(next);
    },
  };
  return chain;
}

function makeInsertChain() {
  const chain: Record<string, unknown> = {
    values(vals: Partial<PostTypeRow>) {
      dbState.insertCalls.push({ values: vals });
      return chain;
    },
    returning() {
      return Promise.resolve(dbState.insertReturn);
    },
  };
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  postTypes: {
    id: { _: 'postTypes.id' },
    slug: { _: 'postTypes.slug' },
    websiteId: { _: 'postTypes.websiteId' },
  },
}));

// Light drizzle-orm helper mock — we only need them to be callable
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ __op: 'eq', a, b }),
  and: (...parts: unknown[]) => ({ __op: 'and', parts }),
  isNull: (a: unknown) => ({ __op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// Imports happen after mocks
const elementStylesMod = await import('@/lib/utils/elementStyles');
const settingsWindowStorageMod = await import('@/lib/utils/settingsWindowStorage');
const cnMod = await import('@/lib/utils/cn');
const promoteMod = await import('@/lib/portal/promote-content-type');

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.insertReturn = [];
  dbState.selectCalls = [];
  dbState.insertCalls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ===========================================================================
// 1. lib/utils/elementStyles.ts
// ===========================================================================

describe('lib/utils/elementStyles', () => {
  const { elementStyleToCSS, getElementCSS } = elementStylesMod;

  describe('elementStyleToCSS', () => {
    it('returns an empty object when style is undefined', () => {
      expect(elementStyleToCSS(undefined)).toEqual({});
    });

    it('returns an empty object when style is an empty object', () => {
      expect(elementStyleToCSS({})).toEqual({});
    });

    it('maps each set property onto the CSSProperties result', () => {
      const css = elementStyleToCSS({
        color: 'red',
        backgroundColor: 'blue',
        fontSize: '16px',
        fontFamily: 'Inter',
        fontWeight: '600',
        lineHeight: '1.5',
        letterSpacing: '0.05em',
        textAlign: 'center',
        textTransform: 'uppercase',
        padding: '10px',
        margin: '4px',
        borderRadius: '4px',
        borderWidth: '1px',
        borderColor: '#000',
        borderStyle: 'solid',
        boxShadow: '0 0 5px black',
        opacity: 0.5,
        width: '100px',
        height: '50px',
        maxWidth: '200px',
        minHeight: '20px',
        backgroundImage: 'url(foo.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        gap: '8px',
      });

      expect(css).toMatchObject({
        color: 'red',
        backgroundColor: 'blue',
        fontSize: '16px',
        fontFamily: 'Inter',
        fontWeight: '600',
        lineHeight: '1.5',
        letterSpacing: '0.05em',
        textAlign: 'center',
        textTransform: 'uppercase',
        padding: '10px',
        margin: '4px',
        borderRadius: '4px',
        borderWidth: '1px',
        borderColor: '#000',
        borderStyle: 'solid',
        boxShadow: '0 0 5px black',
        opacity: 0.5,
        width: '100px',
        height: '50px',
        maxWidth: '200px',
        minHeight: '20px',
        backgroundImage: 'url(foo.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        gap: '8px',
      });
    });

    it('explicitly handles opacity of 0 (does not treat 0 as falsy)', () => {
      const css = elementStyleToCSS({ opacity: 0 });
      expect(css.opacity).toBe(0);
    });

    it('omits properties that are not set', () => {
      const css = elementStyleToCSS({ color: 'red' });
      expect(css).toEqual({ color: 'red' });
      expect(css).not.toHaveProperty('backgroundColor');
      expect(css).not.toHaveProperty('fontSize');
    });

    it('parses customCSS strings into camelCased keys', () => {
      const css = elementStyleToCSS({
        customCSS: 'text-transform: uppercase; padding: 14px 32px',
      });
      expect((css as Record<string, unknown>).textTransform).toBe('uppercase');
      expect((css as Record<string, unknown>).padding).toBe('14px 32px');
    });

    it('skips malformed customCSS rules (missing colon, empty prop/value)', () => {
      const css = elementStyleToCSS({
        customCSS: 'no-colon-here;: empty-prop;empty-value:;text-align: left',
      });
      // The well-formed rule should still come through
      expect((css as Record<string, unknown>).textAlign).toBe('left');
      // Bogus camelCases should not appear
      expect(Object.keys(css)).toEqual(['textAlign']);
    });

    it('lets customCSS override sibling fields by overwriting same key', () => {
      const css = elementStyleToCSS({
        padding: '5px',
        customCSS: 'padding: 20px',
      });
      expect((css as Record<string, unknown>).padding).toBe('20px');
    });

    it('handles trailing semicolons gracefully', () => {
      const css = elementStyleToCSS({
        customCSS: 'color: red;;;',
      });
      expect((css as Record<string, unknown>).color).toBe('red');
    });
  });

  describe('getElementCSS', () => {
    it('returns {} when elementStyles is undefined', () => {
      expect(getElementCSS(undefined, 'cta')).toEqual({});
    });

    it('returns {} when the requested element key is not present', () => {
      expect(getElementCSS({ heading: { color: 'red' } }, 'cta')).toEqual({});
    });

    it('delegates to elementStyleToCSS for the requested element', () => {
      const out = getElementCSS(
        { cta: { color: 'red', backgroundColor: 'blue' } },
        'cta',
      );
      expect(out).toEqual({ color: 'red', backgroundColor: 'blue' });
    });
  });
});

// ===========================================================================
// 2. lib/utils/settingsWindowStorage.ts
// ===========================================================================

describe('lib/utils/settingsWindowStorage', () => {
  const { saveWindowConfig, getStoredWindowConfig, getDefaultWindowConfig } =
    settingsWindowStorageMod;
  const STORAGE_KEY = 'block-editor-settings-window-config';

  beforeEach(() => {
    localStorage.clear();
  });

  describe('saveWindowConfig', () => {
    it('serializes config and writes it under the canonical key', () => {
      const config = { width: 800, height: 600, left: 100, top: 50 };
      saveWindowConfig(config);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string)).toEqual(
        config,
      );
    });

    it('swallows localStorage errors and logs to console.error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const setSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('quota exceeded');
        });
      expect(() =>
        saveWindowConfig({ width: 1, height: 1, left: 1, top: 1 }),
      ).not.toThrow();
      expect(spy).toHaveBeenCalledWith(
        'Failed to save window config:',
        expect.any(Error),
      );
      spy.mockRestore();
      setSpy.mockRestore();
    });
  });

  describe('getStoredWindowConfig', () => {
    it('returns null when nothing is stored', () => {
      expect(getStoredWindowConfig()).toBeNull();
    });

    it('returns the parsed config when valid data is stored', () => {
      const config = { width: 800, height: 600, left: 100, top: 50 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      expect(getStoredWindowConfig()).toEqual(config);
    });

    it('returns null when stored value is malformed JSON', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, 'not-json{');
      expect(getStoredWindowConfig()).toBeNull();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('returns null when stored value is missing required numeric fields', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ width: 'big', height: 600, left: 100, top: 50 }),
      );
      expect(getStoredWindowConfig()).toBeNull();
    });

    it('returns null when stored object is missing keys entirely', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 800 }));
      expect(getStoredWindowConfig()).toBeNull();
    });
  });

  describe('getDefaultWindowConfig', () => {
    it('centers a 400x600 window on the screen using window.screen dimensions', () => {
      // jsdom defaults are commonly 0; stub deterministically.
      Object.defineProperty(window.screen, 'width', {
        value: 1600,
        configurable: true,
      });
      Object.defineProperty(window.screen, 'height', {
        value: 1000,
        configurable: true,
      });

      const config = getDefaultWindowConfig();
      expect(config).toEqual({
        width: 400,
        height: 600,
        left: 1600 / 2 - 400 / 2,
        top: 1000 / 2 - 600 / 2,
      });
    });
  });
});

// ===========================================================================
// 3. lib/utils/cn.ts
// ===========================================================================

describe('lib/utils/cn', () => {
  const { cn } = cnMod;

  it('merges plain string classes', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('skips falsy values via clsx semantics', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('honors object-style conditional classes', () => {
    expect(cn('a', { b: true, c: false, d: true })).toBe('a b d');
  });

  it('honors array nesting', () => {
    expect(cn(['a', ['b', { c: true }]])).toBe('a b c');
  });

  it('deduplicates conflicting Tailwind classes with twMerge precedence', () => {
    // Later value wins via tailwind-merge
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('returns an empty string when given no arguments', () => {
    expect(cn()).toBe('');
  });
});

// ===========================================================================
// 4. lib/portal/promote-content-type.ts
// ===========================================================================

describe('lib/portal/promote-content-type', () => {
  const { promoteBuiltInContentType } = promoteMod;

  function row(over: Partial<PostTypeRow> = {}): PostTypeRow {
    return {
      id: 1,
      name: 'Page',
      slug: 'page',
      description: 'Pages',
      icon: 'file',
      active: true,
      websiteId: null,
      ...over,
    };
  }

  it('returns null when the typeId does not exist', async () => {
    dbState.selectQueue = [[]]; // empty first select
    const out = await promoteBuiltInContentType(42, 999);
    expect(out).toBeNull();
  });

  it('returns {redirected:false} when the type is already site-scoped to THIS site', async () => {
    dbState.selectQueue = [[row({ id: 7, websiteId: 42 })]];
    const out = await promoteBuiltInContentType(42, 7);
    expect(out).toEqual({ id: 7, redirected: false });
    // No insert and no second select should have happened
    expect(dbState.insertCalls).toHaveLength(0);
    expect(dbState.selectCalls).toHaveLength(1);
  });

  it('returns null when the type is site-scoped to a DIFFERENT site (cross-site refusal)', async () => {
    dbState.selectQueue = [[row({ id: 7, websiteId: 99 })]];
    const out = await promoteBuiltInContentType(42, 7);
    expect(out).toBeNull();
    expect(dbState.insertCalls).toHaveLength(0);
  });

  it('returns the existing site-scoped sibling matched by slug', async () => {
    dbState.selectQueue = [
      [row({ id: 1, websiteId: null, slug: 'page' })], // built-in
      [row({ id: 88, websiteId: 42, slug: 'page' })], // existing sibling
    ];
    const out = await promoteBuiltInContentType(42, 1);
    expect(out).toEqual({ id: 88, redirected: true });
    // No insert because we reused the sibling
    expect(dbState.insertCalls).toHaveLength(0);
  });

  it('creates a new site-scoped fork when no sibling exists, carrying over fields', async () => {
    dbState.selectQueue = [
      [
        row({
          id: 1,
          websiteId: null,
          name: 'Blog',
          slug: 'blog',
          description: 'Blog posts',
          icon: 'rss',
        }),
      ],
      [], // no existing sibling
    ];
    dbState.insertReturn = [
      row({
        id: 555,
        websiteId: 42,
        name: 'Blog',
        slug: 'blog',
        description: 'Blog posts',
        icon: 'rss',
      }),
    ];

    const out = await promoteBuiltInContentType(42, 1);
    expect(out).toEqual({ id: 555, redirected: true });

    expect(dbState.insertCalls).toHaveLength(1);
    expect(dbState.insertCalls[0].values).toMatchObject({
      name: 'Blog',
      slug: 'blog',
      description: 'Blog posts',
      icon: 'rss',
      active: true,
      websiteId: 42,
    });
  });
});
