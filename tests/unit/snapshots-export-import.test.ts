// Pure-function unit tests for the snapshot export/import primitives.
// Covers slug uniquification on collision and the flat ↔ tree round-trip
// for navigation rows. The DB-backed export/import functions are exercised
// by tests/e2e/snapshots.spec.ts; here we just lock the shape contracts.

import { describe, it, expect } from 'vitest';
import { uniquifySlug, buildNavTree, flattenNavTree, type FlatNavRow } from '@/lib/snapshots/util';
import type { SnapshotPayload } from '@/lib/snapshots/types';

describe('uniquifySlug', () => {
  it('returns the original slug when not in use', () => {
    expect(uniquifySlug('about', new Set(['contact']))).toBe('about');
  });

  it('appends -imported-1 on first collision', () => {
    expect(uniquifySlug('about', new Set(['about']))).toBe('about-imported-1');
  });

  it('finds the next free suffix when prior imports exist', () => {
    const used = new Set(['about', 'about-imported-1', 'about-imported-2']);
    expect(uniquifySlug('about', used)).toBe('about-imported-3');
  });

  it('does not mutate the input set', () => {
    const used = new Set(['about']);
    uniquifySlug('about', used);
    expect(Array.from(used)).toEqual(['about']);
  });

  it('handles empty-set baseline', () => {
    expect(uniquifySlug('home', new Set<string>())).toBe('home');
  });
});

describe('buildNavTree', () => {
  it('rebuilds a 2-level tree from flat rows', () => {
    const rows: FlatNavRow[] = [
      { id: 1, parentId: null, label: 'Home', href: '/', sortOrder: 0 },
      { id: 2, parentId: null, label: 'Services', href: '/services', sortOrder: 1 },
      { id: 3, parentId: 2, label: 'Web', href: '/services/web', sortOrder: 0 },
      { id: 4, parentId: 2, label: 'Mobile', href: '/services/mobile', sortOrder: 1 },
    ];

    const tree = buildNavTree(rows);
    expect(tree).toHaveLength(2);
    expect(tree[0].label).toBe('Home');
    expect(tree[1].label).toBe('Services');
    expect(tree[1].children).toHaveLength(2);
    expect(tree[1].children?.[0].label).toBe('Web');
    expect(tree[1].children?.[1].label).toBe('Mobile');
  });

  it('returns leaves with empty children array', () => {
    const rows: FlatNavRow[] = [
      { id: 1, parentId: null, label: 'Home', href: '/' },
    ];
    const tree = buildNavTree(rows);
    expect(tree[0].children).toEqual([]);
  });

  it('orders siblings by sortOrder', () => {
    const rows: FlatNavRow[] = [
      { id: 1, parentId: null, label: 'B', href: '/b', sortOrder: 1 },
      { id: 2, parentId: null, label: 'A', href: '/a', sortOrder: 0 },
    ];
    const tree = buildNavTree(rows);
    expect(tree.map((e) => e.label)).toEqual(['A', 'B']);
  });

  it('flattenNavTree reverses buildNavTree (preserving label/href)', () => {
    const rows: FlatNavRow[] = [
      { id: 1, parentId: null, label: 'A', href: '/a', sortOrder: 0 },
      { id: 2, parentId: 1, label: 'A1', href: '/a/1', sortOrder: 0 },
      { id: 3, parentId: null, label: 'B', href: '/b', sortOrder: 1 },
    ];
    const flat = flattenNavTree(buildNavTree(rows));
    expect(flat.map((e) => `${e.depth}:${e.label}`)).toEqual([
      '0:A',
      '1:A1',
      '0:B',
    ]);
  });
});

describe('SnapshotPayload shape', () => {
  it('a minimal valid payload type-checks', () => {
    // This test exists mostly for the type assertion — if the shape ever
    // drifts in types.ts, this fixture won't compile.
    const payload: SnapshotPayload = {
      schemaVersion: 1,
      site: {
        name: 'Test Site',
        settings: { description: 'A site', active: true, customLayout: false, publicAccess: false },
        customCode: { customCss: null, customJs: null },
      },
      posts: [
        {
          slug: 'home',
          type: 'page',
          title: 'Home',
          status: 'published',
          content: { blocks: [], version: '1.0' },
          meta: {
            excerpt: null,
            coverImage: null,
            seoTitle: null,
            seoDescription: null,
            ogImage: null,
            noIndex: false,
            canonicalUrl: null,
            customCss: null,
            customJs: null,
          },
        },
      ],
      navigation: [{ key: 'main', items: [{ label: 'Home', href: '/', children: [] }] }],
      blockTemplates: [],
      postTypes: [],
    };

    expect(payload.schemaVersion).toBe(1);
    expect(payload.posts).toHaveLength(1);
    expect(payload.posts[0].slug).toBe('home');
  });

  it('round-trips through JSON.stringify without losing structure', () => {
    const payload: SnapshotPayload = {
      schemaVersion: 1,
      site: { name: 'X', settings: {} },
      posts: [
        { slug: 'a', type: 'page', title: 'A', status: 'draft', content: { foo: 'bar' } },
      ],
      navigation: [],
    };
    const round = JSON.parse(JSON.stringify(payload)) as SnapshotPayload;
    expect(round).toEqual(payload);
    expect(round.posts[0].content).toEqual({ foo: 'bar' });
  });
});

describe('import slug-conflict simulation', () => {
  // Lightweight sim of the import slug-conflict logic — verifies that
  // running `uniquifySlug` over a list of incoming slugs against the
  // pre-existing set correctly walks suffixes.
  it('resolves multiple incoming collisions onto the same base', () => {
    const existing = new Set(['about']);
    const incoming = ['about', 'about', 'home'];
    const final: string[] = [];
    for (const s of incoming) {
      const f = uniquifySlug(s, existing);
      final.push(f);
      existing.add(f);
    }
    expect(final).toEqual(['about-imported-1', 'about-imported-2', 'home']);
  });
});
