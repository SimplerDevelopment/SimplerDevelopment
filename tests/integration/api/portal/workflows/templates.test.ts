/**
 * Visual workflow builder — GET /api/portal/workflows/templates.
 *
 * The route exposes a slim listing of the 5 seed templates the UI clones from.
 * The full graph stays server-side until POST /api/portal/workflows is called
 * with `templateId` (covered by crud.test.ts).
 *
 * Coverage:
 *   - Auth (401).
 *   - Returns exactly 5 entries with the expected shape.
 *   - The seed templates remain graph-valid: every non-trigger node is
 *     reachable from a trigger, every edge endpoint maps to a node id. (This
 *     mirrors the unit-test invariant in tests/unit/workflows-templates.test.ts
 *     but proves it through the public HTTP surface.)
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { WORKFLOW_TEMPLATES } from '@/lib/workflows/templates';
import type { WorkflowGraph, WorkflowNode } from '@/lib/workflows/types';

interface TemplateListItem {
  id: string;
  icon: string;
  name: string;
  description: string;
  triggerKind: string;
  nodeCount: number;
}

describe('GET /api/portal/workflows/templates @workflows @templates', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('templates'); });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/workflows/templates/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', {});
    expect(res.status).toBe(401);
  });

  it('returns the 5 seed templates with the slim shape', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/workflows/templates/route');
    const res = await callHandler<{ data: TemplateListItem[] }>(
      route as unknown as Record<string, unknown>, 'GET', {},
    );
    expect(res.status).toBe(200);
    const data = res.data?.data ?? [];
    expect(data).toHaveLength(5);

    const ids = data.map((t) => t.id).sort();
    expect(ids).toEqual([
      'form-submission-auto-task',
      'new-lead-nurture',
      'stage-advance-celebration',
      'stale-deal-nudge',
      'webhook-to-slack',
    ]);

    for (const item of data) {
      expect(typeof item.icon).toBe('string');
      expect(item.icon.length).toBeGreaterThan(0);
      expect(typeof item.name).toBe('string');
      expect(typeof item.description).toBe('string');
      expect(typeof item.triggerKind).toBe('string');
      expect(typeof item.nodeCount).toBe('number');
      expect(item.nodeCount).toBeGreaterThan(0);
    }
  });

  it('every seed template graph is structurally valid (no orphan nodes, edges resolve)', () => {
    // The HTTP route does not ship the full graph (slim payload by design),
    // so we re-assert the invariant on the in-memory module that the route
    // serves from. If this ever breaks the route response will still be
    // valid, but a clone via POST /api/portal/workflows would produce a
    // broken workflow.
    expect(WORKFLOW_TEMPLATES).toHaveLength(5);
    for (const tpl of WORKFLOW_TEMPLATES) {
      assertGraphValid(tpl.id, tpl.graph);
    }
  });
});

function assertGraphValid(label: string, graph: WorkflowGraph) {
  const nodeIds = new Set(graph.nodes.map((n: WorkflowNode) => n.id));
  for (const edge of graph.edges) {
    expect(nodeIds.has(edge.source), `${label}: edge ${edge.id} source missing`).toBe(true);
    expect(nodeIds.has(edge.target), `${label}: edge ${edge.id} target missing`).toBe(true);
  }
  // Every non-trigger node must be reachable from at least one trigger.
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  }
  const reachable = new Set<string>();
  const stack: string[] = [];
  for (const t of graph.nodes.filter((n) => n.type === 'trigger')) stack.push(t.id);
  while (stack.length) {
    const cur = stack.pop()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  const orphans = graph.nodes
    .filter((n) => n.type !== 'trigger' && !reachable.has(n.id))
    .map((n) => n.id);
  expect(orphans, `${label} orphan nodes: ${orphans.join(', ')}`).toEqual([]);
}
