'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Section {
  id: string;
  type: 'heading' | 'text' | 'image' | 'divider' | 'pricing' | 'terms' | 'signature';
  content: string;
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
  email: string | null;
}

interface Company {
  id: number;
  name: string;
}

interface Deal {
  id: number;
  title: string;
}

interface Proposal {
  id: number;
  title: string;
  summary: string | null;
  status: string;
  contactId: number | null;
  companyId: number | null;
  dealId: number | null;
  sections: Section[];
  lineItems: LineItem[];
  fees: Fee[];
  currency: string;
  validUntil: string | null;
  clientToken: string;
  accentColor: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  footerText: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  signatureName: string | null;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  companyName: string | null;
  dealTitle: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const statusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
};

function fmtCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function uid(): string {
  return crypto.randomUUID();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProposalEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Editable state
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [contactId, setContactId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [dealId, setDealId] = useState('');
  const [accentColor, setAccentColor] = useState('#2563eb');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [footerText, setFooterText] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);

  // Send dialog
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendingUrl, setSendingUrl] = useState('');
  const [sending, setSending] = useState(false);

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Save-as-template dialog
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  /* Load proposal + reference data */
  const loadProposal = useCallback(async () => {
    const res = await fetch(`/api/portal/crm/proposals/${id}`);
    const d = await res.json();
    if (!d.success) {
      setError(d.message ?? 'Failed to load proposal');
      setLoading(false);
      return;
    }
    const p = d.data as Proposal;
    setProposal(p);
    setTitle(p.title);
    setSummary(p.summary ?? '');
    setContactId(p.contactId ? String(p.contactId) : '');
    setCompanyId(p.companyId ? String(p.companyId) : '');
    setDealId(p.dealId ? String(p.dealId) : '');
    setAccentColor(p.accentColor ?? '#2563eb');
    setLogoUrl(p.logoUrl ?? '');
    setCoverImageUrl(p.coverImageUrl ?? '');
    setValidUntil(p.validUntil ? p.validUntil.slice(0, 10) : '');
    setFooterText(p.footerText ?? '');
    setSections(Array.isArray(p.sections) ? p.sections : []);
    setLineItems(Array.isArray(p.lineItems) ? p.lineItems : []);
    setFees(Array.isArray(p.fees) ? p.fees : []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadProposal();
    Promise.all([
      fetch('/api/portal/crm/contacts?limit=1000').then(r => r.json()),
      fetch('/api/portal/crm/companies?limit=5000').then(r => r.json()),
      fetch('/api/portal/crm/deals?status=open').then(r => r.json()),
    ]).then(([c, co, d]) => {
      setContacts(c.data?.contacts ?? c.data ?? []);
      setCompanies(co.data?.companies ?? co.data ?? []);
      setDeals(d.data ?? []);
    });
  }, [loadProposal]);

  /* Save */
  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    const body = {
      title,
      summary: summary || null,
      contactId: contactId ? Number(contactId) : null,
      companyId: companyId ? Number(companyId) : null,
      dealId: dealId ? Number(dealId) : null,
      accentColor,
      logoUrl: logoUrl || null,
      coverImageUrl: coverImageUrl || null,
      validUntil: validUntil || null,
      footerText: footerText || null,
      sections,
      lineItems,
      fees,
    };
    const res = await fetch(`/api/portal/crm/proposals/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) {
      setError(d.message ?? 'Failed to save');
      return;
    }
    setSuccess('Saved');
    setTimeout(() => setSuccess(''), 2000);
  }

  /* Send */
  async function handleSend() {
    setSending(true);
    // Auto-save first
    await fetch(`/api/portal/crm/proposals/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, summary, contactId: contactId ? Number(contactId) : null, companyId: companyId ? Number(companyId) : null, dealId: dealId ? Number(dealId) : null, accentColor, logoUrl: logoUrl || null, coverImageUrl: coverImageUrl || null, validUntil: validUntil || null, footerText: footerText || null, sections, lineItems, fees }),
    });
    const res = await fetch(`/api/portal/crm/proposals/${id}/send`, { method: 'POST' });
    const d = await res.json();
    setSending(false);
    if (!d.success) {
      setError(d.message ?? 'Failed to send');
      setShowSendDialog(false);
      return;
    }
    const url = `${window.location.origin}${d.data.proposalUrl}`;
    setSendingUrl(url);
    loadProposal();
  }

  /* Delete */
  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/portal/crm/proposals/${id}`, { method: 'DELETE' });
    setDeleting(false);
    router.push('/portal/crm/proposals');
  }

  /* Save as Template */
  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSavingTemplate(true);
    const body = {
      name: templateName,
      sections,
      lineItems,
      fees,
      accentColor,
      footerText: footerText || null,
    };
    const res = await fetch('/api/portal/crm/proposal-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSavingTemplate(false);
    if (d.success) {
      setShowTemplateDialog(false);
      setTemplateName('');
      setSuccess('Template saved');
      setTimeout(() => setSuccess(''), 2000);
    }
  }

  /* Section helpers */
  function addSection(type: Section['type']) {
    setSections(prev => [...prev, { id: uid(), type, content: '' }]);
  }

  function updateSection(sectionId: string, content: string) {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, content } : s));
  }

  function removeSection(sectionId: string) {
    setSections(prev => prev.filter(s => s.id !== sectionId));
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === sectionId);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  }

  /* Line item helpers */
  function addLineItem() {
    setLineItems(prev => [...prev, { id: uid(), description: '', details: '', qty: 1, unitPrice: 0, optional: false }]);
  }

  function updateLineItem(itemId: string, field: keyof LineItem, value: string | number | boolean) {
    setLineItems(prev => prev.map(li => li.id === itemId ? { ...li, [field]: value } : li));
  }

  function removeLineItem(itemId: string) {
    setLineItems(prev => prev.filter(li => li.id !== itemId));
  }

  /* Fee helpers */
  function addFee() {
    setFees(prev => [...prev, { id: uid(), label: '', type: 'flat', amount: 0 }]);
  }

  function updateFee(feeId: string, field: keyof Fee, value: string | number) {
    setFees(prev => prev.map(f => f.id === feeId ? { ...f, [field]: value } : f));
  }

  function removeFee(feeId: string) {
    setFees(prev => prev.filter(f => f.id !== feeId));
  }

  /* Computed totals */
  const subtotal = lineItems.filter(li => !li.optional).reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
  const computedFees = fees.map(f => ({
    ...f,
    computed: f.type === 'flat' ? f.amount : Math.round(subtotal * f.amount / 100),
  }));
  const feesTotal = computedFees.reduce((sum, f) => sum + f.computed, 0);
  const grandTotal = subtotal + feesTotal;

  /* Contact / Company display for preview */
  const selectedContact = contacts.find(c => c.id === Number(contactId));
  const selectedCompany = companies.find(c => c.id === Number(companyId));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading proposal...
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="text-center py-20">
        <span className="material-icons text-4xl text-muted-foreground mb-2 block">error_outline</span>
        <p className="text-muted-foreground">{error || 'Proposal not found'}</p>
        <button onClick={() => router.push('/portal/crm/proposals')} className="mt-4 text-sm text-primary hover:underline">
          Back to proposals
        </button>
      </div>
    );
  }

  const sectionTypeLabel: Record<string, string> = {
    heading: 'Heading',
    text: 'Text',
    image: 'Image',
    divider: 'Divider',
    pricing: 'Pricing',
    terms: 'Terms',
    signature: 'Signature',
  };

  const sectionTypeIcon: Record<string, string> = {
    heading: 'title',
    text: 'notes',
    image: 'image',
    divider: 'horizontal_rule',
    pricing: 'payments',
    terms: 'gavel',
    signature: 'draw',
  };

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/portal/crm/proposals')}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Back"
          >
            <span className="material-icons text-base">arrow_back</span>
          </button>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor[proposal.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {proposal.status}
          </span>
          {success && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <span className="material-icons text-sm">check</span>
              {success}
            </span>
          )}
          {error && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <span className="material-icons text-sm">error</span>
              {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplateDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="material-icons text-sm">bookmark_add</span>
            Save as Template
          </button>
          <button
            onClick={() => setShowSendDialog(true)}
            disabled={proposal.status === 'accepted' || proposal.status === 'declined' || proposal.status === 'expired'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-icons text-sm">send</span>
            Send
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <span className="material-icons text-sm">save</span>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
          >
            <span className="material-icons text-sm">delete</span>
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-5 gap-4">
        {/* Left Panel - Editor (60%) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Title */}
          <div className="bg-card border border-border rounded-xl p-4">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Proposal Title"
              className="w-full text-xl font-bold bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Summary */}
          <div className="bg-card border border-border rounded-xl p-4">
            <label className="block text-xs font-medium text-muted-foreground mb-2">Summary</label>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={3}
              placeholder="Brief summary of this proposal..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {/* Recipient & Branding */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-base text-muted-foreground">settings</span>
              Details &amp; Branding
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Contact</label>
                <select value={contactId} onChange={e => setContactId(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">None</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Company</label>
                <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">None</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Deal</label>
                <select value={dealId} onChange={e => setDealId(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">None</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
                  <input value={accentColor} onChange={e => setAccentColor(e.target.value)} className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Logo URL</label>
                <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Cover Image URL</label>
                <input value={coverImageUrl} onChange={e => setCoverImageUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Valid Until</label>
                <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Footer Text</label>
                <input value={footerText} onChange={e => setFooterText(e.target.value)} placeholder="Thank you for your consideration." className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
          </div>

          {/* Content Sections */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-base text-muted-foreground">view_list</span>
              Content Sections
            </h3>

            {sections.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No sections yet. Add sections below to build your proposal.</p>
            )}

            {sections.map((section, idx) => (
              <div key={section.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <span className="material-icons text-sm">{sectionTypeIcon[section.type] ?? 'article'}</span>
                    {sectionTypeLabel[section.type] ?? section.type}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveSection(section.id, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30 transition-colors">
                      <span className="material-icons text-sm">arrow_upward</span>
                    </button>
                    <button onClick={() => moveSection(section.id, 1)} disabled={idx === sections.length - 1} className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30 transition-colors">
                      <span className="material-icons text-sm">arrow_downward</span>
                    </button>
                    <button onClick={() => removeSection(section.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors">
                      <span className="material-icons text-sm">close</span>
                    </button>
                  </div>
                </div>

                {section.type === 'heading' && (
                  <input
                    value={section.content}
                    onChange={e => updateSection(section.id, e.target.value)}
                    placeholder="Heading text..."
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                )}
                {section.type === 'text' && (
                  <textarea
                    value={section.content}
                    onChange={e => updateSection(section.id, e.target.value)}
                    rows={4}
                    placeholder="Enter text content (HTML supported)..."
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                  />
                )}
                {section.type === 'image' && (
                  <div className="space-y-2">
                    <input
                      value={section.content}
                      onChange={e => updateSection(section.id, e.target.value)}
                      placeholder="Image URL..."
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    {section.content && (
                      <img src={section.content} alt="Section image" className="max-h-40 rounded-lg border border-border object-contain" />
                    )}
                  </div>
                )}
                {section.type === 'divider' && (
                  <hr className="border-border" />
                )}
                {section.type === 'pricing' && (
                  <p className="text-xs text-muted-foreground">This section will render the line items and pricing table below.</p>
                )}
                {section.type === 'terms' && (
                  <textarea
                    value={section.content}
                    onChange={e => updateSection(section.id, e.target.value)}
                    rows={4}
                    placeholder="Terms and conditions..."
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                  />
                )}
                {section.type === 'signature' && (
                  <p className="text-xs text-muted-foreground">Signature field will appear here for the client to sign.</p>
                )}
              </div>
            ))}

            {/* Add section buttons */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {(['heading', 'text', 'image', 'divider', 'pricing', 'terms', 'signature'] as Section['type'][]).map(type => (
                <button
                  key={type}
                  onClick={() => addSection(type)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="material-icons text-sm">{sectionTypeIcon[type]}</span>
                  {sectionTypeLabel[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-base text-muted-foreground">receipt_long</span>
              Line Items
            </h3>

            {lineItems.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-2 font-medium text-muted-foreground text-xs">Description</th>
                      <th className="text-left py-2 pr-2 font-medium text-muted-foreground text-xs">Details</th>
                      <th className="text-right py-2 pr-2 font-medium text-muted-foreground text-xs w-16">Qty</th>
                      <th className="text-right py-2 pr-2 font-medium text-muted-foreground text-xs w-28">Unit Price</th>
                      <th className="text-right py-2 pr-2 font-medium text-muted-foreground text-xs w-28">Total</th>
                      <th className="text-center py-2 pr-2 font-medium text-muted-foreground text-xs w-16">Opt.</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map(li => (
                      <tr key={li.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-2">
                          <input
                            value={li.description}
                            onChange={e => updateLineItem(li.id, 'description', e.target.value)}
                            placeholder="Item description"
                            className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            value={li.details}
                            onChange={e => updateLineItem(li.id, 'details', e.target.value)}
                            placeholder="Details"
                            className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min="0"
                            value={li.qty}
                            onChange={e => updateLineItem(li.id, 'qty', Number(e.target.value))}
                            className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={li.unitPrice}
                            onChange={e => updateLineItem(li.id, 'unitPrice', Number(e.target.value))}
                            className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                        </td>
                        <td className="py-2 pr-2 text-right font-medium text-foreground">
                          {fmtCurrency(li.qty * li.unitPrice)}
                        </td>
                        <td className="py-2 pr-2 text-center">
                          <input
                            type="checkbox"
                            checked={li.optional}
                            onChange={e => updateLineItem(li.id, 'optional', e.target.checked)}
                            className="rounded border-border"
                          />
                        </td>
                        <td className="py-2">
                          <button onClick={() => removeLineItem(li.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors">
                            <span className="material-icons text-sm">close</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={addLineItem} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium">
              <span className="material-icons text-sm">add</span>
              Add Line Item
            </button>

            {/* Totals */}
            {lineItems.length > 0 && (
              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">{fmtCurrency(subtotal)}</span>
                </div>
                {computedFees.map(f => (
                  <div key={f.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{f.label || 'Fee'} {f.type === 'percent' ? `(${f.amount}%)` : ''}</span>
                    <span className="text-foreground">{fmtCurrency(f.computed)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-border">
                  <span className="text-foreground">Grand Total</span>
                  <span className="text-foreground">{fmtCurrency(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Fees Editor */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-base text-muted-foreground">percent</span>
              Fees
            </h3>

            {fees.map(f => (
              <div key={f.id} className="flex items-center gap-2">
                <input
                  value={f.label}
                  onChange={e => updateFee(f.id, 'label', e.target.value)}
                  placeholder="Fee label"
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <select
                  value={f.type}
                  onChange={e => updateFee(f.id, 'type', e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="flat">Flat ($)</option>
                  <option value="percent">Percent (%)</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step={f.type === 'percent' ? '0.01' : '1'}
                  value={f.amount}
                  onChange={e => updateFee(f.id, 'amount', Number(e.target.value))}
                  className="w-24 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button onClick={() => removeFee(f.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors">
                  <span className="material-icons text-sm">close</span>
                </button>
              </div>
            ))}

            <button onClick={addFee} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium">
              <span className="material-icons text-sm">add</span>
              Add Fee
            </button>
          </div>
        </div>

        {/* Right Panel - Live Preview (40%) */}
        <div className="lg:col-span-2">
          <div className="sticky top-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-accent/30 flex items-center gap-2">
                <span className="material-icons text-sm text-muted-foreground">visibility</span>
                <span className="text-xs font-medium text-muted-foreground">Live Preview</span>
              </div>
              <div className="p-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
                <div className="space-y-4">
                  {/* Logo */}
                  {logoUrl && (
                    <img src={logoUrl} alt="Logo" className="h-10 object-contain" />
                  )}

                  {/* Cover Image */}
                  {coverImageUrl && (
                    <img src={coverImageUrl} alt="Cover" className="w-full h-32 object-cover rounded-lg" />
                  )}

                  {/* Title */}
                  <h1 className="text-xl font-bold" style={{ color: accentColor }}>
                    {title || 'Untitled Proposal'}
                  </h1>

                  {/* Summary */}
                  {summary && (
                    <p className="text-sm text-muted-foreground">{summary}</p>
                  )}

                  {/* Recipient */}
                  {(selectedContact || selectedCompany) && (
                    <p className="text-xs text-muted-foreground">
                      Prepared for: {selectedContact ? `${selectedContact.firstName} ${selectedContact.lastName}` : ''}
                      {selectedContact && selectedCompany ? ' at ' : ''}
                      {selectedCompany ? selectedCompany.name : ''}
                    </p>
                  )}

                  {/* Valid until */}
                  {validUntil && (
                    <p className="text-xs text-muted-foreground">
                      Valid until: {new Date(validUntil + 'T00:00:00').toLocaleDateString()}
                    </p>
                  )}

                  {/* Sections */}
                  {sections.map(section => (
                    <div key={section.id}>
                      {section.type === 'heading' && (
                        <h2 className="text-base font-semibold" style={{ color: accentColor }}>
                          {section.content || 'Heading'}
                        </h2>
                      )}
                      {section.type === 'text' && (
                        <div className="text-sm text-foreground prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: section.content || '<p class="text-muted-foreground italic">Text content...</p>' }} />
                      )}
                      {section.type === 'image' && section.content && (
                        <img src={section.content} alt="Section" className="w-full rounded-lg" />
                      )}
                      {section.type === 'divider' && (
                        <hr style={{ borderColor: accentColor, opacity: 0.3 }} />
                      )}
                      {section.type === 'pricing' && lineItems.length > 0 && (
                        <div className="border border-border rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-accent/30">
                                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Item</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Qty</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Price</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lineItems.map(li => (
                                <tr key={li.id} className="border-t border-border">
                                  <td className="px-2 py-1.5">
                                    <div className="font-medium text-foreground">{li.description || 'Item'}</div>
                                    {li.details && <div className="text-muted-foreground">{li.details}</div>}
                                    {li.optional && <span className="text-xs text-yellow-600">(Optional)</span>}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-muted-foreground">{li.qty}</td>
                                  <td className="px-2 py-1.5 text-right text-muted-foreground">{fmtCurrency(li.unitPrice)}</td>
                                  <td className="px-2 py-1.5 text-right font-medium text-foreground">{fmtCurrency(li.qty * li.unitPrice)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-border">
                                <td colSpan={3} className="px-2 py-1.5 text-right text-muted-foreground">Subtotal</td>
                                <td className="px-2 py-1.5 text-right font-medium text-foreground">{fmtCurrency(subtotal)}</td>
                              </tr>
                              {computedFees.map(f => (
                                <tr key={f.id}>
                                  <td colSpan={3} className="px-2 py-1 text-right text-muted-foreground">{f.label || 'Fee'}{f.type === 'percent' ? ` (${f.amount}%)` : ''}</td>
                                  <td className="px-2 py-1 text-right text-foreground">{fmtCurrency(f.computed)}</td>
                                </tr>
                              ))}
                              <tr className="border-t-2 border-border">
                                <td colSpan={3} className="px-2 py-1.5 text-right font-bold text-foreground">Total</td>
                                <td className="px-2 py-1.5 text-right font-bold" style={{ color: accentColor }}>{fmtCurrency(grandTotal)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                      {section.type === 'terms' && (
                        <div className="text-xs text-muted-foreground bg-accent/20 rounded-lg p-3">
                          <div className="font-medium text-foreground mb-1">Terms &amp; Conditions</div>
                          <div className="whitespace-pre-wrap">{section.content || 'Terms and conditions will appear here.'}</div>
                        </div>
                      )}
                      {section.type === 'signature' && (
                        <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                          <span className="material-icons text-2xl text-muted-foreground">draw</span>
                          <p className="text-xs text-muted-foreground mt-1">Signature area</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Footer */}
                  {footerText && (
                    <p className="text-xs text-muted-foreground pt-4 border-t border-border italic">{footerText}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Send Dialog */}
      {showSendDialog && (
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
                  <input readOnly value={sendingUrl} className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground" />
                  <button
                    onClick={() => { navigator.clipboard.writeText(sendingUrl); }}
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy link"
                  >
                    <span className="material-icons text-base">content_copy</span>
                  </button>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => { setShowSendDialog(false); setSendingUrl(''); }} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-foreground">Send Proposal</h3>
                <p className="text-sm text-muted-foreground">
                  This will mark the proposal as &quot;Sent&quot; and generate a unique link for your client.
                  {selectedContact?.email && (
                    <span className="block mt-1">
                      You can share the link with <strong>{selectedContact.firstName} {selectedContact.lastName}</strong> ({selectedContact.email}).
                    </span>
                  )}
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowSendDialog(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSend} disabled={sending} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
                    {sending ? 'Sending...' : 'Send Now'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-foreground">Delete Proposal</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete &quot;{title}&quot;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteDialog(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 bg-destructive text-white rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save as Template Dialog */}
      {showTemplateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-foreground">Save as Template</h3>
            <p className="text-sm text-muted-foreground">
              Save the current sections, line items, and fees as a reusable template.
            </p>
            <form onSubmit={handleSaveTemplate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Template Name *</label>
                <input
                  required
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="e.g. Standard Web Design Proposal"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowTemplateDialog(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={savingTemplate} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {savingTemplate ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
