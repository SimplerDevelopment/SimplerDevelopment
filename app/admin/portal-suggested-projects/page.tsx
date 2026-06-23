'use client';

import { useState, useEffect } from 'react';
import { formatCents } from '@/lib/portal-utils';
import SurveyBuilder, { SurveyField } from '@/components/admin/SurveyBuilder';

interface SuggestedProject {
  id: number;
  title: string;
  description: string | null;
  category: string;
  estimatedPrice: number | null;
  estimatedTimeline: string | null;
  features: string[];
  icon: string;
  active: boolean;
  clientId: number | null;
  order: number;
  surveyFields: SurveyField[];
  createdAt: string;
  clientCompany: string | null;
  clientName: string | null;
}

interface Client {
  id: number;
  company: string | null;
  userName: string;
}

const categoryOptions = [
  { value: 'website', label: 'Website' },
  { value: 'ecommerce', label: 'E-Commerce' },
  { value: 'mobile', label: 'Mobile App' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'branding', label: 'Branding' },
  { value: 'development', label: 'Development' },
  { value: 'other', label: 'Other' },
];

const categoryIcon: Record<string, string> = {
  website: 'web',
  ecommerce: 'shopping_cart',
  mobile: 'phone_iphone',
  maintenance: 'build',
  branding: 'palette',
  development: 'code',
  other: 'category',
};

const emptyForm = {
  title: '',
  description: '',
  category: 'website',
  estimatedPrice: '',
  estimatedTimeline: '',
  features: '',
  icon: 'rocket_launch',
  active: true,
  clientId: '',
  order: '0',
};

function SuggestedProjectForm({
  values,
  setValues,
  surveyFields,
  setSurveyFields,
  onSubmit,
  onCancel,
  submitLabel,
  saving,
  clients,
}: {
  values: typeof emptyForm;
  setValues: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  surveyFields: SurveyField[];
  setSurveyFields: (v: SurveyField[]) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  saving: boolean;
  clients: Client[];
}) {
  return (
    <form onSubmit={onSubmit} className="grid sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Title <span className="text-destructive">*</span></label>
        <input
          type="text" required value={values.title}
          onChange={e => setValues(v => ({ ...v, title: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Category</label>
        <select
          value={values.category}
          onChange={e => setValues(v => ({ ...v, category: e.target.value, icon: categoryIcon[e.target.value] ?? 'rocket_launch' }))}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {categoryOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <textarea
          rows={2} value={values.description}
          onChange={e => setValues(v => ({ ...v, description: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Estimated Price (USD)</label>
        <input
          type="number" min="0" step="0.01" placeholder="Leave blank = Quote on request"
          value={values.estimatedPrice}
          onChange={e => setValues(v => ({ ...v, estimatedPrice: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-xs text-muted-foreground mt-0.5">Leave blank to show &quot;Quote on request&quot;</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Estimated Timeline</label>
        <input
          type="text" placeholder="e.g. 2–4 weeks" value={values.estimatedTimeline}
          onChange={e => setValues(v => ({ ...v, estimatedTimeline: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Material Icon</label>
        <div className="flex items-center gap-2">
          <input
            type="text" placeholder="rocket_launch" value={values.icon}
            onChange={e => setValues(v => ({ ...v, icon: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="material-icons text-2xl text-primary flex-shrink-0">{values.icon || 'rocket_launch'}</span>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Display Order</label>
        <input
          type="number" min="0" value={values.order}
          onChange={e => setValues(v => ({ ...v, order: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-foreground mb-1">Target Client</label>
        <select
          value={values.clientId}
          onChange={e => setValues(v => ({ ...v, clientId: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All clients (global)</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.company ?? c.userName}</option>)}
        </select>
        <p className="text-xs text-muted-foreground mt-0.5">Leave blank to show to all portal clients.</p>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-foreground mb-1">Features / Selling Points (one per line)</label>
        <textarea
          rows={4} value={values.features}
          onChange={e => setValues(v => ({ ...v, features: e.target.value }))}
          placeholder={'Custom design\nMobile responsive\nSEO optimized'}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox" checked={values.active}
            onChange={e => setValues(v => ({ ...v, active: e.target.checked }))}
            className="w-4 h-4 rounded border-border accent-primary"
          />
          <span className="text-sm font-medium text-foreground">Active (visible to clients)</span>
        </label>
      </div>

      {/* ── Survey Builder ────────────────────────────────── */}
      <div className="sm:col-span-2 border-t border-border pt-4 mt-2">
        <SurveyBuilder fields={surveyFields} onChange={setSurveyFields} />
      </div>

      <div className="sm:col-span-2 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {saving
            ? <><span className="material-icons text-base animate-spin">refresh</span>Saving...</>
            : submitLabel}
        </button>
      </div>
    </form>
  );
}

export default function AdminSuggestedProjectsPage() {
  const [items, setItems] = useState<SuggestedProject[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [createSurveyFields, setCreateSurveyFields] = useState<SurveyField[]>([]);
  const [editSurveyFields, setEditSurveyFields] = useState<SurveyField[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/portal/suggested-projects').then(r => r.json()),
      fetch('/api/admin/portal/clients').then(r => r.json()),
    ]).then(([sp, c]) => {
      setItems(sp.data ?? []);
      setClients(c.data ?? []);
      setLoading(false);
    });
  }, []);

  function parseFeatures(text: string) {
    return text.split('\n').map(f => f.trim()).filter(Boolean);
  }

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/admin/portal/suggested-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        category: form.category,
        estimatedPrice: form.estimatedPrice ? Math.round(parseFloat(form.estimatedPrice) * 100) : null,
        estimatedTimeline: form.estimatedTimeline || null,
        features: parseFeatures(form.features),
        icon: form.icon || 'rocket_launch',
        active: form.active,
        clientId: form.clientId ? parseInt(form.clientId, 10) : null,
        order: parseInt(form.order, 10) || 0,
        surveyFields: createSurveyFields,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message ?? 'Failed'); return; }
    const client = clients.find(c => c.id === data.data.clientId);
    setItems(prev => [...prev, { ...data.data, clientCompany: client?.company ?? null, clientName: client?.userName ?? null }]);
    setShowCreate(false);
    setForm({ ...emptyForm });
    setCreateSurveyFields([]);
  }

  function startEdit(item: SuggestedProject) {
    setEditingId(item.id);
    setEditForm({
      title: item.title,
      description: item.description ?? '',
      category: item.category,
      estimatedPrice: item.estimatedPrice ? (item.estimatedPrice / 100).toFixed(2) : '',
      estimatedTimeline: item.estimatedTimeline ?? '',
      features: (item.features ?? []).join('\n'),
      icon: item.icon,
      active: item.active,
      clientId: item.clientId ? String(item.clientId) : '',
      order: String(item.order),
    });
    setEditSurveyFields(item.surveyFields ?? []);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId === null) return;
    setSaving(true);
    setError('');
    const res = await fetch(`/api/admin/portal/suggested-projects/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editForm.title,
        description: editForm.description || null,
        category: editForm.category,
        estimatedPrice: editForm.estimatedPrice ? Math.round(parseFloat(editForm.estimatedPrice) * 100) : null,
        estimatedTimeline: editForm.estimatedTimeline || null,
        features: parseFeatures(editForm.features),
        icon: editForm.icon || 'rocket_launch',
        active: editForm.active,
        clientId: editForm.clientId ? parseInt(editForm.clientId, 10) : null,
        order: parseInt(editForm.order, 10) || 0,
        surveyFields: editSurveyFields,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message ?? 'Failed to save'); return; }
    const client = clients.find(c => c.id === data.data.clientId);
    setItems(prev => prev.map(i => i.id === editingId
      ? { ...data.data, clientCompany: client?.company ?? null, clientName: client?.userName ?? null }
      : i));
    setEditingId(null);
  }

  async function deleteItem(id: number, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    const res = await fetch(`/api/admin/portal/suggested-projects/${id}`, { method: 'DELETE' });
    const data = await res.json();
    setDeleting(null);
    if (data.success) {
      setItems(prev => prev.filter(i => i.id !== id));
    } else {
      alert(data.message ?? 'Delete failed');
    }
  }

  async function toggleActive(id: number, active: boolean) {
    const res = await fetch(`/api/admin/portal/suggested-projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    const data = await res.json();
    if (data.success) setItems(prev => prev.map(i => i.id === id ? { ...i, active } : i));
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Market</h1>
          <p className="text-muted-foreground mt-1">
            Create project suggestions shown to clients in their portal. Add a survey to gather project details.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setEditingId(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">add</span>New Suggestion
        </button>
      </div>

      {showCreate && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Create Suggested Project</h2>
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">{error}</div>
          )}
          <SuggestedProjectForm
            values={form} setValues={setForm}
            surveyFields={createSurveyFields} setSurveyFields={setCreateSurveyFields}
            onSubmit={createItem} onCancel={() => { setShowCreate(false); setCreateSurveyFields([]); }}
            submitLabel="Create" saving={saving} clients={clients}
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">rocket_launch</span>
          <h3 className="mt-4 font-semibold text-foreground">No suggested projects yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Create your first suggestion above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className={`bg-card border rounded-xl overflow-hidden ${item.active ? 'border-border' : 'border-border opacity-60'}`}>
              {editingId === item.id ? (
                <div className="p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Editing: {item.title}</h3>
                  {error && (
                    <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">{error}</div>
                  )}
                  <SuggestedProjectForm
                    values={editForm} setValues={setEditForm}
                    surveyFields={editSurveyFields} setSurveyFields={setEditSurveyFields}
                    onSubmit={saveEdit} onCancel={() => setEditingId(null)}
                    submitLabel="Save Changes" saving={saving} clients={clients}
                  />
                </div>
              ) : (
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="material-icons text-2xl text-primary mt-0.5">{item.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground">{item.title}</h3>
                          <span className="text-xs text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded">
                            {categoryOptions.find(c => c.value === item.category)?.label ?? item.category}
                          </span>
                          {(item.surveyFields ?? []).length > 0 && (
                            <span className="text-xs text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <span className="material-icons text-xs">assignment</span>
                              {item.surveyFields.length} survey field{item.surveyFields.length !== 1 ? 's' : ''}
                            </span>
                          )}
                          {item.clientId ? (
                            <span className="text-xs text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <span className="material-icons text-xs">person</span>
                              {item.clientCompany ?? item.clientName ?? `Client #${item.clientId}`}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <span className="material-icons text-xs">public</span>All clients
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>
                        )}
                        <div className="mt-1 flex items-center gap-3 text-sm flex-wrap">
                          <span className="font-semibold text-foreground">
                            {item.estimatedPrice ? formatCents(item.estimatedPrice) : 'Quote on request'}
                          </span>
                          {item.estimatedTimeline && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <span className="material-icons text-xs">schedule</span>{item.estimatedTimeline}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">Order: {item.order}</span>
                        </div>
                        {(item.features ?? []).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            {(item.features ?? []).slice(0, 4).map((f, i) => (
                              <span key={i} className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <span className="material-icons text-xs text-green-600">check</span>{f}
                              </span>
                            ))}
                            {(item.features ?? []).length > 4 && (
                              <span className="text-xs text-muted-foreground">+{item.features.length - 4} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleActive(item.id, !item.active)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${item.active
                          ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                          : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'}`}
                      >
                        {item.active ? 'Active' : 'Inactive'}
                      </button>
                      <button
                        onClick={() => startEdit(item)}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <span className="material-icons text-base">edit</span>
                      </button>
                      <button
                        onClick={() => deleteItem(item.id, item.title)}
                        disabled={deleting === item.id}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        <span className="material-icons text-base">{deleting === item.id ? 'refresh' : 'delete_outline'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
