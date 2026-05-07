'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
  WorkflowGraph,
  WorkflowAction,
  WorkflowTriggerConfig,
  WorkflowStatus,
} from '@/lib/workflows/types';

interface WorkflowResponse {
  id: number;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  trigger: WorkflowTriggerConfig;
  graph: WorkflowGraph;
}

interface RunRow {
  id: number;
  status: string;
  triggeredBy: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

// Sidebar palette — click these to add a node to the canvas.
interface PaletteEntry {
  type: 'trigger' | 'action' | 'condition';
  icon: string;
  label: string;
  defaultData: WorkflowTriggerConfig | WorkflowAction;
}

const PALETTE: PaletteEntry[] = [
  { type: 'trigger', icon: 'person_add', label: 'Contact created', defaultData: { kind: 'contact.created' } },
  { type: 'trigger', icon: 'sync_alt', label: 'Deal stage changed', defaultData: { kind: 'deal.stage_changed' } },
  { type: 'trigger', icon: 'assignment_turned_in', label: 'Form submitted', defaultData: { kind: 'form.submitted' } },
  { type: 'trigger', icon: 'webhook', label: 'Webhook received', defaultData: { kind: 'webhook.received', secret: 'change-me' } },
  { type: 'trigger', icon: 'schedule', label: 'Schedule (cron)', defaultData: { kind: 'schedule', cron: '0 9 * * 1' } },
  { type: 'action', icon: 'mail', label: 'Send email', defaultData: { kind: 'send_email', templateId: 0, to: 'contact' } },
  { type: 'action', icon: 'task_alt', label: 'Create task', defaultData: { kind: 'create_task', title: 'Follow up' } },
  { type: 'action', icon: 'playlist_add', label: 'Add to list', defaultData: { kind: 'add_to_list', listId: 0 } },
  { type: 'action', icon: 'hourglass_empty', label: 'Wait', defaultData: { kind: 'wait', ms: 60_000 } },
  { type: 'action', icon: 'send', label: 'Webhook', defaultData: { kind: 'webhook', url: 'https://example.com', payload: {} } },
  { type: 'condition', icon: 'fork_right', label: 'Condition', defaultData: { kind: 'condition', expression: 'true' } },
];

function nodeLabel(data: WorkflowTriggerConfig | WorkflowAction): string {
  switch (data.kind) {
    case 'contact.created': return 'Contact created';
    case 'deal.stage_changed': return 'Deal stage changed';
    case 'form.submitted': return 'Form submitted';
    case 'webhook.received': return 'Webhook received';
    case 'schedule': return `Schedule: ${data.cron}`;
    case 'send_email': return `Send email (template ${data.templateId})`;
    case 'create_task': return `Create task: ${data.title}`;
    case 'add_to_list': return `Add to list ${data.listId}`;
    case 'wait': return `Wait ${Math.round(data.ms / 1000)}s`;
    case 'webhook': return `Webhook to ${truncate(data.url, 30)}`;
    case 'condition': return `If: ${truncate(data.expression, 30)}`;
    default: return 'Unknown';
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '...';
}

// Translate our workflow graph into ReactFlow's Node/Edge shape, embedding
// our typed payload on `node.data.payload` and a label for display.
function toRFNodes(graph: WorkflowGraph): Node[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    position: n.position,
    data: { payload: n.data, kind: n.type, label: nodeLabel(n.data) },
    type: 'default',
    style: nodeStyle(n.type),
  }));
}

function toRFEdges(graph: WorkflowGraph): Edge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'default',
    animated: true,
  }));
}

function nodeStyle(kind: 'trigger' | 'action' | 'condition'): React.CSSProperties {
  if (kind === 'trigger') {
    return { background: '#10b981', color: 'white', border: 'none', borderRadius: 10, padding: 8, fontSize: 12 };
  }
  if (kind === 'condition') {
    return { background: '#f59e0b', color: 'white', border: 'none', borderRadius: 10, padding: 8, fontSize: 12 };
  }
  return { background: '#3b82f6', color: 'white', border: 'none', borderRadius: 10, padding: 8, fontSize: 12 };
}

function newNodeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

// Re-derive our graph shape from the live ReactFlow nodes/edges so we can
// persist it to the API.
function fromRF(nodes: Node[], edges: Edge[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) => {
      const data = n.data as { payload: WorkflowTriggerConfig | WorkflowAction; kind: 'trigger' | 'action' | 'condition' };
      return {
        id: n.id,
        type: data.kind,
        position: n.position,
        data: data.payload,
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: (e.label as 'true' | 'false' | undefined) ?? undefined,
    })),
  };
}

export default function WorkflowEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ? parseInt(params.id, 10) : NaN;

  const [wf, setWf] = useState<WorkflowResponse | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<WorkflowStatus>('draft');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    void Promise.all([
      fetch(`/api/portal/workflows/${id}`).then((r) => r.json()),
      fetch(`/api/portal/workflows/${id}/runs?limit=10`).then((r) => r.json()),
    ])
      .then(([wfRes, runsRes]) => {
        if (wfRes?.success) {
          const data: WorkflowResponse = wfRes.data;
          setWf(data);
          setNodes(toRFNodes(data.graph));
          setEdges(toRFEdges(data.graph));
          setName(data.name);
          setStatus(data.status);
        }
        if (runsRes?.success) setRuns(runsRes.data ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);
  const onConnect = useCallback((conn: Connection) => {
    setEdges((eds) => addEdge({ ...conn, id: `e-${Math.random().toString(36).slice(2, 8)}`, animated: true }, eds));
  }, []);

  const handleAdd = useCallback((entry: PaletteEntry) => {
    const nid = newNodeId(entry.type);
    const position = rfInstance
      ? rfInstance.screenToFlowPosition({ x: 250, y: 200 })
      : { x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 };
    setNodes((nds) =>
      nds.concat({
        id: nid,
        position,
        data: { payload: entry.defaultData, kind: entry.type, label: nodeLabel(entry.defaultData) },
        type: 'default',
        style: nodeStyle(entry.type),
      }),
    );
  }, [rfInstance]);

  const handleSave = useCallback(async () => {
    if (!wf) return;
    setSaving(true);
    try {
      const graph = fromRF(nodes, edges);
      await fetch(`/api/portal/workflows/${wf.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, status, graph }),
      });
    } finally {
      setSaving(false);
    }
  }, [wf, nodes, edges, name, status]);

  const handleTestRun = useCallback(async () => {
    if (!wf) return;
    setTesting(true);
    try {
      // Save current graph first so the run uses the latest version.
      await handleSave();
      await fetch(`/api/portal/workflows/${wf.id}/test-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: {} }),
      });
      // Refresh runs list.
      const runsRes = await fetch(`/api/portal/workflows/${wf.id}/runs?limit=10`).then((r) => r.json());
      if (runsRes?.success) setRuns(runsRes.data ?? []);
    } finally {
      setTesting(false);
    }
  }, [wf, handleSave]);

  const handleDelete = useCallback(async () => {
    if (!wf) return;
    if (!confirm('Delete this workflow? This cannot be undone.')) return;
    await fetch(`/api/portal/workflows/${wf.id}`, { method: 'DELETE' });
    router.push('/portal/automations/workflows');
  }, [wf, router]);

  const triggerKindLabel = useMemo(() => wf?.trigger?.kind ?? '-', [wf]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6 text-sm text-muted-foreground">
        <span className="material-icons text-base align-middle animate-spin mr-2">progress_activity</span>
        Loading workflow...
      </div>
    );
  }
  if (!wf) {
    return (
      <div className="max-w-6xl mx-auto p-6 text-sm text-muted-foreground">
        Workflow not found.
        <Link href="/portal/automations/workflows" className="text-primary ml-2 hover:underline">Back to list</Link>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/portal/automations/workflows" className="text-muted-foreground hover:text-foreground">
          <span className="material-icons">arrow_back</span>
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-lg font-semibold bg-transparent border border-transparent hover:border-border focus:border-border rounded px-2 py-1 outline-none flex-1 min-w-[200px]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as WorkflowStatus)}
          className="text-xs px-2 py-1 border border-border rounded bg-background"
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
        <span className="text-xs text-muted-foreground">
          Trigger: <code className="font-mono">{triggerKindLabel}</code>
        </span>
        <button
          type="button"
          onClick={handleTestRun}
          disabled={testing}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted disabled:opacity-60"
        >
          <span className="material-icons text-sm">play_arrow</span>
          {testing ? 'Running...' : 'Test run'}
        </button>
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
          onClick={handleDelete}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
        >
          <span className="material-icons text-sm">delete</span>
          Delete
        </button>
      </div>

      {/* Canvas + sidebar */}
      <div className="flex flex-1 gap-3 min-h-0">
        {/* Sidebar */}
        <div className="w-56 bg-card border border-border rounded-xl p-3 overflow-y-auto">
          <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Triggers</h3>
          <div className="space-y-1 mb-4">
            {PALETTE.filter((p) => p.type === 'trigger').map((p) => (
              <PaletteButton key={p.label} entry={p} onAdd={handleAdd} />
            ))}
          </div>
          <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Actions</h3>
          <div className="space-y-1 mb-4">
            {PALETTE.filter((p) => p.type === 'action').map((p) => (
              <PaletteButton key={p.label} entry={p} onAdd={handleAdd} />
            ))}
          </div>
          <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Logic</h3>
          <div className="space-y-1">
            {PALETTE.filter((p) => p.type === 'condition').map((p) => (
              <PaletteButton key={p.label} entry={p} onAdd={handleAdd} />
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRfInstance}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {/* Runs panel */}
        <div className="w-64 bg-card border border-border rounded-xl p-3 overflow-y-auto">
          <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Recent runs</h3>
          {runs.length === 0 ? (
            <div className="text-xs text-muted-foreground">No runs yet. Click Test run to fire one.</div>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => (
                <li key={r.id} className="text-xs border border-border rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">#{r.id}</span>
                    <RunStatusBadge status={r.status} />
                  </div>
                  <div className="text-muted-foreground mt-1">
                    {r.triggeredBy} · {new Date(r.startedAt).toLocaleTimeString()}
                  </div>
                  {r.error && <div className="text-red-600 mt-1 line-clamp-3">{r.error}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-xs text-muted-foreground">
        <span className="material-icons text-sm align-middle mr-1">info</span>
        Click a palette entry to add it to the canvas. Drag nodes to rearrange. Drag from a node handle to connect.
      </div>
    </div>
  );
}

function PaletteButton({ entry, onAdd }: { entry: PaletteEntry; onAdd: (e: PaletteEntry) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(entry)}
      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded hover:bg-muted transition-colors"
    >
      <span className="material-icons text-base text-primary">{entry.icon}</span>
      <span>{entry.label}</span>
    </button>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded ${styles[status] ?? styles.pending}`}>{status}</span>
  );
}
