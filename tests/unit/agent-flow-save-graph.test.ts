/**
 * buildSaveGraph — the save-payload builder for the Workflow Designer canvas
 * (PUX-038).
 *
 * `handleSave` used to call `rfInstance.getViewport()` on every save and bake
 * whatever pan/zoom the author happened to be at into `graph.viewport`. Once
 * set, `<ReactFlow fitView={!flow.graph.viewport} />` never auto-frames that
 * flow again — so a save made while zoomed into an empty corner permanently
 * stranded every later viewer there, recoverable only via a direct API call.
 *
 * The fix is to never persist a viewport at all, so `fitView` keeps re-running
 * on every load. This test locks that down at the pure-function level rather
 * than through the full ReactFlow component tree.
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { Node, Edge } from 'reactflow';
import { buildSaveGraph } from '@/components/portal/AgentFlowTab';

const nodes: Node[] = [
  {
    id: 'n1',
    position: { x: 10, y: 20 },
    data: { kind: 'agent', agentType: 'backend-engineer', label: 'Build it' },
  },
];

const edges: Edge[] = [
  { id: 'e1', source: 'n1', target: 'n1', data: { kind: 'handoff', extra: undefined } },
];

describe('buildSaveGraph @agent-flows', () => {
  it('never includes a viewport in the save payload', () => {
    const graph = buildSaveGraph(nodes, edges);
    expect(graph.viewport).toBeUndefined();
    expect('viewport' in graph).toBe(false);
  });

  it('still round-trips nodes and edges faithfully', () => {
    const graph = buildSaveGraph(nodes, edges);
    expect(graph.nodes).toEqual([
      { id: 'n1', position: { x: 10, y: 20 }, data: nodes[0].data },
    ]);
    expect(graph.edges).toEqual([
      { id: 'e1', source: 'n1', target: 'n1', label: undefined, kind: 'handoff', data: undefined },
    ]);
  });
});
