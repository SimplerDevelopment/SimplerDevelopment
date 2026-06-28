'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import CrmDuplicateWarning from '@/components/portal/CrmDuplicateWarning';
import CrmImportExport from '@/components/portal/CrmImportExport';
import CrmCustomFieldFilters from '@/components/portal/CrmCustomFieldFilters';
import PositionMultiSelect from '@/components/portal/PositionMultiSelect';
import CrmCompanyTypeaheadPicker from '@/components/portal/CrmCompanyTypeaheadPicker';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';

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
  score: number | null;
  lastContactedAt: string | null;
  createdAt: string;
}

interface SavedView {
  id: number;
  name: string;
  filters: { search?: string; status?: string; companyId?: string; title?: string };
  entityType: string;
  isDefault: boolean;
}

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'lead', label: 'Lead' },
  { value: 'customer', label: 'Customer' },
];

const sourceOptions = ['web', 'referral', 'cold-call', 'event', 'social', 'other'];

const statusColor: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  lead: 'bg-blue-100 text-blue-700',
  customer: 'bg-purple-100 text-purple-700',
};

const scoreColor = (score: number | null): string => {
  if (score === null || score === undefined) return 'bg-gray-100 text-gray-500';
  if (score >= 80) return 'bg-green-100 text-green-700';
  if (score >= 50) return 'bg-blue-100 text-blue-700';
  if (score >= 20) return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-500';
};

const LIMIT = 25;

export default function CrmContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // Selected company-filter is held as both id and display label so we can
  // show the chosen company in the picker's collapsed state without paying
  // the cost of a separate /companies/[id] lookup. Typeahead users always
  // pick from a label-bearing option so we get the name for free.
  const [companyFilter, setCompanyFilter] = useState('');
  const [companyFilterLabel, setCompanyFilterLabel] = useState<string | null>(null);
  const [formCompanyLabel, setFormCompanyLabel] = useState<string | null>(null);
  const [titleFilter, setTitleFilter] = useState<string[]>([]);
  const [availableTitles, setAvailableTitles] = useState<string[]>([]);
  const [customFilters, setCustomFilters] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);

  // Saved views
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<number | null>(null);
  const [showSaveViewForm, setShowSaveViewForm] = useState(false);
  const [viewName, setViewName] = useState('');
  const [savingView, setSavingView] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    linkedinUrl: '',
    title: '',
    companyId: '',
    source: '',
    status: 'lead',
    notes: '',
  });

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (companyFilter) params.set('companyId', companyFilter);
    if (titleFilter.length > 0) params.set('title', titleFilter.join(','));
    for (const [fid, val] of Object.entries(customFilters)) {
      if (val) params.append('cf', `${fid}:${val}`);
    }

    const res = await fetch(`/api/portal/crm/contacts?${params}`);
    const d = await res.json();
    setContacts(d.data?.contacts ?? d.data ?? []);
    setTotal(d.data?.total ?? 0);
    setLoading(false);
  }, [page, search, statusFilter, companyFilter, titleFilter, customFilters]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Saved views can preload a companyId without a label. Resolve the name
  // once via the single-company endpoint so the picker's closed state has
  // something to show; without this it would render an empty label until
  // the user opens the dropdown.
  useEffect(() => {
    if (!companyFilter || companyFilterLabel) return;
    let alive = true;
    fetch(`/api/portal/crm/companies/${companyFilter}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive) return;
        const name = d?.data?.name ?? d?.data?.company?.name ?? null;
        if (name) setCompanyFilterLabel(name);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [companyFilter, companyFilterLabel]);

  const fetchTitles = useCallback(async () => {
    const res = await fetch('/api/portal/crm/contacts/titles');
    const d = await res.json();
    if (d.success) setAvailableTitles(d.data ?? []);
  }, []);

  useEffect(() => {
    fetchTitles();
  }, [fetchTitles]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch saved views
  const fetchSavedViews = useCallback(async () => {
    const res = await fetch('/api/portal/crm/saved-views?entityType=contact');
    const d = await res.json();
    if (d.success) setSavedViews(d.data ?? []);
  }, []);

  useEffect(() => {
    fetchSavedViews();
  }, [fetchSavedViews]);

  function applyView(view: SavedView | null) {
    if (!view) {
      setSelectedViewId(null);
      setSearchInput('');
      setSearch('');
      setStatusFilter('');
      setCompanyFilter('');
      setCompanyFilterLabel(null);
      setTitleFilter([]);
      setPage(1);
      return;
    }
    setSelectedViewId(view.id);
    setSearchInput(view.filters.search ?? '');
    setSearch(view.filters.search ?? '');
    setStatusFilter(view.filters.status ?? '');
    setCompanyFilter(view.filters.companyId ?? '');
    setCompanyFilterLabel(null); // hydrated by effect above
    setTitleFilter(
      view.filters.title
        ? view.filters.title.split(',').map((t) => t.trim()).filter(Boolean)
        : []
    );
    setPage(1);
  }

  async function handleSaveView(e: React.FormEvent) {
    e.preventDefault();
    if (!viewName.trim()) return;
    setSavingView(true);
    const filters: Record<string, string> = {};
    if (search) filters.search = search;
    if (statusFilter) filters.status = statusFilter;
    if (companyFilter) filters.companyId = companyFilter;
    if (titleFilter.length > 0) filters.title = titleFilter.join(',');
    await fetch('/api/portal/crm/saved-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: viewName.trim(), filters, entityType: 'contact' }),
    });
    setSavingView(false);
    setViewName('');
    setShowSaveViewForm(false);
    fetchSavedViews();
  }

  async function handleDeleteView(id: number) {
    await fetch(`/api/portal/crm/saved-views/${id}`, { method: 'DELETE' });
    if (selectedViewId === id) applyView(null);
    fetchSavedViews();
  }

  const hasActiveFilters = !!(search || statusFilter || companyFilter || titleFilter.length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      ...form,
      companyId: form.companyId ? Number(form.companyId) : null,
    };
    const res = await fetch('/api/portal/crm/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) {
      setError(d.message ?? 'Failed to create contact.');
      return;
    }
    setShowForm(false);
    setForm({ firstName: '', lastName: '', email: '', phone: '', linkedinUrl: '', title: '', companyId: '', source: '', status: 'lead', notes: '' });
    setFormCompanyLabel(null);
    fetchContacts();
    fetchTitles();
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-6">
      {/* Header */}
      <PortalPageHeader
        eyebrow="CRM"
        title="Contacts"
        subtitle={loading ? '' : `${total} contact${total !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <CrmImportExport entityType="contact" currentFilters={{ search, status: statusFilter, companyId: companyFilter, title: titleFilter.join(',') }} onImportComplete={fetchContacts} />
            <button
              onClick={() => setShowForm(f => !f)}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">{showForm ? 'close' : 'person_add'}</span>
              {showForm ? 'Cancel' : 'Add Contact'}
            </button>
          </div>
        }
      />

      {/* Inline form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h3 className="font-semibold text-foreground">New Contact</h3>
          <CrmDuplicateWarning email={form.email} phone={form.phone} firstName={form.firstName} lastName={form.lastName} />
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <span className="material-icons text-base">error</span>
              {error}
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">First Name *</label>
              <input
                required
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Last Name *</label>
              <input
                required
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">LinkedIn URL</label>
              <input
                type="url"
                value={form.linkedinUrl}
                onChange={e => setForm(f => ({ ...f, linkedinUrl: e.target.value }))}
                placeholder="https://linkedin.com/in/..."
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Company</label>
              <CrmCompanyTypeaheadPicker
                value={form.companyId}
                selectedLabel={formCompanyLabel}
                onChange={opt => {
                  setForm(f => ({ ...f, companyId: opt ? String(opt.id) : '' }));
                  setFormCompanyLabel(opt ? opt.name : null);
                }}
                placeholder="Select company…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Source</label>
              <select
                value={form.source}
                onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                className="w-full appearance-none rounded-xl border border-border bg-card px-3.5 py-2.5 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
                <option value="">Select source</option>
                {sourceOptions.map(s => (
                  <option key={s} value={s}>{s.replace('-', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full appearance-none rounded-xl border border-border bg-card px-3.5 py-2.5 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
                <option value="lead">Lead</option>
                <option value="active">Active</option>
                <option value="customer">Customer</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={1}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className={pBtnPrimary}
            >
              {saving && <span className="material-icons animate-spin text-sm">refresh</span>}
              Create Contact
            </button>
          </div>
        </form>
      )}

      {/* Saved Views + Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">bookmark</span>
            <select
              value={selectedViewId ?? ''}
              onChange={e => {
                const id = e.target.value ? Number(e.target.value) : null;
                const view = savedViews.find(v => v.id === id) ?? null;
                applyView(view);
              }}
              className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              <option value="">All Contacts</option>
              {savedViews.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            {selectedViewId && (
              <button
                onClick={() => handleDeleteView(selectedViewId)}
                className="flex items-center p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded"
                title="Delete saved view"
              >
                <span className="material-icons text-base">delete</span>
              </button>
            )}
          </div>
          {hasActiveFilters && !showSaveViewForm && (
            <button
              onClick={() => setShowSaveViewForm(true)}
              className={pBtnGhost}
            >
              <span className="material-icons text-base">save</span>
              Save View
            </button>
          )}
          {showSaveViewForm && (
            <form onSubmit={handleSaveView} className="flex items-center gap-2">
              <input
                autoFocus
                placeholder="View name..."
                value={viewName}
                onChange={e => setViewName(e.target.value)}
                className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15 w-40"
              />
              <button
                type="submit"
                disabled={savingView || !viewName.trim()}
              className={pBtnPrimary}
              >
                {savingView ? <span className="material-icons animate-spin text-sm">refresh</span> : <span className="material-icons text-sm">check</span>}
                Save
              </button>
              <button
                type="button"
                onClick={() => { setShowSaveViewForm(false); setViewName(''); }}
                className="flex items-center p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded"
              >
                <span className="material-icons text-base">close</span>
              </button>
            </form>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <span className="material-icons text-base text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2">search</span>
            <input
              placeholder="Search contacts..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 rounded-xl border border-border bg-card py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="appearance-none rounded-xl border border-border bg-card px-3.5 py-2.5 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
            {statusOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="min-w-[180px]">
            <CrmCompanyTypeaheadPicker
              value={companyFilter}
              selectedLabel={companyFilterLabel}
              onChange={opt => {
                setCompanyFilter(opt ? String(opt.id) : '');
                setCompanyFilterLabel(opt ? opt.name : null);
                setPage(1);
              }}
              placeholder="All Companies"
              noneLabel="All Companies"
            />
          </div>
          <PositionMultiSelect
            options={availableTitles}
            selected={titleFilter}
            onChange={v => { setTitleFilter(v); setPage(1); }}
          />
          <CrmCustomFieldFilters
            entityType="contact"
            values={customFilters}
            onChange={v => { setCustomFilters(v); setPage(1); }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-icons text-4xl text-muted-foreground mb-3 block">person_off</span>
            <p className="text-muted-foreground mb-4">No contacts found.</p>
            <button
              onClick={() => setShowForm(true)}
              className={pBtnPrimary}
            >
              Add First Contact
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Phone</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Score</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Last Contacted</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contacts.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/portal/crm/contacts/${c.id}`)}
                    className="hover:bg-accent transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{c.firstName} {c.lastName}</p>
                      {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{c.email ?? '---'}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.phone ?? '---'}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{c.companyName ?? '---'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[c.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scoreColor(c.score)}`}>
                        {c.score !== null && c.score !== undefined ? c.score : '---'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden xl:table-cell">
                      {c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleDateString() : '---'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="material-icons text-base text-muted-foreground">chevron_right</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-sm border border-border rounded-xl hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-icons text-base">chevron_left</span>
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const p = start + i;
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1.5 text-sm rounded-xl transition-colors ${
                    p === page
                      ? 'bg-foreground text-background'
                      : 'border border-border hover:bg-accent'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-sm border border-border rounded-xl hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-icons text-base">chevron_right</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
