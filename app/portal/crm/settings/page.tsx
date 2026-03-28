'use client';

import { useState, useEffect } from 'react';
import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';
import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';

const CRM_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'deal_won_notification',
    name: 'Deal Won Notification',
    description: 'Create a task to kick off onboarding when a deal is marked as won',
    icon: 'celebration',
    trigger: { event: 'crm.deal.won' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Deal won: {{event.title}} - Start onboarding', body: 'Deal "{{event.title}}" has been won! Begin onboarding process for the client.' } }],
  },
  {
    key: 'deal_lost_review',
    name: 'Deal Lost Review',
    description: 'Create a review task when a deal is lost to analyze what went wrong',
    icon: 'rate_review',
    trigger: { event: 'crm.deal.lost' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Deal lost review: {{event.title}}', body: 'Deal "{{event.title}}" was lost. Schedule a review to understand what happened and improve the process.' } }],
  },
  {
    key: 'new_contact_task',
    name: 'New Contact Follow-up',
    description: 'Create a follow-up task when a new contact is added to the CRM',
    icon: 'person_add',
    trigger: { event: 'crm.contact.created' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Follow up with new contact: {{event.name}}', body: 'New contact added: {{event.name}} ({{event.email}}). Reach out within 24 hours.' } }],
    settings: [
      {
        key: 'followUpDelay',
        label: 'Follow up within',
        type: 'select',
        options: [
          { value: '0', label: 'Immediately' },
          { value: '3600', label: '1 hour' },
          { value: '86400', label: '1 day' },
          { value: '172800', label: '2 days' },
        ],
        defaultValue: '0',
        mapsTo: { actionIndex: 0, paramKey: 'delay' },
      },
    ],
  },
  {
    key: 'deal_stage_change',
    name: 'Deal Stage Change Alert',
    description: 'Get notified when a deal moves to a new pipeline stage',
    icon: 'swap_horiz',
    trigger: { event: 'crm.deal.updated' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Deal moved: {{event.title}}', body: 'Deal "{{event.title}}" has been updated. Review the new stage and plan next steps.' } }],
  },
  {
    key: 'deal_created_project',
    name: 'Auto-Create Project on Deal Won',
    description: 'Automatically create a project when a deal is won to track delivery',
    icon: 'view_kanban',
    trigger: { event: 'crm.deal.won' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New project needed: {{event.title}}', body: 'Deal "{{event.title}}" was won. A project should be created to track delivery.' } }],
  },
];

interface Pipeline {
  id: number;
  name: string;
  stages: Stage[];
}

interface Stage {
  id: number;
  name: string;
  color: string;
  probability: number;
  order: number;
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

const defaultColors = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
];

export default function CrmSettingsPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  // Pipeline form
  const [newPipelineName, setNewPipelineName] = useState('');
  const [pipelineSaving, setPipelineSaving] = useState(false);
  const [editingPipelineId, setEditingPipelineId] = useState<number | null>(null);
  const [editPipelineName, setEditPipelineName] = useState('');

  // Stage form
  const [expandedPipelineId, setExpandedPipelineId] = useState<number | null>(null);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#3b82f6');
  const [newStageProbability, setNewStageProbability] = useState('50');
  const [stageSaving, setStageSaving] = useState(false);

  // Tag form
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [tagSaving, setTagSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/crm/pipelines').then(r => r.json()),
      fetch('/api/portal/crm/tags').then(r => r.json()),
    ]).then(([p, t]) => {
      setPipelines(p.data ?? []);
      setTags(t.data ?? []);
      setLoading(false);
    });
  }, []);

  async function createPipeline(e: React.FormEvent) {
    e.preventDefault();
    if (!newPipelineName.trim()) return;
    setPipelineSaving(true);
    const res = await fetch('/api/portal/crm/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newPipelineName.trim() }),
    });
    const d = await res.json();
    setPipelineSaving(false);
    if (d.success) {
      setPipelines(prev => [...prev, { ...d.data, stages: d.data.stages ?? [] }]);
      setNewPipelineName('');
    }
  }

  async function updatePipelineName(id: number) {
    if (!editPipelineName.trim()) return;
    await fetch(`/api/portal/crm/pipelines/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editPipelineName.trim() }),
    });
    setPipelines(prev => prev.map(p => p.id === id ? { ...p, name: editPipelineName.trim() } : p));
    setEditingPipelineId(null);
  }

  async function deletePipeline(id: number) {
    if (!confirm('Delete this pipeline and all its stages? Deals will be unassigned.')) return;
    await fetch(`/api/portal/crm/pipelines/${id}`, { method: 'DELETE' });
    setPipelines(prev => prev.filter(p => p.id !== id));
    if (expandedPipelineId === id) setExpandedPipelineId(null);
  }

  async function addStage(pipelineId: number, e: React.FormEvent) {
    e.preventDefault();
    if (!newStageName.trim()) return;
    setStageSaving(true);
    const pipeline = pipelines.find(p => p.id === pipelineId);
    const order = (pipeline?.stages?.length ?? 0) + 1;
    const res = await fetch(`/api/portal/crm/pipelines/${pipelineId}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newStageName.trim(),
        color: newStageColor,
        probability: Number(newStageProbability),
        order,
      }),
    });
    const d = await res.json();
    setStageSaving(false);
    if (d.success) {
      setPipelines(prev =>
        prev.map(p =>
          p.id === pipelineId
            ? { ...p, stages: [...(p.stages ?? []), d.data] }
            : p
        )
      );
      setNewStageName('');
      setNewStageColor('#3b82f6');
      setNewStageProbability('50');
    }
  }

  async function deleteStage(pipelineId: number, stageId: number) {
    if (!confirm('Delete this stage? Deals in this stage will need to be reassigned.')) return;
    await fetch(`/api/portal/crm/pipelines/${pipelineId}/stages/${stageId}`, { method: 'DELETE' });
    setPipelines(prev =>
      prev.map(p =>
        p.id === pipelineId
          ? { ...p, stages: (p.stages ?? []).filter(s => s.id !== stageId) }
          : p
      )
    );
  }

  async function moveStage(pipelineId: number, stageId: number, direction: 'up' | 'down') {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;
    const sorted = [...(pipeline.stages ?? [])].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(s => s.id === stageId);
    if (direction === 'up' && idx <= 0) return;
    if (direction === 'down' && idx >= sorted.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const tempOrder = sorted[idx].order;
    sorted[idx].order = sorted[swapIdx].order;
    sorted[swapIdx].order = tempOrder;

    // Optimistic update
    setPipelines(prev =>
      prev.map(p => p.id === pipelineId ? { ...p, stages: [...sorted] } : p)
    );

    // Persist
    await fetch(`/api/portal/crm/pipelines/${pipelineId}/stages/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stages: sorted.sort((a, b) => a.order - b.order).map((s, i) => ({ id: s.id, order: i + 1 })),
      }),
    });
  }

  async function createTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setTagSaving(true);
    const res = await fetch('/api/portal/crm/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
    });
    const d = await res.json();
    setTagSaving(false);
    if (d.success) {
      setTags(prev => [...prev, d.data]);
      setNewTagName('');
      setNewTagColor('#3b82f6');
    }
  }

  async function deleteTag(id: number) {
    if (!confirm('Delete this tag?')) return;
    await fetch(`/api/portal/crm/tags/${id}`, { method: 'DELETE' });
    setTags(prev => prev.filter(t => t.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Pipelines */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div>
          <h3 className="font-semibold text-foreground text-lg">Pipelines</h3>
          <p className="text-sm text-muted-foreground mt-1">Manage your deal pipelines and stages.</p>
        </div>

        {/* Pipeline list */}
        <div className="space-y-3">
          {pipelines.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No pipelines yet. Create one to get started.</p>
          )}
          {pipelines.map(pipeline => (
            <div key={pipeline.id} className="border border-border rounded-lg overflow-hidden">
              {/* Pipeline header */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                {editingPipelineId === pipeline.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      value={editPipelineName}
                      onChange={e => setEditPipelineName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') updatePipelineName(pipeline.id);
                        if (e.key === 'Escape') setEditingPipelineId(null);
                      }}
                      autoFocus
                      className="flex-1 px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                      onClick={() => updatePipelineName(pipeline.id)}
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingPipelineId(null)}
                      className="text-muted-foreground text-sm hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setExpandedPipelineId(expandedPipelineId === pipeline.id ? null : pipeline.id)}
                    className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                  >
                    <span className="material-icons text-base">
                      {expandedPipelineId === pipeline.id ? 'expand_more' : 'chevron_right'}
                    </span>
                    {pipeline.name}
                    <span className="text-xs text-muted-foreground font-normal">
                      ({(pipeline.stages ?? []).length} stage{(pipeline.stages ?? []).length !== 1 ? 's' : ''})
                    </span>
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingPipelineId(pipeline.id);
                      setEditPipelineName(pipeline.name);
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Rename"
                  >
                    <span className="material-icons text-base">edit</span>
                  </button>
                  <button
                    onClick={() => deletePipeline(pipeline.id)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete"
                  >
                    <span className="material-icons text-base">delete</span>
                  </button>
                </div>
              </div>

              {/* Stages */}
              {expandedPipelineId === pipeline.id && (
                <div className="p-4 space-y-3">
                  {/* Stage list */}
                  {(pipeline.stages ?? []).sort((a, b) => a.order - b.order).map((stage, i) => (
                    <div key={stage.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-accent/50 transition-colors">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: stage.color || '#6b7280' }}
                      />
                      <span className="text-sm font-medium text-foreground flex-1">{stage.name}</span>
                      <span className="text-xs text-muted-foreground">{stage.probability}%</span>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => moveStage(pipeline.id, stage.id, 'up')}
                          disabled={i === 0}
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                        >
                          <span className="material-icons text-sm">arrow_upward</span>
                        </button>
                        <button
                          onClick={() => moveStage(pipeline.id, stage.id, 'down')}
                          disabled={i === (pipeline.stages ?? []).length - 1}
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                        >
                          <span className="material-icons text-sm">arrow_downward</span>
                        </button>
                        <button
                          onClick={() => deleteStage(pipeline.id, stage.id)}
                          className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors ml-1"
                        >
                          <span className="material-icons text-sm">close</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add stage form */}
                  <form onSubmit={e => addStage(pipeline.id, e)} className="flex items-end gap-3 pt-2 border-t border-border">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Stage Name</label>
                      <input
                        value={newStageName}
                        onChange={e => setNewStageName(e.target.value)}
                        placeholder="e.g. Proposal"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Color</label>
                      <div className="flex gap-1 flex-wrap">
                        <input
                          type="color"
                          value={newStageColor}
                          onChange={e => setNewStageColor(e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border border-border"
                        />
                      </div>
                    </div>
                    <div className="w-20">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Prob. %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={newStageProbability}
                        onChange={e => setNewStageProbability(e.target.value)}
                        className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={stageSaving || !newStageName.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {stageSaving && <span className="material-icons animate-spin text-xs">refresh</span>}
                      <span className="material-icons text-sm">add</span>
                      Add
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Create pipeline */}
        <form onSubmit={createPipeline} className="flex gap-3 pt-2 border-t border-border">
          <input
            value={newPipelineName}
            onChange={e => setNewPipelineName(e.target.value)}
            placeholder="New pipeline name..."
            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            type="submit"
            disabled={pipelineSaving || !newPipelineName.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {pipelineSaving && <span className="material-icons animate-spin text-sm">refresh</span>}
            Create Pipeline
          </button>
        </form>
      </div>

      {/* Tags */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div>
          <h3 className="font-semibold text-foreground text-lg">Tags</h3>
          <p className="text-sm text-muted-foreground mt-1">Manage tags for organizing contacts.</p>
        </div>

        {/* Tag list */}
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && (
            <p className="text-sm text-muted-foreground">No tags yet.</p>
          )}
          {tags.map(tag => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-border"
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: tag.color || '#6b7280' }}
              />
              {tag.name}
              <button
                onClick={() => deleteTag(tag.id)}
                className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
              >
                <span className="material-icons text-xs">close</span>
              </button>
            </span>
          ))}
        </div>

        {/* Add tag form */}
        <form onSubmit={createTag} className="flex items-end gap-3 pt-2 border-t border-border">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Tag Name</label>
            <input
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              placeholder="e.g. VIP"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Color</label>
            <div className="flex gap-1 items-center">
              <input
                type="color"
                value={newTagColor}
                onChange={e => setNewTagColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border"
              />
              <div className="flex gap-1">
                {defaultColors.slice(0, 5).map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewTagColor(color)}
                    className={`w-5 h-5 rounded-full border-2 transition-colors ${
                      newTagColor === color ? 'border-foreground' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={tagSaving || !newTagName.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {tagSaving && <span className="material-icons animate-spin text-sm">refresh</span>}
            Add Tag
          </button>
        </form>
      </div>

      {/* ─── Automations ───────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-6">
        <ProductAutomationSettings
          productScope="crm"
          presets={CRM_AUTOMATION_PRESETS}
          title="CRM Automations"
          description="Automate follow-ups, notifications, and workflows for your deals and contacts"
        />
      </div>
    </div>
  );
}
