// Shared types for the Workflow Designer (agent flows) feature.
//
// Mirrors ReactFlow's node/edge shape (see `lib/workflows/types.ts` for the
// sibling automation-workflow version) so the canvas can hand the graph
// straight to the API, and a future orchestration runtime can read it back
// without translation. The whole graph (nodes + edges + optional viewport)
// is stored as a single JSONB blob on `agent_flows.graph` — see
// `lib/db/schema/agentFlows.ts`.

// The 21 real agent personas — filenames in `.claude/agents/` minus `.md`.
// Keep in sync with `ls .claude/agents`.
export const PERSONA_SLUGS = [
  'principal-engineer',
  'lead-architect',
  'staff-engineer',
  'code-reviewer',
  'adversarial-reviewer',
  'security-engineer',
  'product-manager',
  'frontend-engineer',
  'backend-engineer',
  'ai-engineer',
  'automation-engineer',
  'devops-engineer',
  'mobile-engineer',
  'qa-automation-engineer',
  'refactoring-specialist',
  'performance-engineer',
  'bug-hunter',
  'product-designer',
  'marketing-content',
  'manual-qa',
  'support-engineer',
] as const;

export type AgentPersonaSlug = typeof PERSONA_SLUGS[number];

export interface AgentFlowNodeData {
  // 'human' = stop here and wait for a person to sign off. It is deliberately
  // NOT an agent persona: the point of the node is that no model runs it.
  // 'flow'  = hand off to another flow. The parent node blocks until the child
  //           run finishes; a `flow` node with no outgoing edges is therefore a
  //           tail-call, which is why there is no separate "handoff" mode.
  kind: 'agent' | 'step' | 'human' | 'flow';
  agentType: AgentPersonaSlug | null;
  /** Target flow for a `flow` node. Must belong to the same project. */
  flowId?: number;
  label: string;
  role?: string;
  model?: 'opus' | 'sonnet' | 'haiku';
  description?: string;
  prompt?: string;
  entryPoint?: boolean;
  /**
   * How this node's OUTGOING edges are taken when more than one leaves it.
   *
   *   'all' (default) — every outgoing edge is followed. A parallel fan-out.
   *   'one'           — exactly one outgoing edge is taken. An exclusive branch.
   *
   * Without this the graph cannot distinguish "run all three reviewers" from
   * "pick whichever branch applies" — edge labels describe the OUTCOME of a
   * branch, never whether the branch is exclusive. A reader has to guess, and
   * so would any runtime.
   *
   * Chosen over a dedicated `decision` node kind because it closes the same
   * semantic gap without a new node type, palette entry or canvas styling, and
   * because it makes existing flows expressible in place rather than forcing
   * them to be restructured around inserted diamonds.
   *
   * Note edge labels are free text, so nothing can EVALUATE a condition
   * automatically. 'one' therefore means "something must choose" — a runtime
   * offers the outgoing edge labels as the options and asks.
   */
  fanOut?: 'all' | 'one';
  /**
   * Project-member user ids who must sign off. Only meaningful when
   * kind === 'human'. Stored as ids, not names/emails — the picker resolves
   * display names from the project's member list, so a member who later
   * leaves the project renders as unknown rather than as stale copy baked
   * into the graph. The API re-validates every id against
   * `project_members` for THIS project on save.
   */
  assigneeIds?: number[];
}

export interface AgentFlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: AgentFlowNodeData;
}

export interface AgentFlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind?: 'handoff' | 'dependency';
  data?: Record<string, unknown>;
}

export interface AgentFlowGraph {
  nodes: AgentFlowNode[];
  edges: AgentFlowEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export type AgentFlowStatus = 'draft' | 'active' | 'archived';

// API DTO — what routes return/accept for a single agent flow.
export interface AgentFlow {
  id: number;
  projectId: number;
  clientId: number;
  name: string;
  description: string | null;
  status: AgentFlowStatus;
  graph: AgentFlowGraph;
  createdAt: string;
  updatedAt: string;
}

// ─── Executions ─────────────────────────────────────────────────────────────
//
// Runs are driven by a Claude Code session reporting progress through MCP write
// tools. These DTOs are what the REST routes return and what the SSE stream
// emits, so they are also the contract the portal folds to derive node state.

export type AgentFlowRunStatus = 'running' | 'waiting' | 'succeeded' | 'failed' | 'abandoned';

/** Terminal statuses — a run in one of these will never advance again. */
export const TERMINAL_RUN_STATUSES: readonly AgentFlowRunStatus[] = ['succeeded', 'failed', 'abandoned'];

export type AgentFlowEventType =
  | 'run.started'
  | 'node.status'
  | 'run.waiting'
  | 'note'
  | 'run.finished';

/**
 * Per-node lifecycle. Folded into `status` on `node.status` rather than
 * exploding into four event types, so adding a fifth node state later does not
 * widen the event taxonomy.
 *
 * `skipped` is load-bearing: sd-run-flow must name untaken branches rather than
 * silently omit them, and the canvas greys those rather than leaving them
 * looking pending.
 */
export type AgentFlowNodeRunStatus = 'started' | 'finished' | 'failed' | 'skipped';

/** Hard cap on `summary` — this is pushed to every connected viewer. */
export const RUN_EVENT_SUMMARY_MAX = 2000;

/** Max sub-flow nesting. A `flow` node spawns a whole RUN, so runaway nesting
 *  burns real tokens; the start guard also rejects an ancestor cycle. */
export const MAX_RUN_DEPTH = 5;

export interface AgentFlowRunEvent {
  id: number;
  runId: number;
  type: AgentFlowEventType;
  nodeId: string | null;
  status: AgentFlowNodeRunStatus | AgentFlowRunStatus | null;
  summary: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  createdAt: string;
}

export interface AgentFlowRun {
  id: number;
  flowId: number;
  projectId: number;
  status: AgentFlowRunStatus;
  graph: AgentFlowGraph;
  parentRunId: number | null;
  parentNodeId: string | null;
  depth: number;
  inputTokens: number;
  outputTokens: number;
  startedBy: number | null;
  startedAt: string;
  finishedAt: string | null;
  lastEventAt: string;
}

/** Slim row for the executions list — no graph payload. */
export interface AgentFlowRunSummary {
  id: number;
  flowId: number;
  flowName: string;
  status: AgentFlowRunStatus;
  parentRunId: number | null;
  depth: number;
  inputTokens: number;
  outputTokens: number;
  startedAt: string;
  finishedAt: string | null;
  lastEventAt: string;
  nodeCount: number;
  doneCount: number;
}

/**
 * Words that mark a node as CHECKING upstream work rather than producing it.
 * Deliberately a keyword match on author-written text: the canvas and the API
 * only see the graph, and `agentType` alone cannot separate a review step from
 * a build step. A miss here costs a warning nobody sees, not a rejected flow.
 */
const VERIFY_WORDS = /\b(review|reviews|verify|verifies|verification|qa|audit|audits|check|checks|approve|approval|sign[- ]?off|validate|validates)\b/i;

export interface SelfReviewWarning {
  nodeId: string;
  upstreamNodeId: string;
  agentType: string;
  message: string;
}

/**
 * Find nodes that verify work produced by their OWN persona.
 *
 * An agent grading its own output is not verification — the reasoning that
 * produced a mistake also produces a convincing proof of it, and the run goes
 * green either way. This is the failure mode a test suite written by the same
 * agent cannot catch, which is why it is surfaced at authoring time.
 *
 * ADVISORY ONLY — callers must not reject a graph on this. Two nodes sharing a
 * persona is often correct (`backend-engineer` "scaffold" → `backend-engineer`
 * "wire it up"), so the signal is the downstream node's LABEL, and a keyword
 * heuristic over author-written text is not something to fail a save on.
 * `/sd-run-flow` re-checks at dispatch where the whole prompt can be read.
 */
export function findSelfReviewWarnings(graph: AgentFlowGraph): SelfReviewWarning[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: SelfReviewWarning[] = [];
  const seen = new Set<string>();

  for (const edge of graph.edges) {
    const target = byId.get(edge.target);
    const source = byId.get(edge.source);
    if (!target || !source) continue;

    const agentType = target.data?.agentType;
    // Only agent nodes run a model. A human sign-off after a build step is
    // exactly the independence we want, never a warning.
    if (!agentType || target.data?.kind !== 'agent' || source.data?.kind !== 'agent') continue;
    if (source.data?.agentType !== agentType) continue;

    const text = `${target.data.label ?? ''} ${target.data.role ?? ''}`;
    if (!VERIFY_WORDS.test(text)) continue;

    const key = `${edge.source}->${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      nodeId: target.id,
      upstreamNodeId: source.id,
      agentType,
      message: `"${target.data.label || target.id}" verifies "${source.data.label || source.id}", but both run as ${agentType}. An agent checking its own work will not catch its own mistake — consider adversarial-reviewer, code-reviewer, or a human node.`,
    });
  }
  return out;
}

/** Node state derived client-side by folding the event log. */
export interface FoldedNodeState {
  status: AgentFlowNodeRunStatus;
  summary?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}

/**
 * Fold an event log into per-node state. Shared by the canvas overlay and the
 * run detail view so both derive identically — the alternative was a
 * materialized per-node table, which would have meant two sources of truth
 * that can disagree.
 */
export function foldRunEvents(events: readonly AgentFlowRunEvent[]): Record<string, FoldedNodeState> {
  const byNode: Record<string, FoldedNodeState> = {};
  for (const e of events) {
    if (e.type !== 'node.status' || !e.nodeId || !e.status) continue;
    byNode[e.nodeId] = {
      status: e.status as AgentFlowNodeRunStatus,
      ...(e.summary ? { summary: e.summary } : {}),
      ...(e.model ? { model: e.model } : {}),
      ...(e.inputTokens != null ? { inputTokens: e.inputTokens } : {}),
      ...(e.outputTokens != null ? { outputTokens: e.outputTokens } : {}),
      ...(e.durationMs != null ? { durationMs: e.durationMs } : {}),
    };
  }
  return byNode;
}
