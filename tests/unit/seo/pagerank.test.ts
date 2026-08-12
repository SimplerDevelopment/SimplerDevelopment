// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { computePageRank, deriveLinkMetrics } from '@/lib/seo/pagerank';

function sum(map: Map<number, number>): number {
  let total = 0;
  for (const v of map.values()) total += v;
  return total;
}

describe('computePageRank — empty input', () => {
  it('returns an empty map for no nodes', () => {
    expect(computePageRank([], [])).toEqual(new Map());
  });

  it('returns an empty map even when edges reference nothing', () => {
    expect(computePageRank([], [{ from: 1, to: 2 }])).toEqual(new Map());
  });
});

describe('computePageRank — single node', () => {
  it('gives the sole node all the rank', () => {
    const r = computePageRank([1], []);
    expect(r.get(1)).toBeCloseTo(1, 5);
  });
});

describe('computePageRank — 3-node chain (1 -> 2 -> 3)', () => {
  // A pure chain: 3 is the sink of the graph (receives from 2, itself a
  // dangling node with no outlinks), so with mass redistribution it should
  // end up ranked highest, 1 lowest (it receives nothing).
  const nodes = [1, 2, 3];
  const edges = [
    { from: 1, to: 2 },
    { from: 2, to: 3 },
  ];
  const ranks = computePageRank(nodes, edges);

  it('sums to ~1', () => {
    expect(sum(ranks)).toBeCloseTo(1, 5);
  });

  it('orders 3 > 2 > 1 by rank', () => {
    expect(ranks.get(3)!).toBeGreaterThan(ranks.get(2)!);
    expect(ranks.get(2)!).toBeGreaterThan(ranks.get(1)!);
  });

  it('every node has a positive rank', () => {
    for (const n of nodes) expect(ranks.get(n)!).toBeGreaterThan(0);
  });
});

describe('computePageRank — 3-node cycle', () => {
  it('converges to equal rank for a symmetric cycle', () => {
    const ranks = computePageRank(
      [1, 2, 3],
      [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
        { from: 3, to: 1 },
      ]
    );
    expect(ranks.get(1)!).toBeCloseTo(1 / 3, 5);
    expect(ranks.get(2)!).toBeCloseTo(1 / 3, 5);
    expect(ranks.get(3)!).toBeCloseTo(1 / 3, 5);
    expect(sum(ranks)).toBeCloseTo(1, 5);
  });
});

describe('computePageRank — dangling nodes redistribute mass', () => {
  it('a dangling sink still ends up with positive rank, and total mass is conserved', () => {
    // 1 -> 2, 2 has no outlinks (dangling). Without redistribution, 2's
    // mass would leak out of the system each iteration.
    const ranks = computePageRank([1, 2], [{ from: 1, to: 2 }]);
    expect(ranks.get(2)!).toBeGreaterThan(0);
    expect(sum(ranks)).toBeCloseTo(1, 5);
  });

  it('all-dangling graph (no edges) stays uniform', () => {
    const ranks = computePageRank([1, 2, 3, 4], []);
    for (const n of [1, 2, 3, 4]) expect(ranks.get(n)!).toBeCloseTo(0.25, 5);
    expect(sum(ranks)).toBeCloseTo(1, 5);
  });
});

describe('computePageRank — edges referencing unknown nodes are ignored', () => {
  it('does not create phantom entries or crash', () => {
    const ranks = computePageRank(
      [1, 2],
      [
        { from: 1, to: 2 },
        { from: 1, to: 999 }, // unknown target
        { from: 999, to: 2 }, // unknown source
      ]
    );
    expect(ranks.size).toBe(2);
    expect(ranks.has(999)).toBe(false);
    expect(sum(ranks)).toBeCloseTo(1, 5);
  });
});

describe('computePageRank — duplicate edges collapse to one', () => {
  it('repeating the same edge does not inflate the target rank', () => {
    const once = computePageRank(
      [1, 2, 3],
      [
        { from: 1, to: 2 },
        { from: 3, to: 2 },
      ]
    );
    const duped = computePageRank(
      [1, 2, 3],
      [
        { from: 1, to: 2 },
        { from: 1, to: 2 },
        { from: 1, to: 2 },
        { from: 3, to: 2 },
      ]
    );
    expect(duped.get(2)!).toBeCloseTo(once.get(2)!, 10);
  });
});

describe('computePageRank — self-loops are ignored', () => {
  it('a self-loop does not change the outcome vs. no edges at all', () => {
    const withSelfLoop = computePageRank([1, 2], [{ from: 1, to: 1 }]);
    const noEdges = computePageRank([1, 2], []);
    expect(withSelfLoop.get(1)!).toBeCloseTo(noEdges.get(1)!, 10);
    expect(withSelfLoop.get(2)!).toBeCloseTo(noEdges.get(2)!, 10);
  });
});

describe('computePageRank — options', () => {
  it('respects a custom damping factor', () => {
    // damping 0 means every node gets exactly the teleport share, uniform,
    // regardless of link structure.
    const ranks = computePageRank(
      [1, 2, 3],
      [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ],
      { damping: 0 }
    );
    expect(ranks.get(1)!).toBeCloseTo(1 / 3, 10);
    expect(ranks.get(2)!).toBeCloseTo(1 / 3, 10);
    expect(ranks.get(3)!).toBeCloseTo(1 / 3, 10);
  });

  it('respects a custom iteration count without throwing', () => {
    const ranks = computePageRank([1, 2, 3], [{ from: 1, to: 2 }, { from: 2, to: 3 }], { iterations: 1 });
    expect(sum(ranks)).toBeCloseTo(1, 5);
  });
});

describe('deriveLinkMetrics', () => {
  it('computes incomingLinks as distinct source pages, excluding self', () => {
    const pages = [
      { id: 1, depth: 0 },
      { id: 2, depth: 1 },
      { id: 3, depth: 1 },
    ];
    const edges = [
      { from: 1, to: 2 },
      { from: 3, to: 2 },
      { from: 3, to: 2 }, // duplicate source->target, should not double-count
      { from: 2, to: 2 }, // self-loop, excluded
    ];
    const metrics = deriveLinkMetrics(pages, edges);
    expect(metrics.get(2)!.incomingLinks).toBe(2);
    expect(metrics.get(1)!.incomingLinks).toBe(0);
    expect(metrics.get(3)!.incomingLinks).toBe(0);
  });

  it('flags orphan when incomingLinks is 0 and depth > 0', () => {
    const pages = [
      { id: 1, depth: 0 }, // homepage, depth 0 — never orphan even with 0 incoming
      { id: 2, depth: 1 }, // linked from homepage — not orphan
      { id: 3, depth: 2 }, // unreachable except by URL guess — orphan
    ];
    const edges = [{ from: 1, to: 2 }];
    const metrics = deriveLinkMetrics(pages, edges);
    expect(metrics.get(1)!.orphan).toBe(false);
    expect(metrics.get(2)!.orphan).toBe(false);
    expect(metrics.get(3)!.orphan).toBe(true);
  });

  it('depth-0 page is never orphan even with zero incoming links', () => {
    const pages = [{ id: 1, depth: 0 }];
    const metrics = deriveLinkMetrics(pages, []);
    expect(metrics.get(1)!.incomingLinks).toBe(0);
    expect(metrics.get(1)!.orphan).toBe(false);
  });

  it('populates internalRank from computePageRank consistently', () => {
    const pages = [
      { id: 1, depth: 0 },
      { id: 2, depth: 1 },
      { id: 3, depth: 1 },
    ];
    const edges = [
      { from: 1, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 3 },
    ];
    const metrics = deriveLinkMetrics(pages, edges);
    const directRanks = computePageRank([1, 2, 3], edges);
    expect(metrics.get(1)!.internalRank).toBeCloseTo(directRanks.get(1)!, 10);
    expect(metrics.get(2)!.internalRank).toBeCloseTo(directRanks.get(2)!, 10);
    expect(metrics.get(3)!.internalRank).toBeCloseTo(directRanks.get(3)!, 10);
    // 3 receives links from both 1 and 2 — should outrank 2, which only
    // receives from 1.
    expect(metrics.get(3)!.internalRank).toBeGreaterThan(metrics.get(2)!.internalRank);
  });

  it('returns one entry per page, in no particular guaranteed order', () => {
    const pages = [
      { id: 5, depth: 0 },
      { id: 6, depth: 1 },
    ];
    const metrics = deriveLinkMetrics(pages, []);
    expect(metrics.size).toBe(2);
    expect(metrics.has(5)).toBe(true);
    expect(metrics.has(6)).toBe(true);
  });
});
