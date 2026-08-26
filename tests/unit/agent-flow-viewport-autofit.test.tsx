/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
/**
 * AgentFlowTab — the canvas must always auto-frame, even for a flow whose
 * stored graph already carries a `viewport` (PUX-038, part 2).
 *
 * `buildSaveGraph` (see `agent-flow-save-graph.test.ts`) stops NEW writes of
 * `graph.viewport`, but that alone leaves every flow saved BEFORE the fix
 * broken forever: such a flow has no UI affordance to trigger a Save, and may
 * be opened only by people without edit rights. The coordinator's fix is on
 * the read side — the canvas must ignore `graph.viewport` entirely and always
 * `fitView`, so an already-affected flow repairs itself on its very next
 * load instead of waiting on a Save that may never come.
 *
 * This mounts the real `AgentFlowTab` (mocking only `reactflow` itself, the
 * same pattern the sibling `app/portal/automations/workflows/[id]/page.tsx`
 * test already uses) against a flow whose `graph.viewport` is a poisoned
 * value, and asserts the canvas is told to `fitView` regardless — the one
 * thing a stored viewport must NOT be able to suppress.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Captures the props the real ReactFlow component would have received —
// exactly what we need to check without measuring a real canvas in jsdom.
let lastReactFlowProps: Record<string, any> | null = null;

vi.mock('reactflow', () => {
  const ReactLocal = require('react');
  function MockReactFlow(props: any) {
    lastReactFlowProps = props;
    return ReactLocal.createElement('div', { 'data-testid': 'reactflow-canvas' });
  }
  function MockBackground() { return null; }
  function MockControls() { return null; }
  function MockMiniMap() { return null; }
  return {
    __esModule: true,
    default: MockReactFlow,
    Background: MockBackground,
    Controls: MockControls,
    MiniMap: MockMiniMap,
    addEdge: (conn: any, eds: any[]) => [...eds, conn],
    applyNodeChanges: (_changes: any, nds: any[]) => nds,
    applyEdgeChanges: (_changes: any, eds: any[]) => eds,
  };
});
vi.mock('reactflow/dist/style.css', () => ({}));

// Imported AFTER the mocks above so AgentFlowTab picks up the mocked module.
import AgentFlowTab from '@/components/portal/AgentFlowTab';

const POISONED_VIEWPORT = { x: 999, y: 999, zoom: 3 };

const flowSummary = { id: 1, name: 'Ship it', status: 'draft', updatedAt: new Date().toISOString(), nodeCount: 1, edgeCount: 0 };

const flowDetail = {
  id: 1,
  projectId: 42,
  clientId: 1,
  name: 'Ship it',
  description: null,
  status: 'draft',
  graph: {
    nodes: [{ id: 'n1', position: { x: 0, y: 0 }, data: { kind: 'step', agentType: null, label: 'Step one' } }],
    edges: [],
    // Leftover from before PUX-038 — exactly the case this test guards.
    viewport: POISONED_VIEWPORT,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
}

beforeEach(() => {
  lastReactFlowProps = null;
  global.fetch = vi.fn((url: string) => {
    if (url.includes('/members')) return jsonResponse({ success: true, data: [] });
    if (url.endsWith('/flows')) return jsonResponse({ success: true, data: [flowSummary] });
    if (url.includes('/flows/1')) return jsonResponse({ success: true, data: flowDetail });
    return jsonResponse({ success: false });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AgentFlowTab — auto-fit ignores a stored viewport @agent-flows', () => {
  it('still auto-frames a flow whose graph already has a poisoned viewport', async () => {
    render(<AgentFlowTab projectId={42} canEdit={true} />);

    await waitFor(() => expect(lastReactFlowProps).not.toBeNull());

    expect(lastReactFlowProps!.fitView).toBe(true);
    // The stored viewport must not reach the canvas at all — passing it as
    // `defaultViewport` is exactly what re-creates the original bug.
    expect(lastReactFlowProps!.defaultViewport).toBeUndefined();
  });
});
