'use client';

import { useState, useEffect, useCallback } from 'react';

interface Pipeline {
  id: number;
  name: string;
  stages: Stage[];
}

interface Stage {
  id: number;
  name: string;
  color: string | null;
  probability: number;
  order: number;
}

interface Deal {
  id: number;
  title: string;
  value: number;
  status: string;
  priority: string;
  expectedCloseDate: string | null;
  contactId: number | null;
  contactName: string | null;
  companyId: number | null;
  companyName: string | null;
  stageId: number;
  pipelineId: number;
  notes: string | null;
  createdAt: string;
}

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
}

interface Company {
  id: number;
  name: string;
}

const priorityColor: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

const statusFilters = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function CrmDealsPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('open');

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    value: '',
    contactId: '',
    companyId: '',
    pipelineId: '',
    stageId: '',
    priority: 'medium',
    expectedCloseDate: '',
    notes: '',
  });

  // Load pipelines, contacts, companies
  useEffect(() => {
    Promise.all([
      fetch('/api/portal/crm/pipelines').then(r => r.json()),
      fetch('/api/portal/crm/contacts?limit=1000').then(r => r.json()),
      fetch('/api/portal/crm/companies').then(r => r.json()),
    ]).then(([p, c, co]) => {
      const pipelineData = p.data ?? [];
      setPipelines(pipelineData);
      setContacts(c.data?.contacts ?? c.data ?? []);
      setCompanies(co.data?.companies ?? co.data ?? []);
      if (pipelineData.length > 0) {
        setSelectedPipelineId(pipelineData[0].id);
      }
      setLoading(false);
    });
  }, []);

  const fetchDeals = useCallback(async () => {
    if (!selectedPipelineId) return;
    setDealsLoading(true);
    const params = new URLSearchParams({
      pipelineId: String(selectedPipelineId),
      status: statusFilter,
    });
    const res = await fetch(`/api/portal/crm/deals?${params}`);
    const d = await res.json();
    setDeals(d.data ?? []);
    setDealsLoading(false);
  }, [selectedPipelineId, statusFilter]);

  useEffect(() => {
    if (selectedPipelineId) fetchDeals();
  }, [selectedPipelineId, statusFilter, fetchDeals]);

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);
  const stages = selectedPipeline?.stages?.sort((a, b) => a.order - b.order) ?? [];

  function getDealsForStage(stageId: number): Deal[] {
    return deals.filter(d => d.stageId === stageId);
  }

  function getStageTotal(stageId: number): number {
    return getDealsForStage(stageId).reduce((sum, d) => sum + d.value, 0);
  }

  async function moveDeal(dealId: number, newStageId: number) {
    // Optimistic update
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stageId: newStageId } : d));
    await fetch(`/api/portal/crm/deals/${dealId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId: newStageId }),
    });
  }

  async function markDeal(dealId: number, status: 'won' | 'lost') {
    await fetch(`/api/portal/crm/deals/${dealId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchDeals();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      title: form.title,
      value: Math.round(parseFloat(form.value || '0') * 100),
      contactId: form.contactId ? Number(form.contactId) : null,
      companyId: form.companyId ? Number(form.companyId) : null,
      pipelineId: form.pipelineId ? Number(form.pipelineId) : selectedPipelineId,
      stageId: form.stageId ? Number(form.stageId) : (stages[0]?.id ?? null),
      priority: form.priority,
      expectedCloseDate: form.expectedCloseDate || null,
      notes: form.notes || null,
    };
    const res = await fetch('/api/portal/crm/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) {
      setError(d.message ?? 'Failed to create deal.');
      return;
    }
    setShowForm(false);
    setForm({ title: '', value: '', contactId: '', companyId: '', pipelineId: '', stageId: '', priority: 'medium', expectedCloseDate: '', notes: '' });
    fetchDeals();
  }

  // Compute available stages for the form based on selected pipeline
  const formPipelineId = form.pipelineId ? Number(form.pipelineId) : selectedPipelineId;
  const formStages = pipelines.find(p => p.id === formPipelineId)?.stages?.sort((a, b) => a.order - b.order) ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <span className="material-icons text-4xl text-muted-foreground mb-3 block">view_column</span>
        <p className="text-muted-foreground mb-2">No pipelines set up yet.</p>
        <p className="text-sm text-muted-foreground mb-4">Create a pipeline in CRM Settings to get started.</p>
        <a
          href="/portal/crm/settings"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          <span className="material-icons text-base">settings</span>
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedPipelineId ?? ''}
            onChange={e => setSelectedPipelineId(Number(e.target.value))}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {pipelines.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="flex gap-1">
            {statusFilters.map(s => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === s.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-foreground hover:bg-accent/80'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            setForm(f => ({
              ...f,
              pipelineId: String(selectedPipelineId ?? ''),
              stageId: String(stages[0]?.id ?? ''),
            }));
            setShowForm(s => !s);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
        >
          <span className="material-icons text-base">{showForm ? 'close' : 'add_circle'}</span>
          {showForm ? 'Cancel' : 'Add Deal'}
        </button>
      </div>

      {/* Add Deal form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-foreground">New Deal</h3>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <span className="material-icons text-base">error</span>
              {error}
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Title *</label>
              <input
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Value ($) *</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={form.value}
                onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Contact</label>
              <select
                value={form.contactId}
                onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">None</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Company</label>
              <select
                value={form.companyId}
                onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">None</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Pipeline</label>
              <select
                value={form.pipelineId}
                onChange={e => {
                  const pid = Number(e.target.value);
                  const pStages = pipelines.find(p => p.id === pid)?.stages?.sort((a, b) => a.order - b.order) ?? [];
                  setForm(f => ({ ...f, pipelineId: e.target.value, stageId: String(pStages[0]?.id ?? '') }));
                }}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {pipelines.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Stage</label>
              <select
                value={form.stageId}
                onChange={e => setForm(f => ({ ...f, stageId: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {formStages.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Expected Close Date</label>
              <input
                type="date"
                value={form.expectedCloseDate}
                onChange={e => setForm(f => ({ ...f, expectedCloseDate: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={1}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving && <span className="material-icons animate-spin text-sm">refresh</span>}
              Create Deal
            </button>
          </div>
        </form>
      )}

      {/* Kanban Board */}
      {dealsLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map(stage => {
            const stageDeals = getDealsForStage(stage.id);
            const stageTotal = getStageTotal(stage.id);
            return (
              <div key={stage.id} className="flex-shrink-0 w-72">
                {/* Stage header */}
                <div className="bg-card border border-border rounded-t-xl px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: stage.color || '#6b7280' }}
                      />
                      <h4 className="text-sm font-semibold text-foreground">{stage.name}</h4>
                      <span className="text-xs text-muted-foreground bg-accent px-1.5 py-0.5 rounded-full">
                        {stageDeals.length}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">{formatCurrency(stageTotal)}</p>
                </div>

                {/* Deal cards */}
                <div className="space-y-2 min-h-[200px] bg-muted/30 border-x border-b border-border rounded-b-xl p-2">
                  {stageDeals.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">No deals</p>
                  )}
                  {stageDeals.map(deal => (
                    <div key={deal.id} className="bg-card border border-border rounded-lg p-3 space-y-2 hover:border-primary/40 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="text-sm font-medium text-foreground leading-tight">{deal.title}</h5>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${priorityColor[deal.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                          {deal.priority}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-foreground">{formatCurrency(deal.value)}</p>
                      {deal.contactName && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="material-icons text-xs">person</span>
                          {deal.contactName}
                        </div>
                      )}
                      {deal.companyName && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="material-icons text-xs">business</span>
                          {deal.companyName}
                        </div>
                      )}
                      {deal.expectedCloseDate && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="material-icons text-xs">event</span>
                          {new Date(deal.expectedCloseDate).toLocaleDateString()}
                        </div>
                      )}

                      {/* Move stage buttons */}
                      <div className="flex items-center gap-1 pt-1 border-t border-border flex-wrap">
                        {stages.filter(s => s.id !== stage.id).map(s => (
                          <button
                            key={s.id}
                            onClick={() => moveDeal(deal.id, s.id)}
                            className="text-[10px] px-2 py-0.5 rounded bg-accent text-foreground hover:bg-accent/80 transition-colors truncate max-w-[80px]"
                            title={`Move to ${s.name}`}
                          >
                            {s.name}
                          </button>
                        ))}
                        <div className="flex gap-0.5 ml-auto">
                          <button
                            onClick={() => markDeal(deal.id, 'won')}
                            className="p-0.5 rounded text-green-600 hover:bg-green-50 transition-colors"
                            title="Mark as Won"
                          >
                            <span className="material-icons text-sm">emoji_events</span>
                          </button>
                          <button
                            onClick={() => markDeal(deal.id, 'lost')}
                            className="p-0.5 rounded text-red-500 hover:bg-red-50 transition-colors"
                            title="Mark as Lost"
                          >
                            <span className="material-icons text-sm">cancel</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
