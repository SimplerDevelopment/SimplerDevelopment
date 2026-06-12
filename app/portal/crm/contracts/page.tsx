'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contract {
  id: number;
  title: string;
  summary: string | null;
  status: string;
  dealId: number | null;
  contactId: number | null;
  companyId: number | null;
  validUntil: string | null;
  sentAt: string | null;
  fullyExecutedAt: string | null;
  createdAt: string;
  contactName: string | null;
  companyName: string | null;
  dealTitle: string | null;
  signers: { total: number; signed: number };
}

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
}

interface Deal {
  id: number;
  title: string;
}

interface NewContractForm {
  title: string;
  summary: string;
  signerName: string;
  signerEmail: string;
  dealId: string;
  contactId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-100 text-blue-700',
  signed:   'bg-green-100 text-green-700',
  voided:   'bg-red-100 text-red-700',
  expired:  'bg-gray-100 text-gray-500',
  executed: 'bg-emerald-100 text-emerald-700',
};

const STATUS_ICON: Record<string, string> = {
  draft:    'edit_note',
  sent:     'send',
  signed:   'check_circle',
  voided:   'cancel',
  expired:  'schedule',
  executed: 'verified',
};

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600';
  const icon  = STATUS_ICON[status] ?? 'article';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      <span className="material-icons text-[11px]">{icon}</span>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function SignersBadge({ signers }: { signers: { total: number; signed: number } }) {
  if (signers.total === 0) return <span className="text-muted-foreground text-xs">—</span>;
  const allSigned = signers.signed === signers.total;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${allSigned ? 'text-green-600' : 'text-muted-foreground'}`}>
      <span className="material-icons text-sm">{allSigned ? 'how_to_reg' : 'pending'}</span>
      {signers.signed}/{signers.total}
    </span>
  );
}

// ─── Page wrapper (Suspense boundary for useSearchParams if added later) ──────

export default function ContractsPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
      <ContractsPage />
    </Suspense>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function ContractsPage() {
  const router = useRouter();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals]       = useState<Deal[]>([]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');

  const [form, setForm] = useState<NewContractForm>({
    title: '',
    summary: '',
    signerName: '',
    signerEmail: '',
    dealId: '',
    contactId: '',
  });

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search)       params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    try {
      const res = await fetch(`/api/portal/crm/contracts?${params}`);
      const d   = await res.json();
      setContracts(d.data ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern, matches sibling CRM list pages
    fetchContracts();
  }, [fetchContracts]);

  // Sidebar data — contacts + open deals
  useEffect(() => {
    Promise.all([
      fetch('/api/portal/crm/contacts?limit=100').then(r => r.json()),
      fetch('/api/portal/crm/deals?status=open').then(r => r.json()),
    ]).then(([c, d]) => {
      setContacts(c.data?.contacts ?? c.data ?? []);
      setDeals(d.data ?? []);
    });
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const totalCount    = contracts.length;
  const sentCount     = contracts.filter(c => c.status === 'sent').length;
  const signedCount   = contracts.filter(c => ['signed', 'executed'].includes(c.status)).length;
  const draftCount    = contracts.filter(c => c.status === 'draft').length;

  // ─── Create contract ────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    const body: Record<string, unknown> = {
      title: form.title.trim(),
      summary: form.summary.trim() || undefined,
      dealId:    form.dealId    ? Number(form.dealId)    : null,
      contactId: form.contactId ? Number(form.contactId) : null,
    };

    if (form.signerName.trim() && form.signerEmail.trim()) {
      body.signers = [{ name: form.signerName.trim(), email: form.signerEmail.trim(), role: 'signer', order: 0 }];
    }

    try {
      const res = await fetch('/api/portal/crm/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!d.success) {
        setFormError(d.message ?? 'Failed to create contract.');
        setSaving(false);
        return;
      }
      setSaving(false);
      setShowForm(false);
      resetForm();
      router.push(`/portal/crm/contracts/${d.data.id}`);
    } catch {
      setFormError('Network error. Please try again.');
      setSaving(false);
    }
  }

  function resetForm() {
    setForm({ title: '', summary: '', signerName: '', signerEmail: '', dealId: '', contactId: '' });
    setFormError('');
  }

  function handleCancelForm() {
    setShowForm(false);
    resetForm();
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            Create and manage client contracts with e-signature support
          </p>
        </div>
        <button
          onClick={() => { setShowForm(f => !f); if (showForm) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
        >
          <span className="material-icons text-base">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancel' : 'New Contract'}
        </button>
      </div>

      {/* ─── Stats ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <span className="material-icons text-base">article</span>
            Total
          </div>
          <p className="text-2xl font-bold text-foreground">{totalCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <span className="material-icons text-base">edit_note</span>
            Drafts
          </div>
          <p className="text-2xl font-bold text-foreground">{draftCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-600 text-xs font-medium mb-1">
            <span className="material-icons text-base">send</span>
            Sent
          </div>
          <p className="text-2xl font-bold text-foreground">{sentCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-600 text-xs font-medium mb-1">
            <span className="material-icons text-base">check_circle</span>
            Signed
          </div>
          <p className="text-2xl font-bold text-foreground">{signedCount}</p>
        </div>
      </div>

      {/* ─── Inline Create Form ──────────────────────────────────────────────── */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-5">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">article</span>
            New Contract
          </h3>

          {formError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <span className="material-icons text-base">error</span>
              {formError}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Title */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Title *</label>
              <input
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Service Agreement — Acme Corp Q3 2026"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* Summary */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Summary (optional)</label>
              <textarea
                rows={2}
                value={form.summary}
                onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                placeholder="Brief description of what this contract covers"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>

            {/* Signer name */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Signer Name</label>
              <input
                value={form.signerName}
                onChange={e => setForm(f => ({ ...f, signerName: e.target.value }))}
                placeholder="Jane Smith"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* Signer email */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Signer Email</label>
              <input
                type="email"
                value={form.signerEmail}
                onChange={e => setForm(f => ({ ...f, signerEmail: e.target.value }))}
                placeholder="jane@acme.com"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* Contact */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Contact (optional)</label>
              <select
                value={form.contactId}
                onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select contact...</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                ))}
              </select>
            </div>

            {/* Deal */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Deal (optional)</label>
              <select
                value={form.dealId}
                onChange={e => setForm(f => ({ ...f, dealId: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">No deal linked</option>
                {deals.map(d => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Signer details can also be added or changed after creation on the contract detail page.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancelForm}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Contract'}
            </button>
          </div>
        </form>
      )}

      {/* ─── Filters row ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <span className="material-icons text-base text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2">search</span>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search contracts by title..."
            className="w-full pl-10 pr-9 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground"
              title="Clear search"
            >
              <span className="material-icons text-base">close</span>
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
          {(['', 'draft', 'sent', 'signed', 'voided'] as const).map(s => {
            const label = s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);
            const count = s === ''
              ? contracts.length
              : contracts.filter(c => c.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
                }`}
              >
                {label}
                <span className={`ml-1.5 text-[10px] ${statusFilter === s ? 'opacity-80' : 'opacity-60'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Table / Empty State ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading contracts...
        </div>
      ) : contracts.length === 0 && !search && !statusFilter ? (
        /* Pristine empty state */
        <div className="bg-card border border-border rounded-xl p-10 text-center space-y-4">
          <span className="material-icons text-5xl text-muted-foreground/40">article</span>
          <h2 className="text-lg font-semibold text-foreground">No contracts yet</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Create your first contract to start collecting e-signatures from clients.
            You can add clauses, link a deal, and send for signing — all in one place.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-lg">add</span>
            Create Your First Contract
          </button>
        </div>
      ) : contracts.length === 0 ? (
        /* Filtered empty state */
        <div className="bg-card border border-border rounded-xl p-10 text-center space-y-3">
          <span className="material-icons text-4xl text-muted-foreground/40">search_off</span>
          <h2 className="text-base font-semibold text-foreground">No contracts match your filters</h2>
          <p className="text-muted-foreground text-sm">
            {search && <>No contracts contain &ldquo;<span className="font-medium">{search}</span>&rdquo;. </>}
            {statusFilter && <>No <span className="font-medium">{statusFilter}</span> contracts. </>}
            Adjust your search or status filter above.
          </p>
          <button
            onClick={() => { setSearchInput(''); setStatusFilter(''); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-foreground rounded-md text-xs font-medium hover:bg-accent/70 transition-colors"
          >
            <span className="material-icons text-sm">refresh</span>
            Reset filters
          </button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-accent/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Deal</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Signers</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map(c => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/portal/crm/contracts/${c.id}`)}
                        className="text-foreground font-medium hover:text-primary transition-colors text-left"
                      >
                        {c.title}
                      </button>
                      {c.summary && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.summary}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.contactName?.trim() || '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.dealTitle ?? '-'}
                    </td>
                    <td className="px-4 py-3">
                      <SignersBadge signers={c.signers} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => router.push(`/portal/crm/contracts/${c.id}`)}
                          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="Open contract"
                        >
                          <span className="material-icons text-base">open_in_new</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
