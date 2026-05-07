// Type definitions for the visual workflow builder.
//
// Mirrors ReactFlow's node/edge shape so the UI canvas can hand the graph
// straight to the runtime, and the runtime can read it without translation.

export type WorkflowTriggerConfig =
  | { kind: 'contact.created' }
  | { kind: 'deal.stage_changed'; stageId?: number }
  | { kind: 'form.submitted'; formId?: number }
  | { kind: 'webhook.received'; secret: string }
  | { kind: 'schedule'; cron: string };

export type WorkflowAction =
  | { kind: 'send_email'; templateId: number; to: 'contact' | 'owner' | string }
  | { kind: 'create_task'; title: string; assigneeId?: number }
  | { kind: 'add_to_list'; listId: number }
  | { kind: 'wait'; ms: number }
  | { kind: 'webhook'; url: string; payload: Record<string, unknown> }
  | { kind: 'condition'; expression: string };

export type WorkflowNodeKind = 'trigger' | 'action' | 'condition';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeKind;
  data: WorkflowTriggerConfig | WorkflowAction;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  // For condition branches: 'true' | 'false'. Plain edges leave it undefined.
  label?: 'true' | 'false';
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// Free-form context passed in by whatever fired the trigger. `runtime.ts`
// stamps standard fields (clientId, triggeredAt, trigger) on top of whatever
// the caller hands in.
export type WorkflowRunContext = Record<string, unknown>;

export type WorkflowStepInput = Record<string, unknown> | null;
export type WorkflowStepOutput = Record<string, unknown> | null;

export type WorkflowStatus = 'draft' | 'active' | 'paused';
export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type WorkflowStepStatus = 'success' | 'failed' | 'skipped';

// Type guards for the runtime — TS narrows discriminated unions cleanly when
// node.type drives which `data` shape we expect, but tsc can't see that
// without help, so we use these in `runtime.ts`.
export function isTriggerNode(node: WorkflowNode): node is WorkflowNode & { data: WorkflowTriggerConfig } {
  return node.type === 'trigger';
}

export function isActionNode(node: WorkflowNode): node is WorkflowNode & { data: WorkflowAction } {
  return node.type === 'action' || node.type === 'condition';
}
