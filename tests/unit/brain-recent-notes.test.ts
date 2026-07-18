/**
 * Unit tests for the localStorage ring-buffer in lib/brain/recent-notes.ts.
 * Runs in the default jsdom environment so `window.localStorage` exists.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getRecentNoteIds,
  pushRecentNoteId,
} from '@/lib/brain/recent-notes';

const STORAGE_KEY = 'brain.knowledge.recent';
const MAX_RECENT = 12;

describe('getRecentNoteIds', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns [] when storage is empty', () => {
    expect(getRecentNoteIds()).toEqual([]);
  });

  it('returns parsed array of valid numeric ids', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([3, 2, 1]));
    expect(getRecentNoteIds()).toEqual([3, 2, 1]);
  });

  it('returns [] when storage has malformed JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not-json');
    expect(getRecentNoteIds()).toEqual([]);
  });

  it('returns [] when stored value is not an array', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ recent: [1, 2] }));
    expect(getRecentNoteIds()).toEqual([]);
  });

  it('filters out non-finite ids (NaN, Infinity, strings, null)', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([1, 'two', NaN, null, 4, Infinity, 5]),
    );
    // JSON.stringify turns NaN/Infinity into null — they're filtered as
    // non-finite numbers anyway. Strings and nulls are filtered because
    // they aren't `typeof === 'number'`.
    expect(getRecentNoteIds()).toEqual([1, 4, 5]);
  });

  it('caps the returned list to MAX_RECENT entries', () => {
    const stored = Array.from({ length: 20 }, (_v, i) => i + 1);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    expect(getRecentNoteIds()).toHaveLength(MAX_RECENT);
    expect(getRecentNoteIds()).toEqual(stored.slice(0, MAX_RECENT));
  });
});

describe('pushRecentNoteId', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('writes the id at the head when storage was empty', () => {
    pushRecentNoteId(42);
    expect(getRecentNoteIds()).toEqual([42]);
  });

  it('prepends new ids and preserves the previous order behind them', () => {
    pushRecentNoteId(1);
    pushRecentNoteId(2);
    pushRecentNoteId(3);
    expect(getRecentNoteIds()).toEqual([3, 2, 1]);
  });

  it('dedupes — pushing an existing id moves it to the front', () => {
    pushRecentNoteId(1);
    pushRecentNoteId(2);
    pushRecentNoteId(3);
    pushRecentNoteId(1);
    expect(getRecentNoteIds()).toEqual([1, 3, 2]);
  });

  it('caps the ring buffer at MAX_RECENT entries when pushing many ids', () => {
    for (let i = 1; i <= 13; i++) pushRecentNoteId(i);
    const ids = getRecentNoteIds();
    expect(ids).toHaveLength(MAX_RECENT);
    // Most-recent first; oldest (1) was dropped when the 13th push trimmed.
    expect(ids[0]).toBe(13);
    expect(ids).not.toContain(1);
  });

  it('ignores non-finite ids without throwing or mutating storage', () => {
    pushRecentNoteId(7);
    pushRecentNoteId(Number.NaN);
    pushRecentNoteId(Number.POSITIVE_INFINITY);
    pushRecentNoteId(Number.NEGATIVE_INFINITY);
    expect(getRecentNoteIds()).toEqual([7]);
  });
});

describe('SSR safety (window === undefined)', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    // Restore window so subsequent tests in the file (if any) work.
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
  });

  it('getRecentNoteIds returns [] when window is undefined', async () => {
    // Re-import the module under a stripped global to exercise the SSR guard.
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    vi.resetModules();
    const mod = await import('@/lib/brain/recent-notes');
    expect(mod.getRecentNoteIds()).toEqual([]);
    expect(() => mod.pushRecentNoteId(1)).not.toThrow();
  });
});
