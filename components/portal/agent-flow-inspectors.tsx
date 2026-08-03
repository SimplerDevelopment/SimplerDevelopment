'use client';

// Extracted from AgentFlowTab.tsx (file-size budget split, no behavior
// change) — the right-side inspector panels for the Workflow Designer
// canvas. Pure presentational components: render the selected node/edge's
// editable properties and delegate mutation to the callbacks the parent
// (AgentFlowTab) passes in.

import { useState } from 'react';
import type { Edge } from 'reactflow';
import type { AgentFlowNodeData } from '@/lib/agent-flows/types';
import type { EdgeKind, ProjectMemberOption } from './AgentFlowTab';

function memberLabel(m: ProjectMemberOption): string {
  return m.name?.trim() || m.email?.trim() || `User ${m.userId}`;
}

/**
 * Assignee picker for a human-in-the-loop node. Visual pattern deliberately
 * mirrors the card-detail sidebar (initial chip + remove + "Add" dropdown)
 * so assignment looks the same wherever you do it in the portal.
 *
 * Ids whose member is no longer on the project still render — as "Unknown
 * member" — rather than being silently dropped, so removing someone from a
 * project never quietly rewrites a saved flow.
 */
function AssigneePicker({
  assigneeIds,
  members,
  canEdit,
  onChange,
}: {
  assigneeIds: number[];
  members: ProjectMemberOption[];
  canEdit: boolean;
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const candidates = members.filter((m) => !assigneeIds.includes(m.userId));

  return (
    <div>
      <span className="block text-[11px] text-muted-foreground mb-1">Waiting on</span>
      <div className="space-y-1.5">
        {assigneeIds.map((id) => {
          const m = members.find((x) => x.userId === id);
          const label = m ? memberLabel(m) : 'Unknown member';
          return (
            <div key={id} className="flex items-center gap-2 text-xs">
              <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                {label.charAt(0).toUpperCase()}
              </span>
              <span className={`flex-1 truncate ${m ? 'text-foreground' : 'text-muted-foreground italic'}`}>{label}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onChange(assigneeIds.filter((v) => v !== id))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${label}`}
                >
                  <span className="material-icons text-sm">close</span>
                </button>
              )}
            </div>
          );
        })}

        {assigneeIds.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No one assigned</p>
        )}

        {canEdit && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary"
            >
              <span className="material-icons text-sm">{open ? 'close' : 'person_add'}</span>
              {open ? 'Close' : 'Add'}
            </button>
            {open && (
              <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {candidates.map((m) => (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() => { onChange([...assigneeIds, m.userId]); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left"
                  >
                    <span className="material-icons text-sm text-muted-foreground">person</span>
                    <span className="truncate">{memberLabel(m)}</span>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <p className="text-xs text-muted-foreground italic p-3">
                    {members.length === 0 ? 'No project members' : 'No one left to add'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function NodeInspector({
  data,
  canEdit,
  members,
  outgoingCount,
  onChange,
  onDelete,
}: {
  data: AgentFlowNodeData;
  canEdit: boolean;
  members: ProjectMemberOption[];
  /** How many edges leave this node — the fan-out control is meaningless below 2. */
  outgoingCount: number;
  onChange: (patch: Partial<AgentFlowNodeData>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="node-label" className="block text-[11px] text-muted-foreground mb-1">Label</label>
        <input
          id="node-label"
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
          disabled={!canEdit}
          className="w-full text-xs px-2 py-1.5 border border-border rounded bg-background disabled:opacity-70"
        />
      </div>

      {data.kind === 'agent' ? (
        <>
          <div>
            <label htmlFor="node-persona" className="block text-[11px] text-muted-foreground mb-1">Persona</label>
            <div id="node-persona" className="text-xs px-2 py-1.5 border border-border rounded bg-muted/40 text-muted-foreground">
              {data.agentType}
            </div>
          </div>
          <div>
            <label htmlFor="node-model" className="block text-[11px] text-muted-foreground mb-1">Model</label>
            <select
              id="node-model"
              value={data.model ?? 'sonnet'}
              onChange={(e) => onChange({ model: e.target.value as AgentFlowNodeData['model'] })}
              disabled={!canEdit}
              className="w-full text-xs px-2 py-1.5 border border-border rounded bg-background disabled:opacity-70"
            >
              <option value="opus">Opus</option>
              <option value="sonnet">Sonnet</option>
              <option value="haiku">Haiku</option>
            </select>
          </div>
          <div>
            <label htmlFor="node-role" className="block text-[11px] text-muted-foreground mb-1">Role note</label>
            <input
              id="node-role"
              value={data.role ?? ''}
              onChange={(e) => onChange({ role: e.target.value })}
              disabled={!canEdit}
              placeholder="What this agent owns in the flow"
              className="w-full text-xs px-2 py-1.5 border border-border rounded bg-background disabled:opacity-70"
            />
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="node-description" className="block text-[11px] text-muted-foreground mb-1">Description</label>
          <input
            id="node-description"
            value={data.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            disabled={!canEdit}
            placeholder="What happens at this step"
            className="w-full text-xs px-2 py-1.5 border border-border rounded bg-background disabled:opacity-70"
          />
        </div>
      )}

      {/* Only meaningful once a node actually branches — showing it on every
          linear step would be noise, and the default ('all') is correct for
          the single-edge case anyway. */}
      {outgoingCount > 1 && (
        <div>
          <label htmlFor="node-fanout" className="block text-[11px] text-muted-foreground mb-1">
            Branching ({outgoingCount} outgoing)
          </label>
          <select
            id="node-fanout"
            value={data.fanOut ?? 'all'}
            onChange={(e) => onChange({ fanOut: e.target.value as AgentFlowNodeData['fanOut'] })}
            disabled={!canEdit}
            className="w-full text-xs px-2 py-1.5 border border-border rounded bg-background disabled:opacity-70"
          >
            <option value="all">Run all branches (parallel)</option>
            <option value="one">Take one branch (exclusive)</option>
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {(data.fanOut ?? 'all') === 'all'
              ? 'Every connector out of this node is followed.'
              : 'Exactly one connector is taken — the connector labels become the choices.'}
          </p>
        </div>
      )}

      {data.kind === 'human' && (
        <AssigneePicker
          assigneeIds={data.assigneeIds ?? []}
          members={members}
          canEdit={canEdit}
          onChange={(ids) => onChange({ assigneeIds: ids })}
        />
      )}

      <div>
        <label htmlFor="node-prompt" className="block text-[11px] text-muted-foreground mb-1">
          {data.kind === 'human' ? 'Review instructions' : 'Prompt'}
        </label>
        <textarea
          id="node-prompt"
          value={data.prompt ?? ''}
          onChange={(e) => onChange({ prompt: e.target.value })}
          disabled={!canEdit}
          rows={4}
          placeholder={data.kind === 'human'
            ? 'What the reviewer should check before signing off'
            : 'Instructions this node runs with — stored on the flow (a future runtime will use it)'}
          className="w-full text-xs px-2 py-1.5 border border-border rounded bg-background disabled:opacity-70 resize-y"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={!!data.entryPoint}
          onChange={(e) => onChange({ entryPoint: e.target.checked })}
          disabled={!canEdit}
        />
        Entry point
      </label>

      {canEdit && (
        <button
          type="button"
          onClick={onDelete}
          className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border border-border hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
        >
          <span className="material-icons text-sm">delete</span>
          Delete node
        </button>
      )}
    </div>
  );
}

export function EdgeInspector({
  edge,
  canEdit,
  onChange,
  onDelete,
}: {
  edge: Edge;
  canEdit: boolean;
  onChange: (patch: { label?: string; kind?: EdgeKind }) => void;
  onDelete: () => void;
}) {
  const kind: EdgeKind = (edge.data as { kind?: EdgeKind } | undefined)?.kind ?? 'handoff';
  const label = typeof edge.label === 'string' ? edge.label : '';
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="edge-label" className="block text-[11px] text-muted-foreground mb-1">Label</label>
        <input
          id="edge-label"
          value={label}
          onChange={(e) => onChange({ label: e.target.value })}
          disabled={!canEdit}
          placeholder="e.g. approved, needs revision"
          className="w-full text-xs px-2 py-1.5 border border-border rounded bg-background disabled:opacity-70"
        />
      </div>
      <div>
        <label htmlFor="edge-kind" className="block text-[11px] text-muted-foreground mb-1">Kind</label>
        <select
          id="edge-kind"
          value={kind}
          onChange={(e) => onChange({ kind: e.target.value as EdgeKind })}
          disabled={!canEdit}
          className="w-full text-xs px-2 py-1.5 border border-border rounded bg-background disabled:opacity-70"
        >
          <option value="handoff">Handoff</option>
          <option value="dependency">Dependency</option>
        </select>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={onDelete}
          className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border border-border hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
        >
          <span className="material-icons text-sm">delete</span>
          Delete connector
        </button>
      )}
    </div>
  );
}
