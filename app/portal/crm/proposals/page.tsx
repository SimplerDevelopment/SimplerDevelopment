'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Proposal {
  id: number;
  title: string;
  status: string;
  contactId: number | null;
  companyId: number | null;
  dealId: number | null;
  lineItems: LineItem[];
  fees: Fee[];
  sentAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  acceptedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail?: string | null;
  companyName: string | null;
  dealTitle: string | null;
}

interface LineItem {
  id: string;
  description: string;
  details: string;
  qty: number;
  unitPrice: number;
  optional: boolean;
}

interface Fee {
  id: string;
  label: string;
  type: 'flat' | 'percent';
  amount: number;
}

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
}

interface Company {
  id: number;
  name: string;
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

interface PitchDeck {
  id: number;
  title: string;
  description: string | null;
  status: string;
  slides: unknown[];
  updatedAt: string;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const proposalStatusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
};

const deckStatusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-yellow-100 text-yellow-700',
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function computeValue(lineItems: LineItem[], fees: Fee[]): number {
  const items = Array.isArray(lineItems) ? lineItems : [];
  const feeList = Array.isArray(fees) ? fees : [];
  const subtotal = items
    .filter(li => !li.optional)
    .reduce((sum, li) => sum + (li.qty || 0) * (li.unitPrice || 0), 0);
  const feesTotal = feeList.reduce((sum, f) => {
    if (f.type === 'flat') return sum + (f.amount || 0);
    if (f.type === 'percent') return sum + Math.round(subtotal * (f.amount || 0) / 100);
    return sum;
  }, 0);
  return subtotal + feesTotal;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProposalsAndDecksPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
      <ProposalsAndDecksPage />
    </Suspense>
  );
}

function ProposalsAndDecksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'decks' ? 'decks' : 'proposals';

  const [activeTab, setActiveTab] = useState<'proposals' | 'decks'>(initialTab);

  // Proposal state
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);

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

  // Pitch deck state
  const [decks, setDecks] = useState<PitchDeck[]>([]);
  const [decksLoading, setDecksLoading] = useState(true);

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

  const fetchDecks = useCallback(async () => {
    setDecksLoading(true);
    try {
      const res = await fetch('/api/portal/tools/pitch-decks');
      const d = await res.json();
      setDecks(d.data ?? []);
    } catch { /* ignore */ }
    setDecksLoading(false);
  }, []);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  useEffect(() => {
    fetchDecks();
  }, [fetchDecks]);

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/crm/contacts?limit=1000').then(r => r.json()),
      fetch('/api/portal/crm/companies').then(r => r.json()),
      fetch('/api/portal/crm/deals?status=open').then(r => r.json()),
      fetch('/api/portal/crm/proposal-templates').then(r => r.json()),
    ]).then(([c, co, d, t]) => {
      setContacts(c.data?.contacts ?? c.data ?? []);
      setCompanies(co.data?.companies ?? co.data ?? []);
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            Send proposals and pitch decks to clients
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'proposals' && (
            <button
              onClick={() => setShowForm(f => !f)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
            >
              <span className="material-icons text-base">{showForm ? 'close' : 'add'}</span>
              {showForm ? 'Cancel' : 'New Proposal'}
            </button>
          )}
          {activeTab === 'decks' && (
            <button
              onClick={() => router.push('/portal/tools/pitch-decks/new')}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
            >
              <span className="material-icons text-base">add</span>
              New Deck
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
        <button
          onClick={() => setActiveTab('proposals')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'proposals'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          <span className="material-icons text-base">description</span>
          Proposals
          {!proposalsLoading && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === 'proposals' ? 'bg-primary-foreground/20' : 'bg-muted'
            }`}>
              {totalCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('decks')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'decks'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          <span className="material-icons text-base">slideshow</span>
          Pitch Decks
          {!decksLoading && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === 'decks' ? 'bg-primary-foreground/20' : 'bg-muted'
            }`}>
              {decks.length}
            </span>
          )}
        </button>
      </div>

      {/* ─── Proposals Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'proposals' && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                <span className="material-icons text-base">description</span>
                Total
              </div>
              <p className="text-2xl font-bold text-foreground">{totalCount}</p>
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
                Accepted
              </div>
              <p className="text-2xl font-bold text-foreground">{acceptedCount}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-600 text-xs font-medium mb-1">
                <span className="material-icons text-base">cancel</span>
                Declined
              </div>
              <p className="text-2xl font-bold text-foreground">{declinedCount}</p>
            </div>
          </div>

          {/* Inline Form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-foreground">New Proposal</h3>
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
                    <option value="">Select contact...</option>
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
                    <option value="">Select company...</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
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
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Template (optional)</label>
                  <select
                    value={form.templateId}
                    onChange={e => handleTemplateChange(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
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
              className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Table */}
          {proposalsLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <span className="material-icons animate-spin mr-2">progress_activity</span>
              Loading proposals...
            </div>
          ) : proposals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <span className="material-icons text-4xl mb-2 block">description</span>
              <p>No proposals yet. Create your first proposal to get started.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Value</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sent</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Viewed</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map(p => (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => router.push(`/portal/crm/proposals/${p.id}`)}
                            className="text-foreground font-medium hover:text-primary transition-colors text-left"
                          >
                            {p.title}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.contactFirstName ? `${p.contactFirstName} ${p.contactLastName ?? ''}`.trim() : '-'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.companyName ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">
                          {formatCurrency(computeValue(p.lineItems, p.fees))}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${proposalStatusColor[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {p.sentAt ? new Date(p.sentAt).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {p.lastViewedAt ? (
                            <span>
                              {new Date(p.lastViewedAt).toLocaleDateString()}
                              {p.viewCount > 0 && (
                                <span className="ml-1 text-muted-foreground">({p.viewCount}x)</span>
                              )}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => router.push(`/portal/crm/proposals/${p.id}`)}
                              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                              title="Edit"
                            >
                              <span className="material-icons text-base">edit</span>
                            </button>
                            {(p.status === 'draft' || p.status === 'sent') && (
                              <button
                                onClick={() => { setSendDialogId(p.id); setSendingUrl(''); }}
                                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-blue-600 transition-colors"
                                title="Send"
                              >
                                <span className="material-icons text-base">send</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleDuplicate(p)}
                              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                              title="Duplicate"
                            >
                              <span className="material-icons text-base">content_copy</span>
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
        </>
      )}

      {/* ─── Pitch Decks Tab ────────────────────────────────────────────────── */}
      {activeTab === 'decks' && (
        <>
          {decksLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <span className="material-icons animate-spin mr-2">progress_activity</span>
              Loading pitch decks...
            </div>
          ) : decks.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-10 text-center space-y-4">
              <span className="material-icons text-5xl text-muted-foreground/50">slideshow</span>
              <h2 className="text-lg font-semibold text-foreground">No pitch decks yet</h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Create your first AI-powered pitch deck. Enter a prompt describing what you need and optionally
                provide your website URL to automatically brand the deck.
              </p>
              <button
                onClick={() => router.push('/portal/tools/pitch-decks/new')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <span className="material-icons text-lg">auto_awesome</span>
                Create Your First Deck
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {decks.map((deck) => {
                const slides = Array.isArray(deck.slides) ? deck.slides : [];
                return (
                  <div
                    key={deck.id}
                    onClick={() => router.push(`/portal/tools/pitch-decks/${deck.id}`)}
                    className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-sm transition-all group cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="material-icons text-primary text-xl">slideshow</span>
                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {deck.title}
                        </h3>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${deckStatusColor[deck.status] || deckStatusColor.draft}`}>
                        {deck.status}
                      </span>
                    </div>
                    {deck.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{deck.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="material-icons text-sm">layers</span>
                        {slides.length} slide{slides.length !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-icons text-sm">schedule</span>
                        {new Date(deck.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── Send Dialog ──────────────────────────────────────────────────── */}
      {sendDialogId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full space-y-4">
            {sendingUrl ? (
              <>
                <div className="flex items-center gap-2 text-green-600">
                  <span className="material-icons">check_circle</span>
                  <h3 className="font-semibold text-foreground">Proposal Sent</h3>
                </div>
                <p className="text-sm text-muted-foreground">Share this link with your client:</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={sendingUrl} className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono" />
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
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-foreground flex items-center gap-2">
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
                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSend(sendDialogId)}
                    disabled={sending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
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
