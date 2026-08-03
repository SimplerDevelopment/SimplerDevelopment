/**
 * findSelfReviewWarnings — "an agent must not verify its own work".
 *
 * This is the one defect class the pipeline cannot catch by itself: when the
 * same persona both produces a change and reviews it, the review agrees with
 * the mistake and the run goes green. So the detector gets real tests, with
 * particular attention to what it must NOT flag — a false positive here is
 * worse than a miss, because a warning people learn to ignore is no warning.
 */
import { describe, it, expect } from 'vitest';
import { findSelfReviewWarnings, type AgentFlowGraph } from '@/lib/agent-flows/types';

type NodeSpec = {
  id: string;
  kind?: 'agent' | 'step' | 'human' | 'flow';
  agentType?: string | null;
  label?: string;
  role?: string;
};

function graph(nodes: NodeSpec[], edges: [string, string][]): AgentFlowGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      position: { x: 0, y: 0 },
      data: {
        kind: n.kind ?? 'agent',
        agentType: (n.agentType ?? 'backend-engineer') as never,
        label: n.label ?? n.id,
        ...(n.role ? { role: n.role } : {}),
      },
    })),
    edges: edges.map(([source, target], i) => ({ id: `e${i}`, source, target })),
  } as AgentFlowGraph;
}

describe('findSelfReviewWarnings @agent-flows', () => {
  it('flags a review node running the same persona as the node feeding it', () => {
    const w = findSelfReviewWarnings(graph(
      [{ id: 'build', label: 'Build the endpoint' }, { id: 'rev', label: 'Review the endpoint' }],
      [['build', 'rev']],
    ));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ nodeId: 'rev', upstreamNodeId: 'build', agentType: 'backend-engineer' });
    expect(w[0].message).toContain('backend-engineer');
  });

  it('does NOT flag two sequential build steps sharing a persona', () => {
    // The common legitimate case. Flagging this is what would make the whole
    // warning worthless.
    expect(findSelfReviewWarnings(graph(
      [{ id: 'a', label: 'Scaffold the route' }, { id: 'b', label: 'Wire up the handler' }],
      [['a', 'b']],
    ))).toEqual([]);
  });

  it('does NOT flag a review by a DIFFERENT persona — that is the point', () => {
    expect(findSelfReviewWarnings(graph(
      [
        { id: 'build', agentType: 'backend-engineer', label: 'Build' },
        { id: 'rev', agentType: 'code-reviewer', label: 'Review the diff' },
      ],
      [['build', 'rev']],
    ))).toEqual([]);
  });

  it('does NOT flag a human sign-off after an agent node', () => {
    // A person checking an agent's work is exactly the independence wanted.
    expect(findSelfReviewWarnings(graph(
      [{ id: 'build', label: 'Build' }, { id: 'ok', kind: 'human', agentType: null, label: 'Review and approve' }],
      [['build', 'ok']],
    ))).toEqual([]);
  });

  it('reads the role field too, not just the label', () => {
    const w = findSelfReviewWarnings(graph(
      [{ id: 'a', label: 'Implement' }, { id: 'b', label: 'Second pass', role: 'QA the implementation' }],
      [['a', 'b']],
    ));
    expect(w).toHaveLength(1);
  });

  it('matches whole words only, so "prechecked" or "previewer" do not trip it', () => {
    expect(findSelfReviewWarnings(graph(
      [{ id: 'a', label: 'Build' }, { id: 'b', label: 'Render the previewer' }],
      [['a', 'b']],
    ))).toEqual([]);
  });

  it('reports each edge once even when several nodes feed the same reviewer', () => {
    const w = findSelfReviewWarnings(graph(
      [
        { id: 'a', label: 'Build A' },
        { id: 'b', label: 'Build B' },
        { id: 'rev', label: 'Review both' },
      ],
      [['a', 'rev'], ['b', 'rev']],
    ));
    // Two distinct upstream nodes = two genuine findings, not a dedup case.
    expect(w).toHaveLength(2);
    expect(w.map((x) => x.upstreamNodeId).sort()).toEqual(['a', 'b']);
  });

  it('de-duplicates a repeated edge between the same pair', () => {
    const g = graph(
      [{ id: 'a', label: 'Build' }, { id: 'rev', label: 'Review it' }],
      [['a', 'rev'], ['a', 'rev']],
    );
    expect(findSelfReviewWarnings(g)).toHaveLength(1);
  });

  it('ignores edges pointing at nodes that are not in the graph', () => {
    const g = graph([{ id: 'a', label: 'Review it' }], []);
    (g.edges as { id: string; source: string; target: string }[]).push({ id: 'x', source: 'a', target: 'ghost' });
    expect(findSelfReviewWarnings(g)).toEqual([]);
  });

  it('is empty for an empty graph', () => {
    expect(findSelfReviewWarnings({ nodes: [], edges: [] })).toEqual([]);
  });
});
