'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import CrmCompanyTypeaheadPicker from '@/components/portal/CrmCompanyTypeaheadPicker';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pCardPad, pInput, pSelect, pSectionTitle, sBtn } from '@/components/portal/portal-ui';
import ProposalsListBody, { computeValue, type Proposal, type LineItem, type Fee } from '@/components/portal/crm/ProposalsListBody';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import { EmptyState } from '@/components/portal/EmptyState';
import ProposalsStudioTable from '@/components/portal/crm/ProposalsStudioTable';
import ContractsListBody, { type Contract } from '@/components/portal/crm/ContractsListBody';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
}

interface Deal {
  id: number;
  title: string;
  value: number;
  status: string;
}

interface Template {
  id: number;
  name: string;
  sections: Section[];
  lineItems: LineItem[];
  fees: Fee[];
}

interface Section {
  id: string;
  type: string;
  content: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProposalsPage() {
  const router = useRouter();
  // PUX-173 (design doc screen 32): one room, two tabs — Proposals | Contracts — with the Views column and
  // the sent → viewed → signed story; the two status vocabularies stay separate (QAD-011). Flag off is today's page.
  const studio = useFeatureFlag('portal-redesign');
  const [tab, setTab] = useState<'proposals' | 'contracts'>('proposals');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);
  useEffect(() => {
    if (!studio) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/portal/crm/contracts');
        const d = await r.json();
        if (!cancelled) setContracts(d.data ?? []);
      } catch {
        // the Contracts tab just stays empty
      } finally {
        if (!cancelled) setContractsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studio]);

  // Proposal state
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  // Display label for the currently-selected company in the new-proposal form.
  // Required so the typeahead picker can show the chosen company name in its
  // closed state without re-fetching when the user opens the form.
  const [formCompanyLabel, setFormCompanyLabel] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    contactId: '',
    companyId: '',
    dealId: '',
    templateId: '',
  });
  const [templateSections, setTemplateSections] = useState<Section[]>([]);
  const [templateLineItems, setTemplateLineItems] = useState<LineItem[]>([]);
  const [templateFees, setTemplateFees] = useState<Fee[]>([]);

  // Send dialog state
  const [sendDialogId, setSendDialogId] = useState<number | null>(null);
  const [sendingUrl, setSendingUrl] = useState('');
  const [sending, setSending] = useState(false);

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const fetchProposals = useCallback(async () => {
    setProposalsLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    try {
      const res = await fetch(`/api/portal/crm/proposals?${params}`);
      const d = await res.json();
      setProposals(d.data ?? []);
    } catch { /* ignore */ }
    setProposalsLoading(false);
  }, [search]);

  useEffect(() => {
    (async () => { await fetchProposals(); })();
  }, [fetchProposals]);

  useEffect(() => {
    // Company picker uses typeahead (?q=<query>) below — no bulk fetch needed.
    // TODO(perf): contacts picker is still bulk-fetched at limit=100; convert
    // to a typeahead pattern in a follow-up once the contacts route gains a
    // typeahead mode (the company route is the only one carrying ?q= today).
    Promise.all([
      fetch('/api/portal/crm/contacts?limit=100').then(r => r.json()),
      fetch('/api/portal/crm/deals?status=open').then(r => r.json()),
      fetch('/api/portal/crm/proposal-templates').then(r => r.json()),
    ]).then(([c, d, t]) => {
      setContacts(c.data?.contacts ?? c.data ?? []);
      setDeals(d.data ?? []);
      setTemplates(t.data ?? []);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ─── Proposal actions ──────────────────────────────────────────────────────

  function handleTemplateChange(templateId: string) {
    setForm(f => ({ ...f, templateId }));
    if (!templateId) {
      setTemplateSections([]);
      setTemplateLineItems([]);
      setTemplateFees([]);
      return;
    }
    const tmpl = templates.find(t => t.id === Number(templateId));
    if (tmpl) {
      setTemplateSections(Array.isArray(tmpl.sections) ? tmpl.sections : []);
      setTemplateLineItems(Array.isArray(tmpl.lineItems) ? tmpl.lineItems : []);
      setTemplateFees(Array.isArray(tmpl.fees) ? tmpl.fees : []);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body: Record<string, unknown> = {
      title: form.title,
      contactId: form.contactId ? Number(form.contactId) : null,
      companyId: form.companyId ? Number(form.companyId) : null,
      dealId: form.dealId ? Number(form.dealId) : null,
    };
    if (form.templateId) {
      body.sections = templateSections;
      body.lineItems = templateLineItems;
      body.fees = templateFees;
    }
    const res = await fetch('/api/portal/crm/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) {
      setError(d.message ?? 'Failed to create proposal.');
      return;
    }
    setShowForm(false);
    setForm({ title: '', contactId: '', companyId: '', dealId: '', templateId: '' });
    setFormCompanyLabel(null);
    setTemplateSections([]);
    setTemplateLineItems([]);
    setTemplateFees([]);
    router.push(`/portal/crm/proposals/${d.data.id}`);
  }

  async function handleDuplicate(proposal: Proposal) {
    const body = {
      title: `${proposal.title} (Copy)`,
      contactId: proposal.contactId,
      companyId: proposal.companyId,
      dealId: proposal.dealId,
      lineItems: proposal.lineItems,
      fees: proposal.fees,
    };
    const res = await fetch('/api/portal/crm/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (d.success) {
      router.push(`/portal/crm/proposals/${d.data.id}`);
    }
  }

  async function handleSend(proposalId: number) {
    setSending(true);
    const res = await fetch(`/api/portal/crm/proposals/${proposalId}/send`, { method: 'POST' });
    const d = await res.json();
    setSending(false);
    if (!d.success) {
      setSendDialogId(null);
      return;
    }
    const url = `${window.location.origin}${d.data.proposalUrl}`;
    setSendingUrl(url);
    fetchProposals();
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────

  const totalCount = proposals.length;
  const sentCount = proposals.filter(p => ['sent', 'viewed'].includes(p.status)).length;
  const acceptedCount = proposals.filter(p => p.status === 'accepted').length;
  const declinedCount = proposals.filter(p => p.status === 'declined').length;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <PortalPageHeader
        eyebrow={studio ? 'Grow · CRM' : 'CRM'}
        title={studio ? 'Proposals & contracts' : 'Proposals'}
        subtitle={studio
          ? `${proposals.filter((p) => p.status === 'sent' || p.status === 'viewed').length} proposals out · ${contracts.filter((c) => c.status === 'sent' || c.status === 'partially_signed').length} contracts in progress`
          : 'Send proposals to clients'}
        actions={
          <button
            onClick={() => setShowForm(f => !f)}
            className={studio ? sBtn : pBtnPrimary}
          >
            <span className="material-icons text-base">{showForm ? 'close' : 'add'}</span>
            {showForm ? 'Cancel' : studio ? 'New proposal' : 'New Proposal'}
          </button>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className={`${pCard} p-4`}>
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <span className="material-icons text-base">description</span>
            Total
          </div>
          <p className="text-2xl font-bold text-foreground">{totalCount}</p>
        </div>
        <div className={`${pCard} p-4`}>
          <div className="flex items-center gap-2 text-blue-600 text-xs font-medium mb-1">
            <span className="material-icons text-base">send</span>
            Sent
          </div>
          <p className="text-2xl font-bold text-foreground">{sentCount}</p>
        </div>
        <div className={`${pCard} p-4`}>
          <div className="flex items-center gap-2 text-green-600 text-xs font-medium mb-1">
            <span className="material-icons text-base">check_circle</span>
            Accepted
          </div>
          <p className="text-2xl font-bold text-foreground">{acceptedCount}</p>
        </div>
        <div className={`${pCard} p-4`}>
          <div className="flex items-center gap-2 text-red-600 text-xs font-medium mb-1">
            <span className="material-icons text-base">cancel</span>
            Declined
          </div>
          <p className="text-2xl font-bold text-foreground">{declinedCount}</p>
        </div>
      </div>

      {/* Inline Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className={`${pCardPad} space-y-4`}>
          <h3 className={pSectionTitle}>New Proposal</h3>
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
                placeholder="Proposal title"
                className={pInput}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Contact</label>
              <select
                value={form.contactId}
                onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))}
                className={pSelect}
              >
                <option value="">Select contact...</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                ))}
              </select>
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
                placeholder="Select company..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Deal (optional)</label>
              <select
                value={form.dealId}
                onChange={e => setForm(f => ({ ...f, dealId: e.target.value }))}
                className={pSelect}
              >
                <option value="">No deal linked</option>
                {deals.map(d => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Template (optional)</label>
              <select
                value={form.templateId}
                onChange={e => handleTemplateChange(e.target.value)}
                className={pSelect}
              >
                <option value="">Start from scratch</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className={pBtnGhost}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={pBtnPrimary}
            >
              {saving ? 'Creating...' : 'Create Proposal'}
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="relative">
        <span className="material-icons text-base text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2">search</span>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search proposals by title..."
          className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
      </div>

      {/* Table */}
      {studio ? (
        <div className="space-y-3">
          <div className="flex gap-1" role="tablist" aria-label="Proposals and contracts">
            {([['proposals', `Proposals ${proposals.length}`], ['contracts', `Contracts ${contracts.length}`]] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${tab === key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'proposals' ? (
            proposalsLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading proposals...</div>
            ) : proposals.length === 0 ? (
              <EmptyState title="No proposals yet." body="Send one and watch it get opened — every view is recorded here." cta={{ label: 'New proposal', icon: 'add', onClick: () => setShowForm(true), ghost: true }} ghostLabel="A proposal" />
            ) : (
              <ProposalsStudioTable proposals={proposals} valueOf={(p) => computeValue(p.lineItems, p.fees)} onOpen={(p) => router.push(`/portal/crm/proposals/${p.id}`)} />
            )
          ) : (
            // The contracts page's own list body, mounted here; its create form still lives on /portal/crm/contracts.
            <ContractsListBody loading={contractsLoading} contracts={contracts} search="" statusFilter="" onCreateFirst={() => router.push('/portal/crm/contracts')} onResetFilters={() => {}} onOpen={(id) => router.push(`/portal/crm/contracts/${id}`)} />
          )}
        </div>
      ) : (
      <ProposalsListBody
        proposalsLoading={proposalsLoading}
        proposals={proposals}
        onOpen={(id) => router.push(`/portal/crm/proposals/${id}`)}
        onDuplicate={handleDuplicate}
        onOpenSendDialog={(id) => { setSendDialogId(id); setSendingUrl(''); }}
      />
      )}

      {/* ─── Send Dialog ──────────────────────────────────────────────────── */}
      {sendDialogId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${pCardPad} max-w-md w-full space-y-4`}>
            {sendingUrl ? (
              <>
                <div className="flex items-center gap-2 text-green-600">
                  <span className="material-icons">check_circle</span>
                  <h3 className={`${pSectionTitle} flex items-center gap-2`}>Proposal Sent</h3>
                </div>
                <p className="text-sm text-muted-foreground">Share this link with your client:</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={sendingUrl} className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground font-mono outline-none flex-1" />
                  <button
                    onClick={() => navigator.clipboard.writeText(sendingUrl)}
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy link"
                  >
                    <span className="material-icons text-base">content_copy</span>
                  </button>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => { setSendDialogId(null); setSendingUrl(''); }}
                    className={pBtnPrimary}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className={`${pSectionTitle} flex items-center gap-2`}>
                  <span className="material-icons text-blue-600">send</span>
                  Send Proposal
                </h3>
                <p className="text-sm text-muted-foreground">
                  This will mark the proposal as &quot;Sent&quot; and generate a unique link for your client.
                </p>
                {(() => {
                  const p = proposals.find(pr => pr.id === sendDialogId);
                  const contact = p?.contactFirstName
                    ? `${p.contactFirstName} ${p.contactLastName ?? ''}`.trim()
                    : null;
                  return contact ? (
                    <p className="text-sm text-muted-foreground">
                      Sending to <strong className="text-foreground">{contact}</strong>
                      {p?.contactEmail ? ` (${p.contactEmail})` : ''}
                    </p>
                  ) : null;
                })()}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setSendDialogId(null)}
                    className={pBtnGhost}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSend(sendDialogId)}
                    disabled={sending}
                    className={pBtnPrimary}
                  >
                    {sending ? 'Sending...' : 'Send Now'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
