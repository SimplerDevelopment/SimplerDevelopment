'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Artifact {
  id: number;
  dealId: number;
  artifactType: string;
  artifactId: number;
  displayTitle: string;
  pinned: boolean;
  createdAt: string;
}

interface AvailableArtifact {
  type: string;
  id: number;
  title: string;
}

interface Comment {
  id: number;
  dealId: number;
  authorId: number;
  authorName: string | null;
  body: string;
  attachments: { url: string; filename: string; mimeType: string; fileSize: number }[];
  createdAt: string;
}

interface MentionUser {
  id: number;
  name: string | null;
}

const ARTIFACT_ICONS: Record<string, string> = {
  website: 'language',
  email_campaign: 'campaign',
  pitch_deck: 'slideshow',
  proposal: 'description',
  booking: 'calendar_month',
  survey: 'poll',
  project: 'folder',
};

const ARTIFACT_LABELS: Record<string, string> = {
  website: 'Website',
  email_campaign: 'Email Campaign',
  pitch_deck: 'Pitch Deck',
  proposal: 'Proposal',
  booking: 'Booking',
  survey: 'Survey',
  project: 'Project',
};

type PanelTab = 'details' | 'artifacts' | 'comments';

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
  ownerId: number | null;
  ownerName: string | null;
  recurringValue: number | null;
  billingCycle: string | null;
  createdAt: string;
}

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  companyId: number | null;
}

interface Company {
  id: number;
  name: string;
}

const inputClass = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50';

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

function formatDateForInput(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toISOString().split('T')[0];
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

  // Deal detail panel state
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    value: '',
    contactId: '',
    companyId: '',
    pipelineId: '',
    stageId: '',
    priority: 'medium',
    status: 'open',
    expectedCloseDate: '',
    notes: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Drag and drop state
  const [dragDealId, setDragDealId] = useState<number | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<number | null>(null);

  // Panel tab state
  const [panelTab, setPanelTab] = useState<PanelTab>('details');

  // Artifacts state
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [availableArtifacts, setAvailableArtifacts] = useState<AvailableArtifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [showArtifactPicker, setShowArtifactPicker] = useState(false);
  const [artifactTypeFilter, setArtifactTypeFilter] = useState('');

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [postingComment, setPostingComment] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline company creation
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [showNewCompany, setShowNewCompany] = useState<'form' | 'edit' | null>(null);

  async function createCompany(target: 'form' | 'edit') {
    if (!newCompanyName.trim()) return;
    setCreatingCompany(true);
    const res = await fetch('/api/portal/crm/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCompanyName.trim() }),
    });
    const d = await res.json();
    setCreatingCompany(false);
    if (!d.success) return;
    const created = d.data as Company;
    setCompanies(prev => [created, ...prev]);
    if (target === 'form') {
      setForm(f => ({ ...f, companyId: String(created.id), contactId: '' }));
    } else {
      setEditForm(f => ({ ...f, companyId: String(created.id), contactId: '' }));
    }
    setNewCompanyName('');
    setShowNewCompany(null);
  }

  // Inline contact creation
  const [newContactFirst, setNewContactFirst] = useState('');
  const [newContactLast, setNewContactLast] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [creatingContact, setCreatingContact] = useState(false);
  const [showNewContact, setShowNewContact] = useState<'form' | 'edit' | null>(null);

  function resetNewContact() {
    setNewContactFirst('');
    setNewContactLast('');
    setNewContactEmail('');
    setShowNewContact(null);
  }

  async function createContact(target: 'form' | 'edit') {
    if (!newContactFirst.trim()) return;
    setCreatingContact(true);
    const companyId = target === 'form' ? form.companyId : editForm.companyId;
    const res = await fetch('/api/portal/crm/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: newContactFirst.trim(),
        lastName: newContactLast.trim() || null,
        email: newContactEmail.trim() || null,
        companyId: companyId ? Number(companyId) : null,
      }),
    });
    const d = await res.json();
    setCreatingContact(false);
    if (!d.success) return;
    const created: Contact = {
      id: d.data.id,
      firstName: d.data.firstName,
      lastName: d.data.lastName ?? '',
      companyId: d.data.companyId ?? null,
    };
    setContacts(prev => [created, ...prev]);
    if (target === 'form') {
      setForm(f => ({ ...f, contactId: String(created.id) }));
    } else {
      setEditForm(f => ({ ...f, contactId: String(created.id) }));
    }
    resetNewContact();
  }

  // Filter contacts by the selected company
  function getFilteredContacts(companyId: string): Contact[] {
    if (!companyId) return contacts;
    const cid = Number(companyId);
    const filtered = contacts.filter(c => c.companyId === cid);
    return filtered.length > 0 ? filtered : contacts;
  }

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

  function openDeal(deal: Deal) {
    setEditingDeal(deal);
    setEditForm({
      title: deal.title,
      value: String(deal.value / 100),
      contactId: deal.contactId ? String(deal.contactId) : '',
      companyId: deal.companyId ? String(deal.companyId) : '',
      pipelineId: String(deal.pipelineId),
      stageId: String(deal.stageId),
      priority: deal.priority,
      status: deal.status,
      expectedCloseDate: formatDateForInput(deal.expectedCloseDate),
      notes: deal.notes ?? '',
    });
    setEditError('');
    setPanelTab('details');
    setArtifacts([]);
    setComments([]);
    fetchArtifacts(deal.id);
    fetchComments(deal.id);
    fetchAvailableArtifacts(deal.id);
    fetchMentionUsers();
  }

  async function saveDeal(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDeal) return;
    setEditSaving(true);
    setEditError('');

    const body = {
      title: editForm.title,
      value: Math.round(parseFloat(editForm.value || '0') * 100),
      contactId: editForm.contactId ? Number(editForm.contactId) : null,
      companyId: editForm.companyId ? Number(editForm.companyId) : null,
      pipelineId: Number(editForm.pipelineId),
      stageId: Number(editForm.stageId),
      priority: editForm.priority,
      status: editForm.status,
      expectedCloseDate: editForm.expectedCloseDate || null,
      notes: editForm.notes || null,
    };

    const res = await fetch(`/api/portal/crm/deals/${editingDeal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setEditSaving(false);

    if (!d.success) {
      setEditError(d.message ?? 'Failed to save deal.');
      return;
    }
    setEditingDeal(null);
    fetchDeals();
  }

  async function deleteDeal() {
    if (!editingDeal) return;
    if (!confirm('Delete this deal? This cannot be undone.')) return;
    setDeleting(true);
    await fetch(`/api/portal/crm/deals/${editingDeal.id}`, { method: 'DELETE' });
    setDeleting(false);
    setEditingDeal(null);
    fetchDeals();
  }

  // --- Artifacts ---
  async function fetchArtifacts(dealId: number) {
    setArtifactsLoading(true);
    const res = await fetch(`/api/portal/crm/deals/${dealId}/artifacts`);
    const d = await res.json();
    setArtifacts(d.data ?? []);
    setArtifactsLoading(false);
  }

  async function fetchAvailableArtifacts(dealId: number) {
    const res = await fetch(`/api/portal/crm/deals/${dealId}/artifacts/available`);
    const d = await res.json();
    setAvailableArtifacts(d.data ?? []);
  }

  async function addArtifact(type: string, artifactId: number) {
    if (!editingDeal) return;
    await fetch(`/api/portal/crm/deals/${editingDeal.id}/artifacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactType: type, artifactId }),
    });
    fetchArtifacts(editingDeal.id);
    setShowArtifactPicker(false);
  }

  async function togglePin(artifactDbId: number, pinned: boolean) {
    if (!editingDeal) return;
    await fetch(`/api/portal/crm/deals/${editingDeal.id}/artifacts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactDbId, pinned }),
    });
    setArtifacts(prev => prev.map(a => a.id === artifactDbId ? { ...a, pinned } : a));
  }

  async function removeArtifact(artifactDbId: number) {
    if (!editingDeal) return;
    await fetch(`/api/portal/crm/deals/${editingDeal.id}/artifacts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactDbId }),
    });
    setArtifacts(prev => prev.filter(a => a.id !== artifactDbId));
  }

  // --- Comments ---
  async function fetchComments(dealId: number) {
    setCommentsLoading(true);
    const res = await fetch(`/api/portal/crm/deals/${dealId}/comments`);
    const d = await res.json();
    setComments(d.data ?? []);
    setCommentsLoading(false);
  }

  async function fetchMentionUsers() {
    const res = await fetch('/api/portal/crm/mentions');
    const d = await res.json();
    setMentionUsers(d.data ?? []);
  }

  async function postComment() {
    if (!editingDeal || (!commentBody.trim() && commentFiles.length === 0)) return;
    setPostingComment(true);

    if (commentFiles.length > 0) {
      const formData = new FormData();
      formData.append('body', commentBody);
      commentFiles.forEach(f => formData.append('files', f));
      await fetch(`/api/portal/crm/deals/${editingDeal.id}/comments`, { method: 'POST', body: formData });
    } else {
      await fetch(`/api/portal/crm/deals/${editingDeal.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody }),
      });
    }

    setCommentBody('');
    setCommentFiles([]);
    setPostingComment(false);
    fetchComments(editingDeal.id);
  }

  async function deleteComment(commentId: number) {
    if (!editingDeal) return;
    await fetch(`/api/portal/crm/deals/${editingDeal.id}/comments`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentId }),
    });
    setComments(prev => prev.filter(c => c.id !== commentId));
  }

  function handleCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      postComment();
      return;
    }
    // Mention trigger
    const textarea = e.currentTarget;
    const val = textarea.value;
    const cursor = textarea.selectionStart;
    if (e.key === '@' || (showMentions && val[cursor - 1] === '@')) {
      // will handle in onChange
    }
    if (showMentions && e.key === 'Escape') {
      setShowMentions(false);
    }
  }

  function handleCommentChange(value: string) {
    setCommentBody(value);
    const textarea = commentInputRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const textBefore = value.slice(0, cursor);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionQuery(atMatch[1].toLowerCase());
    } else {
      setShowMentions(false);
    }
  }

  function insertMention(user: MentionUser) {
    const textarea = commentInputRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const textBefore = commentBody.slice(0, cursor);
    const textAfter = commentBody.slice(cursor);
    const atIndex = textBefore.lastIndexOf('@');
    const mention = `@[${user.name}](${user.id}) `;
    const newValue = textBefore.slice(0, atIndex) + mention + textAfter;
    setCommentBody(newValue);
    setShowMentions(false);
    setTimeout(() => {
      textarea.focus();
      const pos = atIndex + mention.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  }

  function renderCommentBody(body: string): string {
    return body.replace(/@\[([^\]]+)\]\(\d+\)/g, '<strong class="text-primary">@$1</strong>');
  }

  // Compute available stages for the form based on selected pipeline
  const formPipelineId = form.pipelineId ? Number(form.pipelineId) : selectedPipelineId;
  const formStages = pipelines.find(p => p.id === formPipelineId)?.stages?.sort((a, b) => a.order - b.order) ?? [];

  // Stages for the edit panel
  const editPipelineId = editForm.pipelineId ? Number(editForm.pipelineId) : selectedPipelineId;
  const editStages = pipelines.find(p => p.id === editPipelineId)?.stages?.sort((a, b) => a.order - b.order) ?? [];

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
              <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Value ($) *</label>
              <input required type="number" step="0.01" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0.00" className={inputClass} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">Company</label>
                <button type="button" onClick={() => setShowNewCompany(showNewCompany === 'form' ? null : 'form')} className="text-xs text-primary hover:underline">
                  {showNewCompany === 'form' ? 'Cancel' : '+ New'}
                </button>
              </div>
              {showNewCompany === 'form' ? (
                <div className="flex gap-1">
                  <input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} placeholder="Company name" className={inputClass} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createCompany('form'); } }} />
                  <button type="button" onClick={() => createCompany('form')} disabled={creatingCompany} className="px-2 py-2 bg-primary text-primary-foreground rounded-lg text-sm shrink-0 hover:bg-primary/90 disabled:opacity-50">
                    <span className="material-icons text-base">{creatingCompany ? 'refresh' : 'check'}</span>
                  </button>
                </div>
              ) : (
                <select value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value, contactId: '' }))} className={inputClass}>
                  <option value="">None</option>
                  {companies.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">Contact{form.companyId && <span className="text-primary ml-1">(filtered)</span>}</label>
                <button type="button" onClick={() => { if (showNewContact === 'form') { resetNewContact(); } else { setShowNewContact('form'); } }} className="text-xs text-primary hover:underline">
                  {showNewContact === 'form' ? 'Cancel' : '+ New'}
                </button>
              </div>
              {showNewContact === 'form' ? (
                <div className="space-y-1.5">
                  <div className="flex gap-1">
                    <input value={newContactFirst} onChange={e => setNewContactFirst(e.target.value)} placeholder="First name *" className={inputClass} />
                    <input value={newContactLast} onChange={e => setNewContactLast(e.target.value)} placeholder="Last name" className={inputClass} />
                  </div>
                  <div className="flex gap-1">
                    <input value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} placeholder="Email" type="email" className={inputClass} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createContact('form'); } }} />
                    <button type="button" onClick={() => createContact('form')} disabled={creatingContact || !newContactFirst.trim()} className="px-2 py-2 bg-primary text-primary-foreground rounded-lg text-sm shrink-0 hover:bg-primary/90 disabled:opacity-50">
                      <span className="material-icons text-base">{creatingContact ? 'refresh' : 'check'}</span>
                    </button>
                  </div>
                  {form.companyId && <p className="text-[10px] text-muted-foreground">Will be assigned to {companies.find(c => c.id === Number(form.companyId))?.name}</p>}
                </div>
              ) : (
                <select value={form.contactId} onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))} className={inputClass}>
                  <option value="">None</option>
                  {getFilteredContacts(form.companyId).map(c => (<option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Pipeline</label>
              <select value={form.pipelineId} onChange={e => { const pid = Number(e.target.value); const pStages = pipelines.find(p => p.id === pid)?.stages?.sort((a, b) => a.order - b.order) ?? []; setForm(f => ({ ...f, pipelineId: e.target.value, stageId: String(pStages[0]?.id ?? '') })); }} className={inputClass}>
                {pipelines.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Stage</label>
              <select value={form.stageId} onChange={e => setForm(f => ({ ...f, stageId: e.target.value }))} className={inputClass}>
                {formStages.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={inputClass}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Expected Close Date</label>
              <input type="date" value={form.expectedCloseDate} onChange={e => setForm(f => ({ ...f, expectedCloseDate: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={1} className={inputClass + ' resize-none'} />
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
            const isOver = dragOverStageId === stage.id;
            return (
              <div
                key={stage.id}
                className="flex-shrink-0 w-72"
                onDragOver={e => { e.preventDefault(); setDragOverStageId(stage.id); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStageId(null); }}
                onDrop={e => {
                  e.preventDefault();
                  setDragOverStageId(null);
                  if (dragDealId && dragDealId !== null) {
                    const deal = deals.find(d => d.id === dragDealId);
                    if (deal && deal.stageId !== stage.id) {
                      moveDeal(dragDealId, stage.id);
                    }
                  }
                  setDragDealId(null);
                }}
              >
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
                <div className={`space-y-2 min-h-[200px] border-x border-b border-border rounded-b-xl p-2 transition-colors ${isOver ? 'bg-primary/10 border-primary/30' : 'bg-muted/30'}`}>
                  {stageDeals.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      {isOver ? 'Drop here' : 'No deals'}
                    </p>
                  )}
                  {stageDeals.map(deal => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={e => { setDragDealId(deal.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { setDragDealId(null); setDragOverStageId(null); }}
                      onClick={() => openDeal(deal)}
                      className={`bg-card border border-border rounded-lg p-3 space-y-2 hover:border-primary/40 transition-colors cursor-grab active:cursor-grabbing ${dragDealId === deal.id ? 'opacity-40' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="material-icons text-xs text-muted-foreground/50">drag_indicator</span>
                          <h5 className="text-sm font-medium text-foreground leading-tight">{deal.title}</h5>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${priorityColor[deal.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                          {deal.priority}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-foreground">{formatCurrency(deal.value)}</p>
                        {deal.recurringValue != null && deal.recurringValue > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">
                            {formatCurrency(deal.recurringValue)}/{deal.billingCycle === 'annual' ? 'yr' : deal.billingCycle === 'quarterly' ? 'qtr' : 'mo'}
                          </span>
                        )}
                      </div>
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
                      {deal.ownerName && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="material-icons text-xs">account_circle</span>
                          {deal.ownerName}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Deal edit slide-over panel */}
      {editingDeal && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 transition-opacity" onClick={() => setEditingDeal(null)} />
          <div className="relative w-full max-w-lg bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="bg-card border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold text-foreground truncate">{editingDeal.title}</h2>
              <div className="flex items-center gap-2">
                <button onClick={deleteDeal} disabled={deleting} className="flex items-center gap-1 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50">
                  <span className="material-icons text-base">delete</span>
                </button>
                <button onClick={() => setEditingDeal(null)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                  <span className="material-icons text-xl text-muted-foreground">close</span>
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border shrink-0">
              {([['details', 'edit', 'Details'], ['artifacts', 'attach_file', 'Artifacts'], ['comments', 'chat', 'Comments']] as const).map(([tab, icon, label]) => (
                <button
                  key={tab}
                  onClick={() => setPanelTab(tab as PanelTab)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                    panelTab === tab ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="material-icons text-base">{icon}</span>
                  {label}
                  {tab === 'artifacts' && artifacts.length > 0 && (
                    <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded-full">{artifacts.length}</span>
                  )}
                  {tab === 'comments' && comments.length > 0 && (
                    <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded-full">{comments.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">

              {/* === DETAILS TAB === */}
              {panelTab === 'details' && (
                <form onSubmit={saveDeal} className="p-6 space-y-5">
                  {editError && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                      <span className="material-icons text-base">error</span>
                      {editError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
                    <input required value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className={inputClass} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Value ($)</label>
                      <input type="number" step="0.01" min="0" value={editForm.value} onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
                      <select value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))} className={inputClass}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
                      <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className={inputClass}>
                        <option value="open">Open</option>
                        <option value="won">Won</option>
                        <option value="lost">Lost</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Expected Close</label>
                      <input type="date" value={editForm.expectedCloseDate} onChange={e => setEditForm(f => ({ ...f, expectedCloseDate: e.target.value }))} className={inputClass} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-muted-foreground">Company</label>
                      <button type="button" onClick={() => setShowNewCompany(showNewCompany === 'edit' ? null : 'edit')} className="text-xs text-primary hover:underline">
                        {showNewCompany === 'edit' ? 'Cancel' : '+ New Company'}
                      </button>
                    </div>
                    {showNewCompany === 'edit' ? (
                      <div className="flex gap-1">
                        <input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} placeholder="Company name" className={inputClass} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createCompany('edit'); } }} />
                        <button type="button" onClick={() => createCompany('edit')} disabled={creatingCompany} className="px-2 py-2 bg-primary text-primary-foreground rounded-lg text-sm shrink-0 hover:bg-primary/90 disabled:opacity-50">
                          <span className="material-icons text-base">{creatingCompany ? 'refresh' : 'check'}</span>
                        </button>
                      </div>
                    ) : (
                      <select value={editForm.companyId} onChange={e => setEditForm(f => ({ ...f, companyId: e.target.value, contactId: '' }))} className={inputClass}>
                        <option value="">None</option>
                        {companies.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                      </select>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Contact{editForm.companyId && <span className="text-primary ml-1">(filtered)</span>}
                      </label>
                      <button type="button" onClick={() => { if (showNewContact === 'edit') { resetNewContact(); } else { setShowNewContact('edit'); } }} className="text-xs text-primary hover:underline">
                        {showNewContact === 'edit' ? 'Cancel' : '+ New Contact'}
                      </button>
                    </div>
                    {showNewContact === 'edit' ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-1">
                          <input value={newContactFirst} onChange={e => setNewContactFirst(e.target.value)} placeholder="First name *" className={inputClass} />
                          <input value={newContactLast} onChange={e => setNewContactLast(e.target.value)} placeholder="Last name" className={inputClass} />
                        </div>
                        <div className="flex gap-1">
                          <input value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} placeholder="Email" type="email" className={inputClass} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createContact('edit'); } }} />
                          <button type="button" onClick={() => createContact('edit')} disabled={creatingContact || !newContactFirst.trim()} className="px-2 py-2 bg-primary text-primary-foreground rounded-lg text-sm shrink-0 hover:bg-primary/90 disabled:opacity-50">
                            <span className="material-icons text-base">{creatingContact ? 'refresh' : 'check'}</span>
                          </button>
                        </div>
                        {editForm.companyId && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <span className="material-icons text-[10px]">link</span>
                            Will be assigned to {companies.find(c => c.id === Number(editForm.companyId))?.name}
                          </p>
                        )}
                      </div>
                    ) : (
                      <select value={editForm.contactId} onChange={e => setEditForm(f => ({ ...f, contactId: e.target.value }))} className={inputClass}>
                        <option value="">None</option>
                        {getFilteredContacts(editForm.companyId).map(c => (<option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>))}
                      </select>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Pipeline</label>
                      <select value={editForm.pipelineId} onChange={e => { const pid = Number(e.target.value); const pStages = pipelines.find(p => p.id === pid)?.stages?.sort((a, b) => a.order - b.order) ?? []; setEditForm(f => ({ ...f, pipelineId: e.target.value, stageId: String(pStages[0]?.id ?? '') })); }} className={inputClass}>
                        {pipelines.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Stage</label>
                      <select value={editForm.stageId} onChange={e => setEditForm(f => ({ ...f, stageId: e.target.value }))} className={inputClass}>
                        {editStages.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                    <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={4} className={inputClass + ' resize-none'} />
                  </div>

                  {/* Pinned Artifacts Preview */}
                  {artifacts.filter(a => a.pinned).length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <span className="material-icons text-xs">push_pin</span> Pinned Artifacts
                      </p>
                      <div className="space-y-1">
                        {artifacts.filter(a => a.pinned).map(a => (
                          <div key={a.id} className="flex items-center gap-2 text-xs text-foreground bg-accent/50 rounded-lg px-2 py-1.5">
                            <span className="material-icons text-sm text-muted-foreground">{ARTIFACT_ICONS[a.artifactType] || 'attachment'}</span>
                            <span className="truncate">{a.displayTitle}</span>
                            <span className="text-muted-foreground ml-auto shrink-0">{ARTIFACT_LABELS[a.artifactType]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">Created {new Date(editingDeal.createdAt).toLocaleDateString()}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditingDeal(null)} className="px-4 py-2 text-sm font-medium text-foreground bg-accent rounded-lg hover:bg-accent/80 transition-colors">Cancel</button>
                      <button type="submit" disabled={editSaving} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                        {editSaving && <span className="material-icons animate-spin text-sm">refresh</span>}
                        Save Changes
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* === ARTIFACTS TAB === */}
              {panelTab === 'artifacts' && (
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Linked Artifacts</p>
                    <button onClick={() => setShowArtifactPicker(p => !p)} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors">
                      <span className="material-icons text-sm">{showArtifactPicker ? 'close' : 'add'}</span>
                      {showArtifactPicker ? 'Cancel' : 'Link Artifact'}
                    </button>
                  </div>

                  {/* Artifact Picker */}
                  {showArtifactPicker && (
                    <div className="bg-accent/30 border border-border rounded-lg p-4 space-y-3">
                      <div className="flex gap-1 flex-wrap">
                        <button onClick={() => setArtifactTypeFilter('')} className={`px-2 py-1 rounded text-xs font-medium transition-colors ${!artifactTypeFilter ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/80'}`}>All</button>
                        {Object.entries(ARTIFACT_LABELS).map(([type, label]) => (
                          <button key={type} onClick={() => setArtifactTypeFilter(type)} className={`px-2 py-1 rounded text-xs font-medium transition-colors ${artifactTypeFilter === type ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/80'}`}>{label}</button>
                        ))}
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {availableArtifacts
                          .filter(a => !artifactTypeFilter || a.type === artifactTypeFilter)
                          .filter(a => !artifacts.some(linked => linked.artifactType === a.type && linked.artifactId === a.id))
                          .map(a => (
                            <button
                              key={`${a.type}-${a.id}`}
                              onClick={() => addArtifact(a.type, a.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg hover:bg-accent transition-colors"
                            >
                              <span className="material-icons text-sm text-muted-foreground">{ARTIFACT_ICONS[a.type] || 'attachment'}</span>
                              <span className="text-sm text-foreground truncate">{a.title}</span>
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{ARTIFACT_LABELS[a.type]}</span>
                            </button>
                          ))}
                        {availableArtifacts.filter(a => !artifactTypeFilter || a.type === artifactTypeFilter).filter(a => !artifacts.some(linked => linked.artifactType === a.type && linked.artifactId === a.id)).length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-4">No available artifacts{artifactTypeFilter ? ` of type "${ARTIFACT_LABELS[artifactTypeFilter]}"` : ''}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Artifact List */}
                  {artifactsLoading ? (
                    <div className="flex justify-center py-8">
                      <span className="material-icons animate-spin text-primary">refresh</span>
                    </div>
                  ) : artifacts.length === 0 ? (
                    <div className="text-center py-12">
                      <span className="material-icons text-3xl text-muted-foreground/50 block mb-2">attach_file</span>
                      <p className="text-sm text-muted-foreground">No artifacts linked yet</p>
                      <p className="text-xs text-muted-foreground">Link websites, campaigns, proposals, and more</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {artifacts.map(a => (
                        <div key={a.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${a.pinned ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}>
                          <span className="material-icons text-lg text-muted-foreground">{ARTIFACT_ICONS[a.artifactType] || 'attachment'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{a.displayTitle}</p>
                            <p className="text-[10px] text-muted-foreground">{ARTIFACT_LABELS[a.artifactType]}</p>
                          </div>
                          <button onClick={() => togglePin(a.id, !a.pinned)} className={`p-1 rounded transition-colors ${a.pinned ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:bg-accent'}`} title={a.pinned ? 'Unpin' : 'Pin'}>
                            <span className="material-icons text-sm">{a.pinned ? 'push_pin' : 'push_pin'}</span>
                          </button>
                          <button onClick={() => removeArtifact(a.id)} className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Remove">
                            <span className="material-icons text-sm">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* === COMMENTS TAB === */}
              {panelTab === 'comments' && (
                <div className="flex flex-col h-full">
                  {/* Comment Input */}
                  <div className="p-4 border-b border-border space-y-2">
                    <div className="relative">
                      <textarea
                        ref={commentInputRef}
                        value={commentBody}
                        onChange={e => handleCommentChange(e.target.value)}
                        onKeyDown={handleCommentKeyDown}
                        placeholder="Add a comment... (@ to mention, Cmd+Enter to send)"
                        rows={3}
                        className={inputClass + ' resize-none'}
                      />
                      {/* Mention dropdown */}
                      {showMentions && (
                        <div className="absolute left-0 bottom-full mb-1 w-56 bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto z-20">
                          {mentionUsers
                            .filter(u => u.name?.toLowerCase().includes(mentionQuery))
                            .map(u => (
                              <button
                                key={u.id}
                                onClick={() => insertMention(u)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                              >
                                <span className="material-icons text-sm text-muted-foreground">person</span>
                                {u.name}
                              </button>
                            ))}
                          {mentionUsers.filter(u => u.name?.toLowerCase().includes(mentionQuery)).length === 0 && (
                            <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) setCommentFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} />
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <span className="material-icons text-sm">attach_file</span>
                          Attach
                        </button>
                        {commentFiles.length > 0 && (
                          <span className="text-xs text-muted-foreground">{commentFiles.length} file{commentFiles.length > 1 ? 's' : ''}</span>
                        )}
                      </div>
                      <button
                        onClick={postComment}
                        disabled={postingComment || (!commentBody.trim() && commentFiles.length === 0)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {postingComment ? <span className="material-icons animate-spin text-sm">refresh</span> : <span className="material-icons text-sm">send</span>}
                        Send
                      </button>
                    </div>
                    {/* File preview */}
                    {commentFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {commentFiles.map((f, i) => (
                          <span key={i} className="flex items-center gap-1 bg-accent text-xs px-2 py-1 rounded">
                            <span className="material-icons text-xs">description</span>
                            <span className="truncate max-w-[120px]">{f.name}</span>
                            <button onClick={() => setCommentFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                              <span className="material-icons text-xs">close</span>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Comments List */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {commentsLoading ? (
                      <div className="flex justify-center py-8">
                        <span className="material-icons animate-spin text-primary">refresh</span>
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="text-center py-12">
                        <span className="material-icons text-3xl text-muted-foreground/50 block mb-2">chat_bubble_outline</span>
                        <p className="text-sm text-muted-foreground">No comments yet</p>
                      </div>
                    ) : (
                      comments.map(c => (
                        <div key={c.id} className="group">
                          <div className="flex items-start gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="material-icons text-sm text-primary">person</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">{c.authorName || 'Unknown'}</span>
                                <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
                                <button onClick={() => deleteComment(c.id)} className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-all" title="Delete">
                                  <span className="material-icons text-xs">delete</span>
                                </button>
                              </div>
                              <div className="text-sm text-foreground mt-0.5 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderCommentBody(c.body) }} />
                              {/* Attachments */}
                              {c.attachments && c.attachments.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {c.attachments.map((att, i) => (
                                    <a
                                      key={i}
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1.5 bg-accent text-xs text-foreground px-2.5 py-1.5 rounded-lg hover:bg-accent/80 transition-colors"
                                    >
                                      <span className="material-icons text-sm text-muted-foreground">
                                        {att.mimeType?.startsWith('image/') ? 'image' : 'description'}
                                      </span>
                                      <span className="truncate max-w-[140px]">{att.filename}</span>
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
