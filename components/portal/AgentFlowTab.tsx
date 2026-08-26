'use client';

// Workflow Designer canvas (APWD-003). Editable reactflow graph of agent
// personas + free steps for a single project's agent flow(s). Pattern lifted
// from `app/portal/automations/workflows/[id]/page.tsx` (the automation
// workflow builder) — same translators / change handlers / palette-click-to-add
// / <ReactFlow> shell — adapted to the agent-flow DTOs in
// `lib/agent-flows/types.ts` and to "many flows per project" + a right-side
// inspector for editable node/edge properties.

import { useEffect, useMemo, useState, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type {
  AgentFlow,
  AgentFlowGraph,
  AgentFlowNode,
  AgentFlowNodeData,
  AgentFlowStatus,
  AgentPersonaSlug,
  SelfReviewWarning,
} from '@/lib/agent-flows/types';
import { NodeInspector, EdgeInspector } from './agent-flow-inspectors';
import { SelfReviewBanner } from './agent-flow-warnings';

// Slim row shape returned by GET /api/portal/projects/:id/flows (list view —
// no graph payload, just enough to populate the selector).
interface AgentFlowSummary {
  id: number;
  name: string;
  status: AgentFlowStatus;
  updatedAt: string;
  nodeCount?: number;
  edgeCount?: number;
}

export type EdgeKind = 'handoff' | 'dependency';

// Subset of GET /api/portal/projects/:id/members we need to render the
// human-node assignee picker. That route is already gated on project read
// access, so a viewer can see who a step is waiting on without being able
// to change it.
export interface ProjectMemberOption {
  userId: number;
  name: string | null;
  email: string | null;
}

// ---------------------------------------------------------------------------
// Persona metadata — display label + default model tier, keyed by the same
// 21 slugs Unit 1 defined. Grouping mirrors docs/agency-personas.md §2 (the
// "real agent" columns only — adopt-a-lens roles aren't invokable subagents,
// so they don't belong on this canvas). Model defaults mirror §3's tiering.
// ---------------------------------------------------------------------------

const AGENT_LABELS: Record<AgentPersonaSlug, string> = {
  'principal-engineer': 'Principal Engineer',
  'lead-architect': 'Lead Architect',
  'staff-engineer': 'Staff Engineer',
  'code-reviewer': 'Code Reviewer',
  'adversarial-reviewer': 'Adversarial Reviewer',
  'security-engineer': 'Security Engineer',
  'product-manager': 'Product Manager',
  'frontend-engineer': 'Frontend Engineer',
  'backend-engineer': 'Backend Engineer',
  'ai-engineer': 'AI Engineer',
  'automation-engineer': 'Automation Engineer',
  'devops-engineer': 'DevOps Engineer',
  'mobile-engineer': 'Mobile Engineer',
  'qa-automation-engineer': 'QA Automation Engineer',
  'refactoring-specialist': 'Refactoring Specialist',
  'performance-engineer': 'Performance Engineer',
  'bug-hunter': 'Bug Hunter',
  'product-designer': 'Product Designer',
  'marketing-content': 'Marketing Content',
  'manual-qa': 'Manual QA',
  'support-engineer': 'Support Engineer',
};

const AGENT_MODELS: Record<AgentPersonaSlug, 'opus' | 'sonnet' | 'haiku'> = {
  'principal-engineer': 'opus',
  'lead-architect': 'opus',
  'staff-engineer': 'opus',
  'code-reviewer': 'opus',
  'adversarial-reviewer': 'opus',
  'security-engineer': 'opus',
  'product-manager': 'opus',
  'frontend-engineer': 'sonnet',
  'backend-engineer': 'sonnet',
  'ai-engineer': 'sonnet',
  'automation-engineer': 'sonnet',
  'devops-engineer': 'sonnet',
  'mobile-engineer': 'sonnet',
  'qa-automation-engineer': 'sonnet',
  'refactoring-specialist': 'sonnet',
  'performance-engineer': 'sonnet',
  'bug-hunter': 'sonnet',
  'product-designer': 'sonnet',
  'marketing-content': 'sonnet',
  'manual-qa': 'haiku',
  'support-engineer': 'haiku',
};

interface PersonaDepartment {
  name: string;
  icon: string;
  personas: AgentPersonaSlug[];
}

// Nine-department org chart, real-agent columns only (docs/agency-personas.md §2).
const DEPARTMENTS: PersonaDepartment[] = [
  { name: 'Executive', icon: 'business_center', personas: ['product-manager'] },
  { name: 'Design', icon: 'palette', personas: ['product-designer'] },
  {
    name: 'Engineering',
    icon: 'code',
    personas: [
      'lead-architect',
      'frontend-engineer',
      'backend-engineer',
      'mobile-engineer',
      'ai-engineer',
      'automation-engineer',
      'devops-engineer',
      'security-engineer',
    ],
  },
  { name: 'QA', icon: 'fact_check', personas: ['qa-automation-engineer', 'manual-qa', 'performance-engineer'] },
  { name: 'Marketing', icon: 'campaign', personas: ['marketing-content'] },
  { name: 'Customer Success', icon: 'support_agent', personas: ['support-engineer'] },
  {
    name: 'Specialized AI',
    icon: 'psychology',
    personas: [
      'principal-engineer',
      'staff-engineer',
      'code-reviewer',
      'adversarial-reviewer',
      'refactoring-specialist',
      'bug-hunter',
    ],
  },
];

function newNodeId(): string {
  return `n-${Math.random().toString(36).slice(2, 8)}`;
}
function newEdgeId(): string {
  return `e-${Math.random().toString(36).slice(2, 8)}`;
}

function nodeStyle(data: AgentFlowNodeData): React.CSSProperties {
  const base: React.CSSProperties = { color: 'white', border: 'none', borderRadius: 10, padding: 8, fontSize: 12, maxWidth: 200 };
  if (data.kind === 'human') return { ...base, background: '#f59e0b' }; // amber — stop, a person acts here
  if (data.kind === 'step') return { ...base, background: '#64748b' }; // slate — free step
  switch (data.model) {
    case 'opus': return { ...base, background: '#8b5cf6' }; // violet — decide/review tier
    case 'haiku': return { ...base, background: '#10b981' }; // emerald — mechanical tier
    case 'sonnet':
    default: return { ...base, background: '#3b82f6' }; // blue — implement tier
  }
}

function edgeStyle(kind: EdgeKind): React.CSSProperties {
  return kind === 'dependency'
    ? { stroke: '#f59e0b', strokeDasharray: '4 3' }
    : { stroke: '#3b82f6' };
}

// Translate our stored graph into ReactFlow's Node/Edge shape. `data` is
// handed straight through — ReactFlow's built-in 'default' node type already
// renders `data.label`, so no custom node component is needed.
function toRFNodes(graph: AgentFlowGraph): Node[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    position: n.position,
    data: n.data,
    type: 'default',
    style: nodeStyle(n.data),
  }));
}

function toRFEdges(graph: AgentFlowGraph): Edge[] {
  return graph.edges.map((e) => {
    const kind: EdgeKind = e.kind ?? 'handoff';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'default',
      animated: kind === 'handoff',
      style: edgeStyle(kind),
      data: { kind, extra: e.data },
    };
  });
}

// Re-derive our graph shape from the live ReactFlow nodes/edges for persisting.
function fromRF(nodes: Node[], edges: Edge[]): { nodes: AgentFlowNode[]; edges: AgentFlow['graph']['edges'] } {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      position: n.position,
      data: n.data as AgentFlowNodeData,
    })),
    edges: edges.map((e) => {
      const edgeData = e.data as { kind?: EdgeKind; extra?: Record<string, unknown> } | undefined;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === 'string' ? e.label : undefined,
        kind: edgeData?.kind ?? 'handoff',
        data: edgeData?.extra,
      };
    }),
  };
}

/**
 * Build the graph payload `handleSave` PUTs to the API.
 *
 * PUX-038: this used to call `rfInstance.getViewport()` and write whatever
 * pan/zoom the author happened to be at into `graph.viewport`. That is
 * catastrophic in combination with the canvas's `fitView={!flow.graph.viewport}`
 * below: the FIRST save permanently disables auto-framing for the flow, so if
 * the author saved while zoomed into a corner, every later viewer opens on
 * that same empty-looking corner — and there was no UI to recover, only a
 * direct API call clearing `graph.viewport`.
 *
 * Fix: never persist a viewport at all. Auto-framing (`fitView`) then keeps
 * re-running on every load, which is also just correct behaviour for a canvas
 * whose node set changes over time. Dropping the field unconditionally (not
 * just skipping a NEW capture) means any flow saved before this fix — which
 * may already carry a bad baked-in viewport — self-heals the next time an
 * editor hits Save, with no migration needed. A geometric "is the stored
 * viewport off-screen" fallback was considered and deliberately skipped: node
 * dimensions aren't known until ReactFlow measures them post-render (see the
 * `onNodesChange` comment above), so that check would need real bounding-box
 * math for a failure mode this already fully prevents going forward.
 */
export function buildSaveGraph(nodes: Node[], edges: Edge[]): AgentFlowGraph {
  return fromRF(nodes, edges);
}

function extractError(res: unknown, fallback: string): string {
  if (res && typeof res === 'object') {
    const r = res as { message?: unknown; error?: unknown };
    if (typeof r.message === 'string') return r.message;
    if (typeof r.error === 'string') return r.error;
  }
  return fallback;
}

export default function AgentFlowTab({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const [members, setMembers] = useState<ProjectMemberOption[]>([]);
  const [flows, setFlows] = useState<AgentFlowSummary[]>([]);
  const [flowsLoading, setFlowsLoading] = useState(true);
  const [selectedFlowId, setSelectedFlowId] = useState<number | null>(null);

  const [flow, setFlow] = useState<AgentFlow | null>(null);
  const [flowLoading, setFlowLoading] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<AgentFlowStatus>('draft');

  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Returned by PUT alongside the saved row. Advisory: the write already
  // happened, so these never gate anything.
  const [selfReviewWarnings, setSelfReviewWarnings] = useState<SelfReviewWarning[]>([]);

  // Load the project's members once — they populate the human-node assignee
  // picker. A failure here is non-fatal: the canvas still works, the picker
  // just has nobody to offer, so it deliberately does not setError().
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/projects/${projectId}/members`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled || !res?.success) return;
        setMembers((res.data ?? []) as ProjectMemberOption[]);
      })
      .catch(() => { /* picker degrades to empty */ });
    return () => { cancelled = true; };
  }, [projectId]);

  // Load the flow list for this project.
  useEffect(() => {
    let cancelled = false;
    setFlowsLoading(true);
    fetch(`/api/portal/projects/${projectId}/flows`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res?.success) {
          const list: AgentFlowSummary[] = res.data ?? [];
          setFlows(list);
          setSelectedFlowId((prev) => (prev != null ? prev : (list[0]?.id ?? null)));
        } else {
          setError(extractError(res, 'Failed to load flows'));
        }
      })
      .catch(() => { if (!cancelled) setError('Failed to load flows'); })
      .finally(() => { if (!cancelled) setFlowsLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  // Load the selected flow's graph.
  useEffect(() => {
    if (selectedFlowId == null) {
      setFlow(null);
      setNodes([]);
      setEdges([]);
      return;
    }
    let cancelled = false;
    setFlowLoading(true);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    fetch(`/api/portal/projects/${projectId}/flows/${selectedFlowId}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res?.success) {
          const data: AgentFlow = res.data;
          setFlow(data);
          setNodes(toRFNodes(data.graph));
          setEdges(toRFEdges(data.graph));
          setName(data.name);
          setDescription(data.description ?? '');
          setStatus(data.status);
        } else {
          setError(extractError(res, 'Failed to load flow'));
        }
      })
      .catch(() => { if (!cancelled) setError('Failed to load flow'); })
      .finally(() => { if (!cancelled) setFlowLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, selectedFlowId]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Read-only viewers still need 'dimensions' changes through — reactflow
    // emits those once it measures a node's rendered size, and without them
    // the store never learns real node sizes, breaking fitView/edge anchoring.
    // Drag/connect/delete stay blocked via nodesDraggable/nodesConnectable/deleteKeyCode below.
    setNodes((nds) => applyNodeChanges(canEdit ? changes : changes.filter((c) => c.type === 'select' || c.type === 'dimensions'), nds));
  }, [canEdit]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    // EdgeChange has no 'dimensions' variant (reactflow only measures nodes),
    // so 'select' is the only pass-through needed here.
    setEdges((eds) => applyEdgeChanges(canEdit ? changes : changes.filter((c) => c.type === 'select'), eds));
  }, [canEdit]);

  const onConnect = useCallback((conn: Connection) => {
    if (!canEdit) return;
    setEdges((eds) => addEdge({
      ...conn,
      id: newEdgeId(),
      type: 'default',
      animated: true,
      style: edgeStyle('handoff'),
      data: { kind: 'handoff' as EdgeKind },
    }, eds));
  }, [canEdit]);

  const onSelectionChange = useCallback((sel: { nodes: Node[]; edges: Edge[] }) => {
    if (sel.nodes[0]) {
      setSelectedNodeId(sel.nodes[0].id);
      setSelectedEdgeId(null);
    } else if (sel.edges[0]) {
      setSelectedEdgeId(sel.edges[0].id);
      setSelectedNodeId(null);
    } else {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  }, []);

  const handleAddAgent = useCallback((slug: AgentPersonaSlug) => {
    if (!canEdit) return;
    const position = rfInstance
      ? rfInstance.screenToFlowPosition({ x: 280, y: 220 })
      : { x: 200 + Math.random() * 150, y: 150 + Math.random() * 150 };
    const data: AgentFlowNodeData = { kind: 'agent', agentType: slug, label: AGENT_LABELS[slug], model: AGENT_MODELS[slug] };
    setNodes((nds) => nds.concat({ id: newNodeId(), position, data, type: 'default', style: nodeStyle(data) }));
  }, [rfInstance, canEdit]);

  const handleAddStep = useCallback(() => {
    if (!canEdit) return;
    const position = rfInstance
      ? rfInstance.screenToFlowPosition({ x: 280, y: 220 })
      : { x: 200 + Math.random() * 150, y: 150 + Math.random() * 150 };
    const data: AgentFlowNodeData = { kind: 'step', agentType: null, label: 'Free step' };
    setNodes((nds) => nds.concat({ id: newNodeId(), position, data, type: 'default', style: nodeStyle(data) }));
  }, [rfInstance, canEdit]);

  const handleAddHuman = useCallback(() => {
    if (!canEdit) return;
    const position = rfInstance
      ? rfInstance.screenToFlowPosition({ x: 280, y: 220 })
      : { x: 200 + Math.random() * 150, y: 150 + Math.random() * 150 };
    const data: AgentFlowNodeData = { kind: 'human', agentType: null, label: 'Human approval', assigneeIds: [] };
    setNodes((nds) => nds.concat({ id: newNodeId(), position, data, type: 'default', style: nodeStyle(data) }));
  }, [rfInstance, canEdit]);

  const updateSelectedNode = useCallback((patch: Partial<AgentFlowNodeData>) => {
    if (!canEdit || !selectedNodeId) return;
    setNodes((nds) => nds.map((n) => {
      if (n.id !== selectedNodeId) return n;
      const data = { ...(n.data as AgentFlowNodeData), ...patch };
      return { ...n, data, style: nodeStyle(data) };
    }));
  }, [canEdit, selectedNodeId]);

  const deleteSelectedNode = useCallback(() => {
    if (!canEdit || !selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [canEdit, selectedNodeId]);

  const updateSelectedEdge = useCallback((patch: { label?: string; kind?: EdgeKind }) => {
    if (!canEdit || !selectedEdgeId) return;
    setEdges((eds) => eds.map((e) => {
      if (e.id !== selectedEdgeId) return e;
      const prevData = e.data as { kind?: EdgeKind; extra?: Record<string, unknown> } | undefined;
      const kind = patch.kind ?? prevData?.kind ?? 'handoff';
      return {
        ...e,
        label: patch.label !== undefined ? patch.label : e.label,
        animated: kind === 'handoff',
        style: edgeStyle(kind),
        data: { ...prevData, kind },
      };
    }));
  }, [canEdit, selectedEdgeId]);

  const deleteSelectedEdge = useCallback(() => {
    if (!canEdit || !selectedEdgeId) return;
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  }, [canEdit, selectedEdgeId]);

  const handleCreateFlow = useCallback(async () => {
    if (!canEdit) return;
    const flowName = window.prompt('Name this flow', 'New flow');
    if (!flowName || !flowName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: flowName.trim() }),
      }).then((r) => r.json());
      if (res?.success) {
        const created: AgentFlow = res.data;
        setFlows((prev) => [{ id: created.id, name: created.name, status: created.status, updatedAt: created.updatedAt, nodeCount: 0, edgeCount: 0 }, ...prev]);
        setSelectedFlowId(created.id);
      } else {
        setError(extractError(res, 'Failed to create flow'));
      }
    } catch {
      setError('Failed to create flow');
    } finally {
      setCreating(false);
    }
  }, [projectId, canEdit]);

  const handleSave = useCallback(async () => {
    if (!flow || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const graph = buildSaveGraph(nodes, edges);
      const res = await fetch(`/api/portal/projects/${projectId}/flows/${flow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, status, graph }),
      }).then((r) => r.json());
      if (res?.success) {
        const updated: AgentFlow = res.data;
        setFlow(updated);
        setSelfReviewWarnings(Array.isArray(res.warnings) ? res.warnings : []);
        setFlows((prev) => prev.map((f) => (f.id === updated.id
          ? { ...f, name: updated.name, status: updated.status, updatedAt: updated.updatedAt, nodeCount: graph.nodes.length, edgeCount: graph.edges.length }
          : f)));
      } else {
        setError(extractError(res, 'Failed to save flow'));
      }
    } catch {
      setError('Failed to save flow');
    } finally {
      setSaving(false);
    }
  }, [projectId, flow, nodes, edges, name, description, status, canEdit]);

  const handleDeleteFlow = useCallback(async () => {
    if (!flow || !canEdit) return;
    if (!window.confirm(`Delete "${flow.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/flows/${flow.id}`, { method: 'DELETE' }).then((r) => r.json());
      if (res?.success !== false) {
        const remaining = flows.filter((f) => f.id !== flow.id);
        setFlows(remaining);
        setSelectedFlowId(remaining[0]?.id ?? null);
      } else {
        setError(extractError(res, 'Failed to delete flow'));
      }
    } catch {
      setError('Failed to delete flow');
    } finally {
      setDeleting(false);
    }
  }, [projectId, flow, flows, canEdit]);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);

  if (flowsLoading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        <span className="material-icons text-base align-middle animate-spin mr-2">progress_activity</span>
        Loading workflow designer...
      </div>
    );
  }

  return (
    <div className="h-[75vh] min-h-[560px] flex flex-col gap-3">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200 text-xs">
          <span className="material-icons text-base shrink-0">error</span>
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="hover:underline">Dismiss</button>
        </div>
      )}

      {/* Advisory, never blocking — the save already succeeded. */}
      <SelfReviewBanner warnings={selfReviewWarnings} onDismiss={() => setSelfReviewWarnings([])} />

      {/* Header: flow selector + New flow + name/status + Save/Delete */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={selectedFlowId ?? ''}
          onChange={(e) => setSelectedFlowId(e.target.value ? parseInt(e.target.value, 10) : null)}
          aria-label="Select flow"
          className="text-sm px-2 py-1.5 border border-border rounded-lg bg-background min-w-[160px]"
        >
          {flows.length === 0 && <option value="">No flows yet</option>}
          {flows.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        {canEdit && (
          <button
            type="button"
            onClick={handleCreateFlow}
            disabled={creating}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted disabled:opacity-60"
          >
            <span className="material-icons text-sm">add</span>
            {creating ? 'Creating...' : 'New flow'}
          </button>
        )}

        {flow && (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              aria-label="Flow name"
              className="text-sm font-semibold bg-transparent border border-transparent hover:border-border focus:border-border rounded px-2 py-1 outline-none flex-1 min-w-[160px] disabled:opacity-70"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AgentFlowStatus)}
              disabled={!canEdit}
              aria-label="Flow status"
              className="text-xs px-2 py-1 border border-border rounded bg-background disabled:opacity-70"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  <span className="material-icons text-sm">save</span>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteFlow}
                  disabled={deleting}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20 disabled:opacity-60"
                >
                  <span className="material-icons text-sm">delete</span>
                  Delete
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Flow description — its own row so the header doesn't wrap further.
          The column has always existed and both routes accepted it; until now
          there was no way to read or write it from the portal. */}
      {flow && (
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canEdit}
          rows={2}
          maxLength={5000}
          aria-label="Flow description"
          placeholder="What this flow is for — when to run it, what it produces (optional)"
          className="w-full text-xs px-2 py-1.5 border border-border rounded-lg bg-background text-muted-foreground disabled:opacity-70 resize-y"
        />
      )}

      {!flow ? (
        <div className="flex-1 bg-card border border-border rounded-2xl flex items-center justify-center">
          <div className="text-center p-8">
            <span className="material-icons text-5xl text-muted-foreground">account_tree</span>
            <h3 className="mt-4 font-semibold text-foreground">
              {flowLoading ? 'Loading flow…' : 'No workflows yet'}
            </h3>
            {!flowLoading && (
              <p className="mt-2 text-sm text-muted-foreground">
                {canEdit ? 'Create a flow to start designing an agent pipeline.' : 'No agent flows have been designed for this project yet.'}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 gap-3 min-h-0">
          {/* Persona palette, grouped by department */}
          <div className="w-56 bg-card border border-border rounded-xl p-3 overflow-y-auto">
            {!canEdit && (
              <div className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1">
                <span className="material-icons text-sm">visibility</span>
                Read-only
              </div>
            )}
            <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Step</h3>
            <div className="space-y-1 mb-4">
              <button
                type="button"
                onClick={handleAddStep}
                disabled={!canEdit}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded hover:bg-muted transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span className="material-icons text-base text-primary">bolt</span>
                <span>Free step</span>
              </button>
              {/* Not under a department — a human node is explicitly not an
                  agent persona; the point is that no model runs it. */}
              <button
                type="button"
                onClick={handleAddHuman}
                disabled={!canEdit}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded hover:bg-muted transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span className="material-icons text-base text-amber-500">how_to_reg</span>
                <span>Human approval</span>
              </button>
            </div>
            {DEPARTMENTS.map((dept) => (
              <div key={dept.name} className="mb-4">
                <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
                  <span className="material-icons text-sm text-muted-foreground">{dept.icon}</span>
                  {dept.name}
                </h3>
                <div className="space-y-1">
                  {dept.personas.map((slug) => (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => handleAddAgent(slug)}
                      disabled={!canEdit}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded hover:bg-muted transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      <span className="material-icons text-base text-primary">smart_toy</span>
                      <span className="truncate">{AGENT_LABELS[slug]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Canvas */}
          <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden relative">
            <ReactFlow
              key={flow.id}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setRfInstance}
              onSelectionChange={onSelectionChange}
              nodesDraggable={canEdit}
              nodesConnectable={canEdit}
              elementsSelectable
              deleteKeyCode={canEdit ? ['Backspace', 'Delete'] : []}
              // `graph.viewport` only exists on flows saved before PUX-038 —
              // `buildSaveGraph` above never writes it anymore, so this branch
              // (and the stale pan/zoom it can pin) retires itself as each
              // remaining flow gets resaved. See buildSaveGraph's comment.
              fitView={!flow.graph.viewport}
              defaultViewport={flow.graph.viewport}
            >
              <Background />
              <Controls showInteractive={canEdit} />
              {/* reactflow's default MiniMap is opaque white and large — in
                  dark mode it read as a blank panel covering the lower-right
                  of the canvas. `!bg-card`/`!border-border` follow the portal
                  theme, and nodeColor reuses nodeStyle() so the minimap is
                  colour-matched to the canvas instead of uniform grey. */}
              <MiniMap
                className="rounded-lg"
                // Set inline, NOT via a Tailwind important-modifier class:
                // reactflow ships `.react-flow__minimap { background: #fff }`,
                // and on Tailwind 4 the v3 `!bg-card` prefix syntax generates
                // no CSS at all (v4 moved it to a `bg-card!` suffix), so the
                // class silently lost and the panel stayed white in dark mode.
                // An inline style beats the stylesheet without depending on
                // which Tailwind major is installed.
                style={{
                  width: 140,
                  height: 100,
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
                maskColor="rgb(0 0 0 / 0.25)"
                nodeColor={(n) => nodeStyle(n.data as AgentFlowNodeData).background as string}
                nodeStrokeWidth={0}
                pannable
                zoomable
              />
            </ReactFlow>
          </div>

          {/* Inspector — editable node/edge properties */}
          <div className="w-64 bg-card border border-border rounded-xl p-3 overflow-y-auto">
            <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Inspector</h3>
            {selectedNode ? (
              <NodeInspector
                data={selectedNode.data as AgentFlowNodeData}
                canEdit={canEdit}
                members={members}
                outgoingCount={edges.filter((e) => e.source === selectedNode.id).length}
                onChange={updateSelectedNode}
                onDelete={deleteSelectedNode}
              />
            ) : selectedEdge ? (
              <EdgeInspector
                edge={selectedEdge}
                canEdit={canEdit}
                onChange={updateSelectedEdge}
                onDelete={deleteSelectedEdge}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Click a node or connector to edit its details. {canEdit && 'Drag from a node handle to connect two steps.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
