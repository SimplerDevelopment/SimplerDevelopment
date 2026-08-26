/**
 * NodeInspector — description/role field parity across node kinds (PUX-039).
 *
 * `AgentFlowNodeData.description` and `.role` are both plain optional strings
 * with no `kind` restriction in `lib/agent-flows/types.ts`, but the inspector
 * used to render `description` only for `kind !== 'agent'` and `role` only for
 * `kind === 'agent'`. Anything written to the "wrong" field via the API/MCP
 * (e.g. a `description` on an agent node) was therefore invisible and
 * uneditable in the portal. Both fields must now render in both branches.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NodeInspector } from '@/components/portal/agent-flow-inspectors';
import type { AgentFlowNodeData } from '@/lib/agent-flows/types';

function renderInspector(data: AgentFlowNodeData) {
  return render(
    <NodeInspector
      data={data}
      canEdit
      members={[]}
      outgoingCount={0}
      onChange={vi.fn()}
      onDelete={vi.fn()}
    />
  );
}

describe('NodeInspector — description/role parity @agent-flows', () => {
  it('renders Description for an agent node, not just Role note', () => {
    renderInspector({ kind: 'agent', agentType: 'backend-engineer', label: 'Build it', description: 'seeded via API' });
    expect((screen.getByLabelText('Role note') as HTMLInputElement)).toBeTruthy();
    const descriptionInput = screen.getByLabelText('Description') as HTMLInputElement;
    expect(descriptionInput).toBeTruthy();
    expect(descriptionInput.value).toBe('seeded via API');
  });

  it('renders Role note for a step node, not just Description', () => {
    renderInspector({ kind: 'step', agentType: null, label: 'Choose how to land it', role: 'seeded via API' });
    expect((screen.getByLabelText('Description') as HTMLInputElement)).toBeTruthy();
    const roleInput = screen.getByLabelText('Role note') as HTMLInputElement;
    expect(roleInput).toBeTruthy();
    expect(roleInput.value).toBe('seeded via API');
  });
});
