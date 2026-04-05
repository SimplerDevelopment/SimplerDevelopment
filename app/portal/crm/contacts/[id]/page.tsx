'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  companyId: number | null;
  companyName: string | null;
  status: string;
  source: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  score: number;
  ownerId: number | null;
  lastContactedAt: string | null;
  createdAt: string;
}

interface Activity {
  id: number;
  type: string;
  title: string;
  description: string | null;
  createdAt: string;
}

interface Deal {
  id: number;
  title: string;
  value: number;
  stageName: string;
  status: string;
}

interface Company {
  id: number;
  name: string;
}

const activityTypes = [
  { value: 'call', label: 'Call', icon: 'phone' },
  { value: 'email', label: 'Email', icon: 'mail' },
  { value: 'meeting', label: 'Meeting', icon: 'groups' },
  { value: 'note', label: 'Note', icon: 'sticky_note_2' },
  { value: 'task', label: 'Task', icon: 'task_alt' },
];

const activityIcons: Record<string, string> = {
  call: 'phone',
  email: 'mail',
  meeting: 'groups',
  note: 'sticky_note_2',
  task: 'task_alt',
  deal_created: 'add_circle',
  deal_won: 'emoji_events',
  deal_lost: 'cancel',
  contact_created: 'person_add',
  stage_change: 'swap_horiz',
};

const statusColor: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  lead: 'bg-blue-100 text-blue-700',
  customer: 'bg-purple-100 text-purple-700',
};

const dealStatusColor: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function CrmContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    title: '',
    companyId: '',
    status: '',
    source: '',
    address: '',
  });

  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  const [newTag, setNewTag] = useState('');

  const [activityForm, setActivityForm] = useState({ type: 'call', title: '', description: '' });
  const [activitySaving, setActivitySaving] = useState(false);

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailForm, setEmailForm] = useState({ subject: '', body: '' });
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  const fetchContact = useCallback(async () => {
    const res = await fetch(`/api/portal/crm/contacts/${contactId}`);
    const d = await res.json();
    if (d.success && d.data) {
      setContact(d.data.contact ?? d.data);
      setDeals(d.data.deals ?? []);
      setNotes(d.data.contact?.notes ?? d.data.notes ?? '');
    }
  }, [contactId]);

  const fetchActivities = useCallback(async () => {
    const res = await fetch(`/api/portal/crm/activities?contactId=${contactId}`);
    const d = await res.json();
    setActivities(Array.isArray(d.data) ? d.data : []);
  }, [contactId]);

  useEffect(() => {
    Promise.all([
      fetchContact(),
      fetchActivities(),
      fetch('/api/portal/crm/companies').then(r => r.json()).then(d => setCompanies(d.data?.companies ?? d.data ?? [])),
    ]).then(() => setLoading(false));
  }, [fetchContact, fetchActivities]);

  function startEditing() {
    if (!contact) return;
    setEditForm({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      title: contact.title ?? '',
      companyId: contact.companyId ? String(contact.companyId) : '',
      status: contact.status,
      source: contact.source ?? '',
      address: contact.address ?? '',
    });
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      ...editForm,
      companyId: editForm.companyId ? Number(editForm.companyId) : null,
    };
    const res = await fetch(`/api/portal/crm/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) {
      await fetchContact();
      setEditing(false);
    }
  }

  async function deleteContact() {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    await fetch(`/api/portal/crm/contacts/${contactId}`, { method: 'DELETE' });
    router.push('/portal/crm/contacts');
  }

  async function saveNotes() {
    setNotesSaving(true);
    await fetch(`/api/portal/crm/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    setNotesSaving(false);
  }

  async function addTag() {
    if (!newTag.trim() || !contact) return;
    const tags = [...(contact.tags ?? []), newTag.trim()];
    await fetch(`/api/portal/crm/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
    setContact(prev => prev ? { ...prev, tags } : prev);
    setNewTag('');
  }

  async function removeTag(tag: string) {
    if (!contact) return;
    const tags = (contact.tags ?? []).filter(t => t !== tag);
    await fetch(`/api/portal/crm/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
    setContact(prev => prev ? { ...prev, tags } : prev);
  }

  async function logActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!activityForm.title.trim()) return;
    setActivitySaving(true);
    const res = await fetch('/api/portal/crm/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...activityForm, contactId: Number(contactId) }),
    });
    const d = await res.json();
    setActivitySaving(false);
    if (d.success) {
      setActivityForm({ type: 'call', title: '', description: '' });
      fetchActivities();
    }
  }

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailForm.subject.trim() || !emailForm.body.trim()) return;
    setEmailSending(true);
    setEmailError('');
    setEmailSuccess('');
    const res = await fetch(`/api/portal/crm/contacts/${contactId}/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailForm),
    });
    const d = await res.json();
    setEmailSending(false);
    if (d.success) {
      setEmailSuccess('Email sent successfully.');
      setEmailForm({ subject: '', body: '' });
      setShowEmailForm(false);
      fetchActivities();
      setTimeout(() => setEmailSuccess(''), 3000);
    } else {
      setEmailError(d.message ?? 'Failed to send email.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="text-center py-20">
        <span className="material-icons text-4xl text-muted-foreground">person_off</span>
        <p className="mt-2 text-muted-foreground">Contact not found.</p>
        <Link href="/portal/crm/contacts" className="text-primary text-sm hover:underline mt-2 inline-block">
          Back to contacts
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/portal/crm/contacts" className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-base">arrow_back</span>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-foreground">{contact.firstName} {contact.lastName}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[contact.status] ?? 'bg-gray-100 text-gray-700'}`}>
                {contact.status}
              </span>
              {contact.score > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                  contact.score >= 80 ? 'bg-green-100 text-green-700' :
                  contact.score >= 50 ? 'bg-blue-100 text-blue-700' :
                  contact.score >= 20 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  <span className="material-icons text-xs">star</span>
                  {contact.score}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
              {contact.title && <span>{contact.title}</span>}
              {contact.title && contact.companyName && <span>at</span>}
              {contact.companyName && (
                <Link href={`/portal/crm/companies/${contact.companyId}`} className="text-primary hover:underline">
                  {contact.companyName}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {!editing && contact.email && (
            <button
              onClick={() => setShowEmailForm(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span className="material-icons text-base">mail</span>
              Send Email
            </button>
          )}
          {!editing && (
            <button
              onClick={startEditing}
              className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <span className="material-icons text-base">edit</span>
              Edit
            </button>
          )}
          <button
            onClick={deleteContact}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <span className="material-icons text-base">delete</span>
            Delete
          </button>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <form onSubmit={saveEdit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-foreground">Edit Contact</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">First Name</label>
              <input
                required
                value={editForm.firstName}
                onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Last Name</label>
              <input
                required
                value={editForm.lastName}
                onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
              <input
                type="email"
                value={editForm.email}
                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
              <input
                value={editForm.phone}
                onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
              <input
                value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Company</label>
              <select
                value={editForm.companyId}
                onChange={e => setEditForm(f => ({ ...f, companyId: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">None</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
              <select
                value={editForm.status}
                onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="lead">Lead</option>
                <option value="active">Active</option>
                <option value="customer">Customer</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Source</label>
              <select
                value={editForm.source}
                onChange={e => setEditForm(f => ({ ...f, source: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">None</option>
                {['web', 'referral', 'cold-call', 'event', 'social', 'other'].map(s => (
                  <option key={s} value={s}>{s.replace('-', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
              <input
                value={editForm.address}
                onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving && <span className="material-icons animate-spin text-sm">refresh</span>}
              Save Changes
            </button>
          </div>
        </form>
      )}

      {/* Email Success Banner */}
      {emailSuccess && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-100 border border-green-200 rounded-lg px-3 py-2">
          <span className="material-icons text-base">check_circle</span>
          {emailSuccess}
        </div>
      )}

      {/* Send Email Form */}
      {showEmailForm && (
        <form onSubmit={sendEmail} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Send Email to {contact.email}</h3>
            <button type="button" onClick={() => setShowEmailForm(false)} className="text-muted-foreground hover:text-foreground">
              <span className="material-icons text-base">close</span>
            </button>
          </div>
          {emailError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <span className="material-icons text-base">error</span>
              {emailError}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Subject</label>
            <input
              required
              value={emailForm.subject}
              onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Body</label>
            <textarea
              required
              value={emailForm.body}
              onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))}
              rows={6}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEmailForm(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={emailSending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {emailSending && <span className="material-icons animate-spin text-sm">refresh</span>}
              <span className="material-icons text-sm">send</span>
              Send Email
            </button>
          </div>
        </form>
      )}

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Contact Info */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Contact Information</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="material-icons text-base text-muted-foreground">mail</span>
                <span className="text-sm text-foreground">{contact.email ?? 'No email'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-base text-muted-foreground">phone</span>
                <span className="text-sm text-foreground">{contact.phone ?? 'No phone'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-base text-muted-foreground">location_on</span>
                <span className="text-sm text-foreground">{contact.address ?? 'No address'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-base text-muted-foreground">source</span>
                <span className="text-sm text-foreground capitalize">{contact.source ?? 'Unknown source'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-icons text-base text-muted-foreground">calendar_today</span>
                <span className="text-sm text-muted-foreground">Added {new Date(contact.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-3">
            <h3 className="font-semibold text-foreground">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {(contact.tags ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No tags yet.</p>
              )}
              {(contact.tags ?? []).map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent rounded-full text-xs font-medium text-foreground">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="text-muted-foreground hover:text-destructive ml-0.5">
                    <span className="material-icons text-xs">close</span>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                placeholder="Add tag..."
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                onClick={addTag}
                disabled={!newTag.trim()}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Notes</h3>
              {notesSaving && <span className="text-xs text-muted-foreground">Saving...</span>}
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={4}
              placeholder="Add notes about this contact..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
            />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Log Activity Form */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Log Activity</h3>
            <form onSubmit={logActivity} className="space-y-3">
              <div className="flex gap-2">
                {activityTypes.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setActivityForm(f => ({ ...f, type: t.value }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activityForm.type === t.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-accent text-foreground hover:bg-accent/80'
                    }`}
                  >
                    <span className="material-icons text-sm">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
              <input
                required
                value={activityForm.title}
                onChange={e => setActivityForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Activity title..."
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <textarea
                value={activityForm.description}
                onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Description (optional)..."
                rows={2}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
              <button
                type="submit"
                disabled={activitySaving || !activityForm.title.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {activitySaving && <span className="material-icons animate-spin text-sm">refresh</span>}
                Log Activity
              </button>
            </form>
          </div>

          {/* Activity Timeline */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Activity Timeline</h3>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No activities logged yet.</p>
            ) : (
              <div className="space-y-1">
                {activities.map((a, i) => (
                  <div key={a.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                        <span className="material-icons text-sm text-foreground">
                          {activityIcons[a.type] ?? 'circle'}
                        </span>
                      </div>
                      {i < activities.length - 1 && (
                        <div className="w-px flex-1 bg-border mt-1" />
                      )}
                    </div>
                    <div className="pb-4 min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{a.title}</p>
                      {a.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{relativeTime(a.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Deals */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Deals</h3>
          <Link
            href="/portal/crm/deals"
            className="text-xs text-primary hover:underline"
          >
            View pipeline
          </Link>
        </div>
        {deals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No deals associated with this contact.</p>
        ) : (
          <div className="divide-y divide-border">
            {deals.map(d => (
              <div key={d.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{d.title}</p>
                  <p className="text-xs text-muted-foreground">{d.stageName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(d.value)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dealStatusColor[d.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {d.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
