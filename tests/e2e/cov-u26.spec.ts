/**
 * cov-u26 — Automations Workflows coverage slice (unit 26)
 *
 * Cards 0-3 from "## To Test" in:
 *   vault/05 - Feature Specs/E2E Audit/Automations Workflows E2E Audit.md
 *
 * Card 0: Durable retry on workflow step failure — GAP (runtime has no retry mechanism)
 * Card 1: Branching / conditional logic in workflow — BUG documented below
 * Card 2: Loop / iteration step — GAP (no loop node type in runtime)
 * Card 3: enqueueWorkflowRunsForTrigger wired to live CRM events — GAP (not yet wired)
 *
 * BUG (Card 1): When a workflow graph contains a 'condition' node with
 * data = { expression: '...' }, the runtime's executeStep() reads action kind
 * via `(node.data as WorkflowAction).kind` which is `undefined` for condition
 * nodes (they have no .kind field in data). The executeAction() switch falls
 * through to the default case returning { status: 'skipped', unknownAction: true }.
 * executeStep() then tries to insert into workflow_step_logs with action=undefined
 * which violates the NOT NULL constraint, causing the entire run to fail.
 * Repro: POST /api/portal/workflows/[id]/test-run on a workflow with a condition node.
 * Root cause: lib/workflows/runtime.ts executeStep() line ~191 — condition node data
 * must include kind:'condition' OR the function must special-case node.type==='condition'.
 */
import { test, expect } from './setup/fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal blank workflow (draft). Returns the row. */
async function createWorkflow(
  clientApi: import('./setup/api-client').ApiClient,
  name: string,
) {
  const res = await clientApi.post('/api/portal/workflows', { name });
  if (res.status !== 200) throw new Error(`createWorkflow failed: ${res.status}`);
  return res.data.data as { id: number; name: string; status: string };
}

// ---------------------------------------------------------------------------
// Card 1: Branching / conditional logic in workflow
//
// BUG: condition node in a graph causes run to fail with DB constraint error.
// The runtime's executeStep() extracts action kind from node.data.kind, but
// condition nodes use node.data = { expression: '...' } (no .kind). This
// causes a NOT NULL violation when logging the step.
// ---------------------------------------------------------------------------

test.describe('Workflows — branching / conditional logic @automations', () => {
  const cleanupIds: number[] = [];

  test.afterAll(async ({ clientApi }) => {
    for (const id of cleanupIds) {
      await clientApi.delete(`/api/portal/workflows/${id}`).catch(() => {});
    }
  });

  test('condition node in graph runs to completion (was a NOT-NULL crash)', async ({
    clientApi,
  }) => {
    const ts = Date.now();
    const wf = await createWorkflow(clientApi, `Branch-Test-${ts}`);
    cleanupIds.push(wf.id);

    // Build a graph: trigger → condition → (true: wait, false: wait)
    const graph = {
      nodes: [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { kind: 'contact.created' },
        },
        {
          id: 'cond1',
          type: 'condition',
          position: { x: 0, y: 100 },
          data: { expression: 'deal.stale' },
        },
        {
          id: 'wait_true',
          type: 'wait',
          position: { x: -100, y: 200 },
          data: { duration: 0, unit: 'minutes' },
        },
        {
          id: 'wait_false',
          type: 'wait',
          position: { x: 100, y: 200 },
          data: { duration: 0, unit: 'minutes' },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'cond1' },
        { id: 'e2', source: 'cond1', target: 'wait_true', label: 'true' },
        { id: 'e3', source: 'cond1', target: 'wait_false', label: 'false' },
      ],
    };

    const patchRes = await clientApi.patch(`/api/portal/workflows/${wf.id}`, {
      graph,
      trigger: { kind: 'contact.created' },
    });
    expect(patchRes.status).toBe(200);

    // FIXED: the runtime now falls back to node.type when condition-node data
    // has no .kind, so workflow_step_logs.action is never null and the run
    // completes instead of crashing on the NOT-NULL constraint.
    const runRes = await clientApi.post(`/api/portal/workflows/${wf.id}/test-run`, {
      context: { conditions: { 'deal.stale': true } },
    });
    expect(runRes.status).toBe(200);
    expect(runRes.data.data.status).toBe('completed');
  });
});
