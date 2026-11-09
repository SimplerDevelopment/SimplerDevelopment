'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import CrmImportExport from '@/components/portal/CrmImportExport';
import CrmCustomFieldFilters from '@/components/portal/CrmCustomFieldFilters';
import PositionMultiSelect from '@/components/portal/PositionMultiSelect';
import CrmCompanyTypeaheadPicker from '@/components/portal/CrmCompanyTypeaheadPicker';
import CrmAddContactModal from '@/components/portal/CrmAddContactModal';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import { EmptyState } from '@/components/portal/EmptyState';
import StudioTable, { type StudioColumn } from '@/components/portal/StudioTable';
import SavedViewTabs from '@/components/portal/crm/SavedViewTabs';
import ContactsBulkBar from '@/components/portal/crm/ContactsBulkBar';
import { relativeTime } from '@/lib/notifications/feed';

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
  lastActivity?: { title: string; at: string } | null;
  createdAt: string;
  avatarUrl: string | null;
}

// First letter of first + last name, uppercased, for the avatar fallback
// circle. Matches the initials pattern used on brain/people/[id].
function contactInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '?';
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
  // PUX-169 (design doc screen 28): saved views as tabs, selection + bulk bar, Last activity, the list idiom. Flag off is today's page.
  const studio = useFeatureFlag('portal-redesign');
  const [selected, setSelected] = useState<Set<number>>(new Set());
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

  // Add Contact modal open/closed. Form state, validation, submit, and the
  // inline company-create panel all live in CrmAddContactModal (OBQA-026).
  const [showForm, setShowForm] = useState(false);

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
    setSelected(new Set());
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

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const studioColumns: StudioColumn<Contact>[] = [
    { key: 'name', label: 'Name', render: (c) => (
      <div className="flex items-center gap-3">
        {c.avatarUrl
          ? <img src={c.avatarUrl} alt="" className="shrink-0 w-8 h-8 rounded-full object-cover" />
          : <span className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">{contactInitials(c.firstName, c.lastName)}</span>}
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">{c.firstName} {c.lastName}</p>
          <p className="text-xs text-muted-foreground truncate">{c.email ?? '—'}</p>
        </div>
      </div>
    ) },
    { key: 'company', label: 'Company', className: 'hidden lg:table-cell text-muted-foreground', render: (c) => c.companyName ?? '—' },
    { key: 'title', label: 'Title', className: 'hidden xl:table-cell text-muted-foreground', render: (c) => c.title ?? '—' },
    { key: 'status', label: 'Status', render: (c) => <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[c.status] ?? 'bg-gray-100 text-gray-700'}`}>{c.status}</span> },
    { key: 'activity', label: 'Last activity', className: 'hidden md:table-cell text-muted-foreground', render: (c) =>
      c.lastActivity ? `${c.lastActivity.title} · ${relativeTime(c.lastActivity.at)}` : c.lastContactedAt ? `Contacted · ${relativeTime(c.lastContactedAt)}` : '—' },
    { key: 'score', label: 'Score', align: 'right', className: 'hidden lg:table-cell', render: (c) => c.score ?? '—' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PortalPageHeader
        eyebrow={studio ? 'Grow · CRM' : 'CRM'}
        title="Contacts"
        subtitle={loading ? '' : `${total} contact${total !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <CrmImportExport entityType="contact" currentFilters={{ search, status: statusFilter, companyId: companyFilter, title: titleFilter.join(',') }} onImportComplete={fetchContacts} studio={studio} />
            <button
              onClick={() => setShowForm(f => !f)}
              className={studio ? sBtn : pBtnPrimary}
            >
              <span className="material-icons text-base">{showForm ? 'close' : 'person_add'}</span>
              {showForm ? 'Cancel' : studio ? 'New contact' : 'Add Contact'}
            </button>
          </div>
        }
      />

      {/* Add Contact modal (OBQA-026 item 1: was an inline appear/disappear panel) */}
      {showForm && (
        <CrmAddContactModal
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); fetchContacts(); fetchTitles(); }}
        />
      )}

      {/* Saved Views + Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {studio && (
            <SavedViewTabs views={savedViews} selectedId={selectedViewId} onSelect={applyView} onDelete={handleDeleteView} canSave={hasActiveFilters && !showSaveViewForm} onSave={() => setShowSaveViewForm(true)} />
          )}
          {!studio && <div className="flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">bookmark</span>
            <select
              aria-label="Saved view" value={selectedViewId ?? ''}
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
          </div>}
          {!studio && hasActiveFilters && !showSaveViewForm && (
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
              className={studio ? sBtnGhost : pBtnPrimary}
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
            aria-label="Filter by status" value={statusFilter}
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
      {studio ? (
        <div className="space-y-2">
          {selected.size > 0 && (
            <ContactsBulkBar rows={contacts.filter((c) => selected.has(c.id))} onClear={() => setSelected(new Set())} onChanged={fetchContacts} />
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12"><span className="material-icons animate-spin text-primary text-2xl">refresh</span></div>
          ) : contacts.length === 0 ? (
            <EmptyState
              title="No contacts yet."
              body="Everyone you talk to — guests, leads, partners — with what they last did."
              cta={{ label: 'New contact', icon: 'person_add', onClick: () => setShowForm(true) }}
              ghostLabel="A contact"
            />
          ) : (
            <StudioTable
              columns={studioColumns}
              rows={contacts}
              rowKey={(c) => c.id}
              onRowClick={(c) => router.push(`/portal/crm/contacts/${c.id}`)}
              selectable
              selected={selected}
              onToggle={(id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
              onToggleAll={() => setSelected((prev) => prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id)))}
              footer={`${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, total)} of ${total}`}
            />
          )}
        </div>
      ) : (
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
                      <div className="flex items-center gap-3">
                        {c.avatarUrl ? (
                          <img
                            src={c.avatarUrl}
                            alt=""
                            className="shrink-0 w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <span className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {contactInitials(c.firstName, c.lastName)}
                          </span>
                        )}
                        <div>
                          <p className="font-medium text-foreground">{c.firstName} {c.lastName}</p>
                          {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                        </div>
                      </div>
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
      )}

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
