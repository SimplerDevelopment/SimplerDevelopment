/**
 * NodeInspector fan-out control (PUX-041).
 *
 * The control is deliberately conditional: it only appears once a node
 * actually branches, because on a linear step it is noise and the default
 * ('all') is already correct. That conditional is exactly the kind of thing
 * that silently stops rendering, so it gets a test rather than a manual click.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NodeInspector } from '@/components/portal/agent-flow-inspectors';
import type { AgentFlowNodeData } from '@/lib/agent-flows/types';

const base: AgentFlowNodeData = { kind: 'step', agentType: null, label: 'Choose how to land it' };

function renderInspector(data: AgentFlowNodeData, outgoingCount: number) {
  return render(
    <NodeInspector
      data={data}
      canEdit
      members={[]}
      outgoingCount={outgoingCount}
      onChange={vi.fn()}
      onDelete={vi.fn()}
    />
  );
}

describe('NodeInspector — fan-out control @agent-flows', () => {
  it('is hidden on a linear node (1 outgoing edge)', () => {
    renderInspector(base, 1);
    expect(screen.queryByLabelText(/Branching/)).toBeNull();
  });

  it('is hidden on a terminal node (0 outgoing edges)', () => {
    renderInspector(base, 0);
    expect(screen.queryByLabelText(/Branching/)).toBeNull();
  });

  it('appears once the node branches, and reports the edge count', () => {
    renderInspector(base, 3);
    const select = screen.getByLabelText(/Branching \(3 outgoing\)/);
    expect(select).toBeTruthy();
    // Absent fanOut means parallel — no existing flow changes meaning.
    expect((select as HTMLSelectElement).value).toBe('all');
  });

  it('reflects an explicit exclusive fan-out and explains it', () => {
    renderInspector({ ...base, fanOut: 'one' }, 2);
    const select = screen.getByLabelText(/Branching \(2 outgoing\)/) as HTMLSelectElement;
    expect(select.value).toBe('one');
    expect(screen.getByText(/connector labels become the choices/)).toBeTruthy();
  });

  it('shows on a human node too — branching is not agent-only', () => {
    renderInspector({ kind: 'human', agentType: null, label: 'Still generic?', assigneeIds: [] }, 2);
    expect(screen.getByLabelText(/Branching \(2 outgoing\)/)).toBeTruthy();
  });
});
