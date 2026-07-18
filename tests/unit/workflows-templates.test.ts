import { describe, it, expect } from 'vitest';
import { WORKFLOW_TEMPLATES, findTemplate, type WorkflowTemplate } from '@/lib/workflows/templates';
import type { WorkflowGraph, WorkflowNode } from '@/lib/workflows/types';

describe('Workflow templates', () => {
  it('exports exactly 5 starter templates', () => {
    expect(WORKFLOW_TEMPLATES).toHaveLength(5);
  });

  it('has the expected template ids', () => {
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id).sort();
    expect(ids).toEqual([
      'form-submission-auto-task',
      'new-lead-nurture',
      'stage-advance-celebration',
      'stale-deal-nudge',
      'webhook-to-slack',
    ]);
  });

  it('findTemplate returns the matching template', () => {
    expect(findTemplate('new-lead-nurture')?.name).toMatch(/lead nurture/i);
    expect(findTemplate('does-not-exist')).toBeUndefined();
  });

  describe.each(WORKFLOW_TEMPLATES)('%s graph', (template: WorkflowTemplate) => {
    it(`${template.name} has a unique id`, () => {
      const dupes = WORKFLOW_TEMPLATES.filter((t) => t.id === template.id);
      expect(dupes).toHaveLength(1);
    });

    it(`${template.name} has at least one trigger node`, () => {
      const triggers = template.graph.nodes.filter((n: WorkflowNode) => n.type === 'trigger');
      expect(triggers.length).toBeGreaterThanOrEqual(1);
    });

    it(`${template.name} has node ids that match between nodes and edges`, () => {
      const nodeIds = new Set(template.graph.nodes.map((n: WorkflowNode) => n.id));
      for (const edge of template.graph.edges) {
        expect(nodeIds.has(edge.source), `edge ${edge.id} source ${edge.source} not in nodes`).toBe(true);
        expect(nodeIds.has(edge.target), `edge ${edge.id} target ${edge.target} not in nodes`).toBe(true);
      }
    });

    it(`${template.name} every action / condition is reachable from a trigger`, () => {
      assertEveryActionReachableFromATrigger(template.graph);
    });

    it(`${template.name} has no orphan non-trigger nodes (every action has at least one inbound edge)`, () => {
      const inboundCount = new Map<string, number>();
      for (const edge of template.graph.edges) {
        inboundCount.set(edge.target, (inboundCount.get(edge.target) ?? 0) + 1);
      }
      for (const node of template.graph.nodes) {
        if (node.type === 'trigger') continue;
        expect(
          inboundCount.get(node.id) ?? 0,
          `${template.name} node ${node.id} (${node.type}) has no inbound edges`,
        ).toBeGreaterThan(0);
      }
    });

    it(`${template.name} top-level trigger config matches at least one trigger node`, () => {
      const kinds = template.graph.nodes
        .filter((n: WorkflowNode) => n.type === 'trigger')
        .map((n: WorkflowNode) => (n.data as { kind: string }).kind);
      expect(kinds).toContain(template.trigger.kind);
    });
  });
});

// Walks the edge graph forward from every trigger and asserts that every
// non-trigger node is reachable from at least one trigger.
function assertEveryActionReachableFromATrigger(graph: WorkflowGraph): void {
  const triggers = graph.nodes.filter((n: WorkflowNode) => n.type === 'trigger');
  const reachable = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  }

  for (const t of triggers) {
    walk(t.id, adj, reachable);
  }

  const orphans = graph.nodes.filter((n: WorkflowNode) => n.type !== 'trigger' && !reachable.has(n.id));
  expect(orphans, `orphan nodes: ${orphans.map((o: WorkflowNode) => o.id).join(', ')}`).toEqual([]);
}

function walk(start: string, adj: Map<string, string[]>, visited: Set<string>) {
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
}
