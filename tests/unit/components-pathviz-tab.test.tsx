/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
/**
 * Path Visualizations ("Dev Paths") portal tab — Phase 4 (static rendering).
 *
 * Mirrors the harness in tests/unit/app-portal-automations-workflow-page.test.tsx:
 * reactflow is a canvas lib with browser APIs jsdom can't satisfy (element
 * measurement, ResizeObserver-driven zoom/pan), so the whole module is
 * stubbed to a passthrough div (`data-testid="reactflow-canvas"`) rather than
 * fought into rendering for real. What IS exercised for real:
 *   - PathVizTab: fetch -> gallery cards, empty state, click-through to
 *     PathChartView (which mounts the mocked canvas).
 *   - computeLaneLayout: pure function, no reactflow involved at all.
 *   - NodeInspector: plain presentational component, no reactflow involved.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Mocks (must precede imports under test) ────────────────────────────────

vi.mock('reactflow', () => {
  const ReactMod = require('react');
  function MockReactFlow({ children }: any) {
    return ReactMod.createElement('div', { 'data-testid': 'reactflow-canvas' }, children);
  }
  return {
    __esModule: true,
    default: MockReactFlow,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
  };
});
vi.mock('reactflow/dist/style.css', () => ({}));

// ─── Imports under test ──────────────────────────────────────────────────────

import PathVizTab from '@/components/portal/pathviz/PathVizTab';
import NodeInspector from '@/components/portal/pathviz/NodeInspector';
import { computeLaneLayout } from '@/components/portal/pathviz/pathviz-layout';
import type { PathVizNode, PathVizClaim } from '@/components/portal/pathviz/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<PathVizNode> & { id: number }): PathVizNode {
  return {
    chartId: 1,
    key: `node-${overrides.id}`,
    parentNodeId: null,
    kind: 'api',
    label: `Node ${overrides.id}`,
    routePath: null,
    filePath: null,
    status: 'planned',
    meta: {},
    position: null,
    lastVerifiedAt: null,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  };
}

function makeClaim(overrides: Partial<PathVizClaim> & { id: number; nodeId: number }): PathVizClaim {
  return {
    chartId: 1,
    agentLabel: 'claude/worker',
    intent: null,
    files: [],
    // Relative to `Date.now()`, not a fixed date — Phase 5's reducer applies
    // real TTL-expiry (pathviz-reducer.ts's `getActiveClaims`), so a claim
    // fixture meant to render as "currently active" has to actually be
    // unexpired whenever this suite runs, not just on the day it was written.
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    releasedAt: null,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    ...overrides,
  };
}

const chartListResponse = {
  success: true,
  data: [
    {
      id: 1,
      title: 'Saved Cards — End to End',
      description: 'Wallet, checkout payment, and billing history.',
      appLabel: 'acme-storefront',
      status: 'active',
      createdByAgent: 'claude/payments-api',
      updatedAt: new Date().toISOString(),
      nodeCount: 12,
      edgeCount: 18,
      lastEventAt: new Date().toISOString(), // recent -> LIVE badge
    },
    {
      id: 2,
      title: 'Legacy Import Tool',
      description: 'One-off admin import screen.',
      appLabel: 'acme-storefront',
      status: 'active',
      createdByAgent: 'claude/platform',
      updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
      nodeCount: 3,
      edgeCount: 2,
      lastEventAt: new Date(Date.now() - 86_400_000).toISOString(), // stale -> no LIVE badge
    },
  ],
};

const chartSnapshotResponse = {
  success: true,
  data: {
    chart: {
      id: 1,
      projectId: 42,
      title: 'Saved Cards — End to End',
      description: 'Wallet, checkout payment, and billing history.',
      appLabel: 'acme-storefront',
      status: 'active',
      createdByAgent: 'claude/payments-api',
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
    nodes: [
      makeNode({ id: 10, kind: 'screen', label: 'Wallet', routePath: '/wallet', status: 'wired' }),
      makeNode({ id: 11, kind: 'api', label: '/api/cards', status: 'shipped' }),
    ],
    edges: [
      { id: 100, chartId: 1, sourceNodeId: 10, targetNodeId: 11, kind: 'data', label: 'list + add', meta: null, createdAt: '2026-07-18T00:00:00.000Z' },
    ],
    activeClaims: [makeClaim({ id: 900, nodeId: 10, agentLabel: 'claude/wallet-ui' })],
    lastEventId: 42,
  },
};

// ─── Fetch mock ──────────────────────────────────────────────────────────────

function jsonResponse(body: any) {
  return Promise.resolve({ ok: true, json: async () => body } as any);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PathVizTab (Dev Paths gallery)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn((url: string) => {
      if (url.includes('/path-charts/1')) return jsonResponse(chartSnapshotResponse);
      if (url.includes('/path-charts')) return jsonResponse(chartListResponse);
      return jsonResponse({ success: false, message: 'unexpected url' });
    });
    (global as any).fetch = fetchMock;
  });

  it('renders a gallery card per chart, with LIVE badge only on the recent one', async () => {
    render(<PathVizTab projectId={42} />);

    expect(await screen.findByTestId('pathviz-chart-card-1')).toBeTruthy();
    expect(screen.getByTestId('pathviz-chart-card-2')).toBeTruthy();
    expect(screen.getByText('Saved Cards — End to End')).toBeTruthy();
    expect(screen.getByText('Legacy Import Tool')).toBeTruthy();

    // Chart 1's lastEventAt is "now" -> LIVE; chart 2's is 24h ago -> no badge.
    expect(screen.getByTestId('pathviz-live-badge-1')).toBeTruthy();
    expect(screen.queryByTestId('pathviz-live-badge-2')).toBeNull();

    expect(fetchMock).toHaveBeenCalledWith('/api/portal/projects/42/path-charts');
  });

  it('shows the empty state when the project has no charts', async () => {
    fetchMock = vi.fn(() => jsonResponse({ success: true, data: [] }));
    (global as any).fetch = fetchMock;

    render(<PathVizTab projectId={42} />);

    const empty = await screen.findByTestId('pathviz-empty-state');
    expect(empty.textContent).toContain('pathviz_create_chart');
  });

  it('opens PathChartView on card click and can navigate back to the gallery', async () => {
    render(<PathVizTab projectId={42} />);

    const card = await screen.findByTestId('pathviz-chart-card-1');
    fireEvent.click(card);

    await waitFor(() => expect(screen.getByTestId('pathviz-chart-view')).toBeTruthy());
    // The mocked reactflow canvas mounted inside PathChartCanvas.
    expect(screen.getByTestId('reactflow-canvas')).toBeTruthy();
    expect(screen.getAllByText('Saved Cards — End to End').length).toBeGreaterThan(0);
    // Agent legend chip derived from activeClaims.
    expect(screen.getByTestId('pathviz-agent-legend').textContent).toContain('claude/wallet-ui');

    fireEvent.click(screen.getByTestId('pathviz-back-to-gallery'));
    await waitFor(() => expect(screen.getByTestId('pathviz-chart-grid')).toBeTruthy());
  });
});

describe('computeLaneLayout (pure lane auto-layout helper)', () => {
  it('assigns kind -> lane rows: screen/component/test -> 0, api -> 1, job/infra -> 2, schema/service -> 3', () => {
    const nodes = [
      makeNode({ id: 1, kind: 'screen' }),
      makeNode({ id: 2, kind: 'api' }),
      makeNode({ id: 3, kind: 'job' }),
      makeNode({ id: 4, kind: 'infra' }),
      makeNode({ id: 5, kind: 'schema' }),
      makeNode({ id: 6, kind: 'service' }),
      makeNode({ id: 7, kind: 'test' }),
    ];
    const { laneOf } = computeLaneLayout(nodes);
    expect(laneOf[1]).toBe(0);
    expect(laneOf[7]).toBe(0);
    expect(laneOf[2]).toBe(1);
    expect(laneOf[3]).toBe(2);
    expect(laneOf[4]).toBe(2);
    expect(laneOf[5]).toBe(3);
    expect(laneOf[6]).toBe(3);
  });

  it('orders nodes within a lane by first-seen and spaces columns', () => {
    const nodes = [
      makeNode({ id: 1, kind: 'api', label: 'first' }),
      makeNode({ id: 2, kind: 'api', label: 'second' }),
    ];
    const { positions } = computeLaneLayout(nodes);
    expect(positions[1].x).toBeLessThan(positions[2].x);
    expect(positions[1].y).toBe(positions[2].y);
  });

  it('nests a `component` node under its `screen` parent as a chip, not a lane slot', () => {
    const nodes = [
      makeNode({ id: 1, kind: 'screen', label: 'Wallet' }),
      makeNode({ id: 2, kind: 'component', label: 'SavedCardList', parentNodeId: 1 }),
    ];
    const { nestedNodeIds, childrenByParent, positions } = computeLaneLayout(nodes);
    expect(nestedNodeIds.has(2)).toBe(true);
    expect(childrenByParent[1]).toEqual([2]);
    expect(positions[2]).toBeUndefined();
    expect(positions[1]).toBeDefined();
  });

  it('gives an orphan `component` (no screen parent) its own lane slot', () => {
    const nodes = [makeNode({ id: 1, kind: 'component', label: 'Orphan', parentNodeId: null })];
    const { nestedNodeIds, laneOf, positions } = computeLaneLayout(nodes);
    expect(nestedNodeIds.has(1)).toBe(false);
    expect(laneOf[1]).toBe(0);
    expect(positions[1]).toBeDefined();
  });

  it('lets an agent-declared node.position override win over the computed slot', () => {
    const nodes = [makeNode({ id: 1, kind: 'api', position: { x: 999, y: 999 } })];
    const { positions } = computeLaneLayout(nodes);
    expect(positions[1]).toEqual({ x: 999, y: 999 });
  });
});

describe('NodeInspector', () => {
  it('renders identity, declared state, external calls, and a single claim', () => {
    const node = makeNode({
      id: 5,
      kind: 'component',
      label: 'SavedCardList',
      routePath: null,
      filePath: 'components/wallet/SavedCardList.tsx',
      parentNodeId: 1,
      status: 'wired',
      meta: {
        state: 'cards: Card[]',
        stores: 'useWalletStore.cards',
        calls: 'GET /api/cards',
        notes: 'Needs a loading skeleton.',
      },
    });
    const claims = [makeClaim({ id: 1, nodeId: 5, agentLabel: 'claude/wallet-ui', intent: 'scaffolding list' })];

    render(<NodeInspector node={node} claims={claims} onClose={() => {}} parentLabel="Wallet" />);

    expect(screen.getByText('SavedCardList')).toBeTruthy();
    expect(screen.getByText('wired')).toBeTruthy();
    expect(screen.getByText('Needs a loading skeleton.')).toBeTruthy();
    expect(screen.getByText('component')).toBeTruthy();
    expect(screen.getByText('components/wallet/SavedCardList.tsx')).toBeTruthy();
    expect(screen.getByText('Wallet')).toBeTruthy();
    expect(screen.getByTestId('pathviz-external-calls').textContent).toContain('GET /api/cards');
    expect(screen.getByTestId('pathviz-claims-list').textContent).toContain('claude/wallet-ui');
    expect(screen.queryByTestId('pathviz-contested-banner')).toBeNull();
  });

  it('flags 2+ active claims on the same node as contested', () => {
    const node = makeNode({ id: 6, kind: 'api', label: '/api/checkout/intent' });
    const claims = [
      makeClaim({ id: 1, nodeId: 6, agentLabel: 'claude/wallet-ui' }),
      makeClaim({ id: 2, nodeId: 6, agentLabel: 'claude/payments-api' }),
    ];

    render(<NodeInspector node={node} claims={claims} onClose={() => {}} />);

    expect(screen.getByTestId('pathviz-contested-banner').textContent).toContain('2 agents');
  });

  it('shows "no active claims" when the node has none', () => {
    const node = makeNode({ id: 7, kind: 'schema', label: 'cards' });
    render(<NodeInspector node={node} claims={[]} onClose={() => {}} />);
    expect(screen.getByText('No active claims on this node.')).toBeTruthy();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    const node = makeNode({ id: 8, kind: 'test', label: 'wallet.spec.ts' });
    render(<NodeInspector node={node} claims={[]} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('pathviz-inspector-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
