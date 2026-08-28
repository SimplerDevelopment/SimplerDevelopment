'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import DomainGetStarted from '@/components/portal/onboarding/DomainGetStarted';
import { pBtnPrimary, pBtnGhost, pCard, pInput } from '@/components/portal/portal-ui';
import ContractsListBody, { type Contract } from '@/components/portal/crm/ContractsListBody';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  // "Signed" = fully executed, i.e. every signer has signed (crm_contracts.status === 'fully_executed';
  // see lib/db/schema/crm.ts:251). 'partially_signed' is intentionally excluded — some signers still
  // haven't signed yet, so it's not a terminal "signed" state. 'signed'/'executed' are not real enum
  // values and never matched (QAD-011).
  const signedCount   = contracts.filter(c => c.status === 'fully_executed').length;
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
      <PortalPageHeader
        eyebrow="CRM"
        title="Contracts"
        subtitle="Create and manage client contracts with e-signature support"
        actions={
          <button
            onClick={() => { setShowForm(f => !f); if (showForm) resetForm(); }}
            className={pBtnPrimary}
          >
            <span className="material-icons text-base">{showForm ? 'close' : 'add'}</span>
            {showForm ? 'Cancel' : 'New Contract'}
          </button>
        }
      />

      <DomainGetStarted domainKey="esign" />

      {/* ─── Stats ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <span className="material-icons text-base">article</span>
            Total
          </div>
          <p className="text-2xl font-bold text-foreground">{totalCount}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <span className="material-icons text-base">edit_note</span>
            Drafts
          </div>
          <p className="text-2xl font-bold text-foreground">{draftCount}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 text-blue-600 text-xs font-medium mb-1">
            <span className="material-icons text-base">send</span>
            Sent
          </div>
          <p className="text-2xl font-bold text-foreground">{sentCount}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 text-green-600 text-xs font-medium mb-1">
            <span className="material-icons text-base">check_circle</span>
            Signed
          </div>
          <p className="text-2xl font-bold text-foreground">{signedCount}</p>
        </div>
      </div>

      {/* ─── Inline Create Form ──────────────────────────────────────────────── */}
      {showForm && (
        <form onSubmit={handleSubmit} className={`${pCard} p-6 space-y-5`}>
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
                className={pInput}
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
                className={`${pInput} resize-none`}
              />
            </div>

            {/* Signer name */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Signer Name</label>
              <input
                value={form.signerName}
                onChange={e => setForm(f => ({ ...f, signerName: e.target.value }))}
                placeholder="Jane Smith"
                className={pInput}
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
                className={pInput}
              />
            </div>

            {/* Contact */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Contact (optional)</label>
              <select
                value={form.contactId}
                onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))}
                className={pInput}
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
                className={pInput}
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
              className={pBtnGhost}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={pBtnPrimary}
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
            className={`${pInput} pl-10 pr-9`}
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
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-0.5">
          {/* 'Signed' filters on 'fully_executed' — the real terminal-signed enum value
              (lib/db/schema/crm.ts:251). Same mapping as signedCount above (QAD-011). */}
          {([
            { value: '', label: 'All' },
            { value: 'draft', label: 'Draft' },
            { value: 'sent', label: 'Sent' },
            { value: 'fully_executed', label: 'Signed' },
            { value: 'voided', label: 'Voided' },
          ] as const).map(({ value: s, label }) => {
            const count = s === ''
              ? contracts.length
              : contracts.filter(c => c.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-foreground text-background font-bold'
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
      <ContractsListBody
        loading={loading}
        contracts={contracts}
        search={search}
        statusFilter={statusFilter}
        onCreateFirst={() => setShowForm(true)}
        onResetFilters={() => { setSearchInput(''); setStatusFilter(''); }}
        onOpen={(id) => router.push(`/portal/crm/contracts/${id}`)}
      />
    </div>
  );
}
