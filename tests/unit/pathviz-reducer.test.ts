/**
 * Path Visualizations ("Dev Paths") — Phase 5/6 pure reducer.
 *
 * No React, no reactflow, no DB — pure function tests over
 * components/portal/pathviz/pathviz-reducer.ts. Covers: determinism (the
 * load-bearing invariant both live and replay depend on), each event type's
 * effect on GraphState, claim TTL expiry, and presence staleness.
 */
import { describe, expect, it } from 'vitest';
import {
  applyEvent,
  createEmptyGraphState,
  foldEvents,
  getActiveClaims,
  getLivePresence,
  makeEdgeKey,
  seedGraphStateFromSnapshot,
  type GraphState,
  type PathVizStreamEvent,
} from '@/components/portal/pathviz/pathviz-reducer';
import type { PathVizSnapshot } from '@/components/portal/pathviz/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

let nextEventId = 1;
function ev(
  eventType: string,
  payload: unknown,
  agentLabel: string | null = 'claude/worker',
  createdAt?: string,
): PathVizStreamEvent {
  return {
    id: nextEventId++,
    eventType,
    payload,
    agentLabel,
    createdAt: createdAt ?? new Date(2026, 6, 18, 0, 0, nextEventId).toISOString(),
  };
}

function resetIds() {
  nextEventId = 1;
}

/** A representative session: two nodes, an edge, a status change, a claim, a note, a conflict. */
function buildSampleEvents(): PathVizStreamEvent[] {
  resetIds();
  const t0 = new Date('2026-07-18T00:00:00.000Z').getTime();
  const at = (offsetMs: number) => new Date(t0 + offsetMs).toISOString();
  return [
    ev('chart.created', { title: 'Saved Cards', appLabel: 'acme' }, 'claude/payments-api', at(0)),
    ev('node.upserted', { key: 'wallet', kind: 'screen', label: 'Wallet', status: 'planned', parentKey: null }, 'claude/wallet-ui', at(1000)),
    ev('node.upserted', { key: 'apiCards', kind: 'api', label: '/api/cards', status: 'planned', parentKey: null }, 'claude/payments-api', at(2000)),
    ev('edge.upserted', { sourceKey: 'wallet', targetKey: 'apiCards', kind: 'data', label: 'list + add' }, 'claude/wallet-ui', at(3000)),
    ev('agent.touch', { nodeKey: 'wallet', action: 'scaffolding' }, 'claude/wallet-ui', at(4000)),
    ev('claim', { nodeKey: 'wallet', intent: 'build wallet screen', files: ['app/wallet/page.tsx'], ttlMinutes: 30 }, 'claude/wallet-ui', at(5000)),
    ev('node.status', { key: 'wallet', status: 'scaffolded', note: null }, 'claude/wallet-ui', at(6000)),
    ev('note', { nodeKey: 'wallet', text: 'Starting the wallet screen.' }, 'claude/wallet-ui', at(7000)),
    ev('claim', { nodeKey: 'apiCards', intent: 'cards CRUD', files: ['app/api/cards/route.ts'], ttlMinutes: 30 }, 'claude/payments-api', at(7500)),
    ev('conflict', { nodeKeys: ['apiCards'], agents: ['claude/wallet-ui', 'claude/payments-api'], files: [] }, 'claude/wallet-ui', at(8000)),
    ev('release', { nodeKey: 'wallet', note: 'handed off' }, 'claude/wallet-ui', at(9000)),
    ev('node.status', { key: 'apiCards', status: 'error', note: 'schema mismatch' }, 'claude/payments-api', at(10_000)),
  ];
}

function makeSnapshot(): PathVizSnapshot {
  return {
    chart: {
      id: 1,
      projectId: 42,
      title: 'Saved Cards',
      description: null,
      appLabel: 'acme',
      status: 'active',
      createdByAgent: 'claude/payments-api',
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
    nodes: [
      {
        id: 10,
        chartId: 1,
        key: 'wallet',
        parentNodeId: null,
        kind: 'screen',
        label: 'Wallet',
        routePath: '/wallet',
        filePath: 'app/wallet/page.tsx',
        status: 'wired',
        meta: { notes: 'seeded note' },
        position: { x: 5, y: 6 },
        lastVerifiedAt: null,
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T00:05:00.000Z',
      },
    ],
    edges: [],
    activeClaims: [
      {
        id: 900,
        chartId: 1,
        nodeId: 10,
        agentLabel: 'claude/wallet-ui',
        intent: 'seeded claim',
        files: ['app/wallet/page.tsx'],
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        releasedAt: null,
        createdAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ],
    lastEventId: 5,
  };
}

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('foldEvents determinism', () => {
  it('produces identical state when folding the same events twice', () => {
    const events = buildSampleEvents();
    const a = foldEvents(events);
    const b = foldEvents(events);

    expect([...a.nodes.entries()]).toEqual([...b.nodes.entries()]);
    expect([...a.edges.entries()]).toEqual([...b.edges.entries()]);
    expect([...a.claims.entries()]).toEqual([...b.claims.entries()]);
    expect([...a.presence.entries()]).toEqual([...b.presence.entries()]);
    expect([...a.notes.entries()]).toEqual([...b.notes.entries()]);
    expect([...a.statusHistory.entries()]).toEqual([...b.statusHistory.entries()]);
    expect(a.lastEventId).toBe(b.lastEventId);
    expect(a.eventsApplied).toBe(b.eventsApplied);
  });

  it('produces the same state regardless of input order (sorts defensively by id)', () => {
    const events = buildSampleEvents();
    const shuffled = [...events].reverse();
    const ordered = foldEvents(events);
    const fromShuffled = foldEvents(shuffled);
    expect([...ordered.nodes.entries()]).toEqual([...fromShuffled.nodes.entries()]);
    expect(ordered.lastEventId).toBe(fromShuffled.lastEventId);
  });

  it('foldEvents(events, uptoId) — the scrubber "fold up to cursor" primitive — stops at (and includes) uptoId', () => {
    const events = buildSampleEvents();
    // uptoId = the 'wallet' node.status -> scaffolded event (index 6, 0-based) — everything after
    // (the note, the second claim, the conflict, the release, the error) must not be applied yet.
    const cursorEvent = events[6];
    expect(cursorEvent.eventType).toBe('node.status');

    const partial = foldEvents(events, cursorEvent.id);
    expect(partial.lastEventId).toBe(cursorEvent.id);
    expect(partial.nodes.get('wallet')?.status).toBe('scaffolded');
    expect(partial.notes.has('wallet')).toBe(false); // the note event (index 7) hasn't happened yet
    expect(partial.claims.get('apiCards')).toBeUndefined(); // apiCards claim (index 8) hasn't happened yet
    expect(partial.conflictsSeen).toBe(0);

    const full = foldEvents(events);
    expect(full.notes.has('wallet')).toBe(true);
    expect(full.conflictsSeen).toBe(1);
  });

  it('re-applying an already-applied event id is a no-op (idempotent)', () => {
    const events = buildSampleEvents();
    const once = foldEvents(events);
    const first = events[1]; // node.upserted for 'wallet'
    const twice = applyEvent(once, first);
    expect(twice).toBe(once); // same reference — nothing changed
  });
});

// ─── Per-event-type behavior ────────────────────────────────────────────────

describe('applyEvent — per event type', () => {
  it('node.upserted creates a node with bornAt/statusChangedAt and a first statusHistory entry', () => {
    resetIds();
    const e = ev('node.upserted', { key: 'wallet', kind: 'screen', label: 'Wallet', status: 'planned', parentKey: null });
    const state = applyEvent(createEmptyGraphState(), e);
    const node = state.nodes.get('wallet');
    expect(node).toBeDefined();
    expect(node?.status).toBe('planned');
    expect(node?.id).toBeLessThan(0); // synthesized id, never collides with a real positive DB id
    expect(state.statusHistory.get('wallet')).toHaveLength(1);
  });

  it('node.upserted on an existing node updates fields and only appends history when status actually changes', () => {
    const events = [
      ev('node.upserted', { key: 'wallet', kind: 'screen', label: 'Wallet', status: 'planned', parentKey: null }),
      ev('node.upserted', { key: 'wallet', kind: 'screen', label: 'Wallet', status: 'planned', parentKey: null }),
      ev('node.upserted', { key: 'wallet', kind: 'screen', label: 'Wallet renamed', status: 'scaffolded', parentKey: null }),
    ];
    const state = foldEvents(events);
    expect(state.nodes.get('wallet')?.label).toBe('Wallet renamed');
    expect(state.statusHistory.get('wallet')).toHaveLength(2); // planned (birth), then scaffolded — the redundant re-upsert added nothing
  });

  it('node.status flips status, records history, and mirrors the note into meta.notes', () => {
    const events = [
      ev('node.upserted', { key: 'apiCards', kind: 'api', label: '/api/cards', status: 'planned', parentKey: null }),
      ev('node.status', { key: 'apiCards', status: 'error', note: 'schema mismatch' }),
    ];
    const state = foldEvents(events);
    const node = state.nodes.get('apiCards');
    expect(node?.status).toBe('error');
    expect(node?.meta.notes).toBe('schema mismatch');
    expect(state.statusHistory.get('apiCards')?.at(-1)?.status).toBe('error');
  });

  it('node.removed deletes the node and cascades to its edges', () => {
    const events = [
      ev('node.upserted', { key: 'a', kind: 'screen', label: 'A', status: 'planned', parentKey: null }),
      ev('node.upserted', { key: 'b', kind: 'api', label: 'B', status: 'planned', parentKey: null }),
      ev('edge.upserted', { sourceKey: 'a', targetKey: 'b', kind: 'data', label: null }),
      ev('node.removed', { key: 'a' }),
    ];
    const state = foldEvents(events);
    expect(state.nodes.has('a')).toBe(false);
    expect(state.edges.size).toBe(0);
  });

  it('edge.upserted is keyed by source/target/kind and updates in place on re-upsert', () => {
    const events = [
      ev('node.upserted', { key: 'a', kind: 'screen', label: 'A', status: 'planned', parentKey: null }),
      ev('node.upserted', { key: 'b', kind: 'api', label: 'B', status: 'planned', parentKey: null }),
      ev('edge.upserted', { sourceKey: 'a', targetKey: 'b', kind: 'data', label: 'first' }),
      ev('edge.upserted', { sourceKey: 'a', targetKey: 'b', kind: 'data', label: 'relabeled' }),
    ];
    const state = foldEvents(events);
    expect(state.edges.size).toBe(1);
    expect(state.edges.get(makeEdgeKey('a', 'b', 'data'))?.label).toBe('relabeled');
  });

  it('edge.removed resolves by real DB id (from a snapshot seed) and is a documented no-op for edges created purely from events', () => {
    const snapshot = makeSnapshot();
    snapshot.edges = [
      { id: 555, chartId: 1, sourceNodeId: 10, targetNodeId: 10, kind: 'data', label: null, meta: null, createdAt: '2026-07-18T00:00:00.000Z' },
    ];
    // Self-loop isn't realistic, but we only care about id resolution here — swap target to a second seeded node instead.
    snapshot.nodes.push({
      id: 11,
      chartId: 1,
      key: 'apiCards',
      parentNodeId: null,
      kind: 'api',
      label: '/api/cards',
      routePath: '/api/cards',
      filePath: null,
      status: 'planned',
      meta: {},
      position: null,
      lastVerifiedAt: null,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    });
    snapshot.edges = [
      { id: 555, chartId: 1, sourceNodeId: 10, targetNodeId: 11, kind: 'data', label: null, meta: null, createdAt: '2026-07-18T00:00:00.000Z' },
    ];
    let state = seedGraphStateFromSnapshot(snapshot);
    expect(state.edges.size).toBe(1);
    state = applyEvent(state, ev('edge.removed', { id: 555 }));
    expect(state.edges.size).toBe(0);

    // An edge that only ever existed via events (no real DB id known) can't
    // be matched by a later edge.removed{id} — see the reducer's inline
    // comment on that branch for why this is an accepted limitation.
    const liveOnly = foldEvents([
      ev('node.upserted', { key: 'x', kind: 'screen', label: 'X', status: 'planned', parentKey: null }),
      ev('node.upserted', { key: 'y', kind: 'api', label: 'Y', status: 'planned', parentKey: null }),
      ev('edge.upserted', { sourceKey: 'x', targetKey: 'y', kind: 'data', label: null }),
      ev('edge.removed', { id: 999999 }),
    ]);
    expect(liveOnly.edges.size).toBe(1); // unresolvable id — edge survives
  });

  it('claim/release: multiple agents claiming the same node is "contested" (2+ entries); release only removes that agent', () => {
    const events = [
      ev('claim', { nodeKey: 'apiCards', intent: 'a', files: [], ttlMinutes: 30 }, 'claude/wallet-ui'),
      ev('claim', { nodeKey: 'apiCards', intent: 'b', files: [], ttlMinutes: 30 }, 'claude/payments-api'),
    ];
    let state = foldEvents(events);
    expect(state.claims.get('apiCards')).toHaveLength(2);

    state = applyEvent(state, ev('release', { nodeKey: 'apiCards', note: null }, 'claude/wallet-ui'));
    const remaining = state.claims.get('apiCards');
    expect(remaining).toHaveLength(1);
    expect(remaining?.[0].agentLabel).toBe('claude/payments-api');

    state = applyEvent(state, ev('release', { nodeKey: 'apiCards', note: null }, 'claude/payments-api'));
    expect(state.claims.has('apiCards')).toBe(false);
  });

  it('note appends to the thread in order; conflict increments conflictsSeen', () => {
    const events = [
      ev('note', { nodeKey: 'wallet', text: 'first' }, 'claude/wallet-ui'),
      ev('note', { nodeKey: 'wallet', text: 'second' }, 'claude/payments-api'),
      ev('conflict', { nodeKeys: ['wallet'], agents: ['claude/wallet-ui', 'claude/payments-api'], files: [] }),
    ];
    const state = foldEvents(events);
    expect(state.notes.get('wallet')?.map((n) => n.text)).toEqual(['first', 'second']);
    expect(state.conflictsSeen).toBe(1);
  });

  it('an unknown event type is ignored but still advances lastEventId/eventsApplied', () => {
    const events = [ev('some.future.event', { whatever: true })];
    const state = foldEvents(events);
    expect(state.lastEventId).toBe(events[0].id);
    expect(state.eventsApplied).toBe(1);
    expect(state.nodes.size).toBe(0);
  });
});

// ─── Snapshot seeding ────────────────────────────────────────────────────────

describe('seedGraphStateFromSnapshot', () => {
  it('preserves fields the event stream never carries (routePath/filePath/meta/position/real id)', () => {
    const state = seedGraphStateFromSnapshot(makeSnapshot());
    const node = state.nodes.get('wallet');
    expect(node?.id).toBe(10);
    expect(node?.routePath).toBe('/wallet');
    expect(node?.filePath).toBe('app/wallet/page.tsx');
    expect(node?.meta).toEqual({ notes: 'seeded note' });
    expect(node?.position).toEqual({ x: 5, y: 6 });
    expect(state.lastEventId).toBe(5);
  });

  it('a live node.upserted event on top of a seed updates status but keeps the seeded rich fields', () => {
    const seeded = seedGraphStateFromSnapshot(makeSnapshot());
    const next = applyEvent(
      seeded,
      ev('node.upserted', { key: 'wallet', kind: 'screen', label: 'Wallet', status: 'shipped', parentKey: null }, 'claude/wallet-ui', new Date().toISOString(), ),
    );
    const node = next.nodes.get('wallet');
    expect(node?.status).toBe('shipped');
    expect(node?.routePath).toBe('/wallet'); // untouched — node.upserted's payload never carries this
  });
});

// ─── Time-aware selectors ───────────────────────────────────────────────────

describe('getActiveClaims — lazy TTL expiry', () => {
  it('a claim is active before its ttl and gone once the reference clock passes it', () => {
    const createdAt = new Date('2026-07-18T00:00:00.000Z').toISOString();
    const createdMs = new Date(createdAt).getTime();
    let state: GraphState = createEmptyGraphState();
    state = applyEvent(state, ev('claim', { nodeKey: 'wallet', intent: 'x', files: [], ttlMinutes: 10 }, 'claude/wallet-ui', createdAt));

    const stillActive = getActiveClaims(state, createdMs + 5 * 60_000); // 5 min in — within the 10 min TTL
    expect(stillActive.get('wallet')).toHaveLength(1);

    const expired = getActiveClaims(state, createdMs + 11 * 60_000); // 11 min in — past the 10 min TTL
    expect(expired.has('wallet')).toBe(false);
  });

  it('is evaluated against the caller-supplied clock, not wall time — a replay cursor before expiry still sees it active', () => {
    const createdAt = new Date(Date.now() - 24 * 3_600_000).toISOString(); // created a day ago in wall-clock terms
    const createdMs = new Date(createdAt).getTime();
    let state: GraphState = createEmptyGraphState();
    state = applyEvent(state, ev('claim', { nodeKey: 'wallet', intent: 'x', files: [], ttlMinutes: 30 }, 'claude/wallet-ui', createdAt));

    // Even though this claim is long expired relative to Date.now(), a replay
    // cursor sitting 5 minutes after it was created still sees it as active.
    const replayCursor = createdMs + 5 * 60_000;
    expect(getActiveClaims(state, replayCursor).get('wallet')).toHaveLength(1);
    expect(getActiveClaims(state, Date.now()).has('wallet')).toBe(false);
  });
});

describe('getLivePresence — staleness', () => {
  it('drops a presence entry once it is older than staleMs relative to the reference clock', () => {
    const touchAt = new Date('2026-07-18T00:00:00.000Z').toISOString();
    const touchMs = new Date(touchAt).getTime();
    const state = applyEvent(createEmptyGraphState(), ev('agent.touch', { nodeKey: 'wallet', action: 'scaffolding' }, 'claude/wallet-ui', touchAt));

    expect(getLivePresence(state, touchMs + 5_000, 10_000).has('claude/wallet-ui')).toBe(true);
    expect(getLivePresence(state, touchMs + 11_000, 10_000).has('claude/wallet-ui')).toBe(false);
  });
});
