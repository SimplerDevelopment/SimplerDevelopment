// @vitest-environment node
/**
 * Unit tests for the path/slug pure helpers in lib/brain/org-units.
 *
 * These functions are deliberately DB-free so the move + delete + merge
 * orchestrators can stay readable while the load-bearing string math is
 * exercised in isolation.
 *
 *   slugifyName(name)                  — name → slug
 *   nextAvailableSlug(base, taken)     — collision-suffix
 *   buildPath(parentPath, slug)        — root vs nested path
 *   rewriteSubtreePath(path, old, new) — used by move/merge/delete
 *   wouldCreateCycle(id, newParent, subtree) — cycle guard
 */
import { describe, it, expect, vi } from 'vitest';

// Avoid the DATABASE_URL trip-wire in @/lib/db at import time — these tests
// only exercise pure helpers from the module.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  brainOrgUnits: {},
  brainPersonOrgUnits: {},
  brainPeople: {},
}));
vi.mock('@/lib/brain/audit', () => ({ logAudit: vi.fn(async () => {}) }));

import {
  slugifyName,
  nextAvailableSlug,
  buildPath,
  rewriteSubtreePath,
  wouldCreateCycle,
} from '@/lib/brain/org-units';

describe('slugifyName', () => {
  it('lowercases + alphanumeric-dash', () => {
    expect(slugifyName('Engineering')).toBe('engineering');
    expect(slugifyName('Product & Design')).toBe('product-design');
    expect(slugifyName('  Trim  This  ')).toBe('trim-this');
  });
  it('falls back to "unit" when the result is empty', () => {
    expect(slugifyName('!!!')).toBe('unit');
    expect(slugifyName('')).toBe('unit');
  });
});

describe('nextAvailableSlug — collision suffixes', () => {
  it('returns base when free', () => {
    expect(nextAvailableSlug('eng', new Set())).toBe('eng');
  });
  it('suffixes -2, -3 on collision', () => {
    expect(nextAvailableSlug('eng', new Set(['eng']))).toBe('eng-2');
    expect(nextAvailableSlug('eng', new Set(['eng', 'eng-2']))).toBe('eng-3');
    expect(nextAvailableSlug('eng', new Set(['eng', 'eng-2', 'eng-3']))).toBe('eng-4');
  });
  it('skips gaps — finds the FIRST free numeric suffix', () => {
    // 'eng' taken but 'eng-2' free → 'eng-2'. We don't try to fill 'eng-4'.
    expect(nextAvailableSlug('eng', new Set(['eng', 'eng-3', 'eng-4']))).toBe('eng-2');
  });
});

describe('buildPath', () => {
  it('roots a top-level unit at /<slug>', () => {
    expect(buildPath(null, 'eng')).toBe('/eng');
  });
  it('appends to a parent path', () => {
    expect(buildPath('/eng', 'platform')).toBe('/eng/platform');
    expect(buildPath('/eng/platform', 'runtime')).toBe('/eng/platform/runtime');
  });
});

describe('rewriteSubtreePath — chain rewrites', () => {
  it('rewrites the matching prefix', () => {
    // a → b → c chain; b moves under /infra.
    // c's path /eng/platform/runtime must become /infra/platform/runtime.
    expect(rewriteSubtreePath('/eng/platform', '/eng/platform', '/infra/platform')).toBe('/infra/platform');
    expect(rewriteSubtreePath('/eng/platform/runtime', '/eng/platform', '/infra/platform')).toBe('/infra/platform/runtime');
    expect(rewriteSubtreePath('/eng/platform/runtime/k8s', '/eng/platform', '/infra/platform'))
      .toBe('/infra/platform/runtime/k8s');
  });

  it('full chain a → b → c: moving b under new parent updates b AND c', () => {
    const a = '/a';
    const b = '/a/b';
    const c = '/a/b/c';

    // b moves out from under a → /new/b
    const newB = '/new/b';
    expect(rewriteSubtreePath(b, b, newB)).toBe('/new/b');
    expect(rewriteSubtreePath(c, b, newB)).toBe('/new/b/c');

    // a is unaffected by the rewrite — caller never asks for its path to be
    // rewritten.
    expect(() => rewriteSubtreePath(a, b, newB)).toThrow();
  });

  it('throws when path is not actually under old root (caller bug)', () => {
    expect(() => rewriteSubtreePath('/other', '/eng', '/infra')).toThrow();
    // 'engine' is NOT a subpath of 'eng' — we require the / boundary.
    expect(() => rewriteSubtreePath('/engine', '/eng', '/infra')).toThrow();
  });
});

describe('wouldCreateCycle', () => {
  it('passes when new parent is unrelated', () => {
    const subtree = [{ id: 10 }, { id: 11 }, { id: 12 }];
    expect(wouldCreateCycle(10, 99, subtree)).toBe(false);
  });
  it('passes when new parent is null (becoming root)', () => {
    expect(wouldCreateCycle(10, null, [{ id: 10 }])).toBe(false);
  });
  it('catches "move into self"', () => {
    expect(wouldCreateCycle(10, 10, [{ id: 10 }])).toBe(true);
  });
  it('catches "move under own descendant"', () => {
    const subtree = [{ id: 10 }, { id: 11 }, { id: 12 }]; // 10 is moving, 11+12 are descendants
    expect(wouldCreateCycle(10, 11, subtree)).toBe(true);
    expect(wouldCreateCycle(10, 12, subtree)).toBe(true);
  });
});
