'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MediaPicker from '@/components/admin/MediaPicker';
import { formatMoney } from '@/lib/utils/money';
import CrmCustomFieldsPanel, { type CrmCustomFieldsPanelHandle } from '@/components/portal/CrmCustomFieldsPanel';
import PositionMultiSelect from '@/components/portal/PositionMultiSelect';

interface Company {
  id: number;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  logoUrl: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  notes: string | null;
  createdAt: string;
}

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  status: string;
}

interface Deal {
  id: number;
  title: string;
  value: number;
  stageName: string;
  status: string;
  contactName: string | null;
  expectedCloseDate: string | null;
}

interface PipelineStage {
  id: number;
  name: string;
  order: number;
}

interface Pipeline {
  id: number;
  name: string;
  stages: PipelineStage[];
}

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

const sizeOptions = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'];

const CONTACTS_PAGE_SIZE = 10;

export default function CrmCompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactTotal, setContactTotal] = useState(0);
  const [contactPage, setContactPage] = useState(1);
  const [contactSearch, setContactSearch] = useState('');
  const [contactSearchInput, setContactSearchInput] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [titleFilter, setTitleFilter] = useState<string[]>([]);
  const [availableTitles, setAvailableTitles] = useState<string[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'contacts' | 'deals'>('info');

  const [showContactForm, setShowContactForm] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState('');
  const [newContact, setNewContact] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    title: '',
    status: 'active',
  });

  const [showDealForm, setShowDealForm] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const [dealError, setDealError] = useState('');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [newDeal, setNewDeal] = useState({
    title: '',
    value: '',
    pipelineId: '',
    stageId: '',
    priority: 'medium',
    expectedCloseDate: '',
    notes: '',
  });

  const customFieldsRef = useRef<CrmCustomFieldsPanelHandle>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    domain: '',
    industry: '',
    size: '',
    phone: '',
    website: '',
    address: '',
    latitude: '',
    longitude: '',
    logoUrl: '',
    notes: '',
  });

  const fetchCompany = useCallback(async () => {
    const res = await fetch(`/api/portal/crm/companies/${companyId}`);
    const d = await res.json();
    if (d.success && d.data) {
      const co = d.data.company ?? d.data;
      setCompany(co);
      setDeals(d.data.deals ?? []);
    }
  }, [companyId]);

  useEffect(() => {
    fetchCompany().then(() => setLoading(false));
  }, [fetchCompany]);

  // Contacts are driven by the paginated /api/portal/crm/contacts endpoint so
  // we can search and page through companies with many contacts.
  const fetchContacts = useCallback(async () => {
    setContactsLoading(true);
    const params = new URLSearchParams({
      companyId: String(companyId),
      page: String(contactPage),
      limit: String(CONTACTS_PAGE_SIZE),
    });
    if (contactSearch) params.set('search', contactSearch);
    if (titleFilter.length > 0) params.set('title', titleFilter.join(','));
    const res = await fetch(`/api/portal/crm/contacts?${params}`);
    const d = await res.json();
    if (d.success && d.data) {
      setContacts(d.data.contacts ?? []);
      setContactTotal(d.data.total ?? 0);
    }
    setContactsLoading(false);
  }, [companyId, contactPage, contactSearch, titleFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    fetch(`/api/portal/crm/contacts/titles?companyId=${companyId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setAvailableTitles(d.data ?? []); })
      .catch(() => {});
  }, [companyId]);

  useEffect(() => {
    const t = setTimeout(() => {
      setContactSearch(contactSearchInput);
      setContactPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [contactSearchInput]);

  function startEditing() {
    if (!company) return;
    setActiveTab('info');
    setEditForm({
      name: company.name,
      domain: company.domain ?? '',
      industry: company.industry ?? '',
      size: company.size ?? '',
      phone: company.phone ?? '',
      website: company.website ?? '',
      address: company.address ?? '',
      latitude: company.latitude !== null && company.latitude !== undefined ? String(company.latitude) : '',
      longitude: company.longitude !== null && company.longitude !== undefined ? String(company.longitude) : '',
      logoUrl: company.logoUrl ?? '',
      notes: company.notes ?? '',
    });
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: editForm.name,
      domain: editForm.domain,
      industry: editForm.industry,
      size: editForm.size,
      phone: editForm.phone,
      website: editForm.website,
      address: editForm.address,
      logoUrl: editForm.logoUrl,
      notes: editForm.notes,
    };
    // Only forward lat/lng if the user typed something. An empty string means
    // "leave unset and let the server auto-derive from the address".
    if (editForm.latitude.trim() !== '') payload.latitude = editForm.latitude.trim();
    if (editForm.longitude.trim() !== '') payload.longitude = editForm.longitude.trim();

    const res = await fetch(`/api/portal/crm/companies/${companyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!d.success) {
      setSaving(false);
      return;
    }
    const cfOk = await (customFieldsRef.current?.save() ?? Promise.resolve(true));
    setSaving(false);
    if (!cfOk) return;
    await fetchCompany();
    setEditing(false);
  }

  function cancelEdit() {
    customFieldsRef.current?.reload();
    setEditing(false);
  }

  async function deleteCompany() {
    if (!confirm('Are you sure you want to delete this company?')) return;
    await fetch(`/api/portal/crm/companies/${companyId}`, { method: 'DELETE' });
    router.push('/portal/crm/companies');
  }

  async function openDealForm() {
    setDealError('');
    setShowDealForm(true);
    if (pipelines.length > 0) return;
    const res = await fetch('/api/portal/crm/pipelines');
    const d = await res.json();
    const list: Pipeline[] = d.data ?? [];
    setPipelines(list);
    if (list.length > 0) {
      const first = list[0];
      const firstStage = [...(first.stages ?? [])].sort((a, b) => a.order - b.order)[0];
      setNewDeal(f => ({ ...f, pipelineId: String(first.id), stageId: firstStage ? String(firstStage.id) : '' }));
    }
  }

  async function createContact(e: React.FormEvent) {
    e.preventDefault();
    setSavingContact(true);
    setContactError('');
    const res = await fetch('/api/portal/crm/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: Number(companyId),
        firstName: newContact.firstName,
        lastName: newContact.lastName || null,
        email: newContact.email || null,
        phone: newContact.phone || null,
        title: newContact.title || null,
        status: newContact.status,
      }),
    });
    const d = await res.json();
    setSavingContact(false);
    if (!d.success) {
      setContactError(d.message ?? 'Failed to create contact.');
      return;
    }
    setShowContactForm(false);
    setNewContact({ firstName: '', lastName: '', email: '', phone: '', title: '', status: 'active' });
    setContactPage(1);
    fetchContacts();
  }

  async function createDeal(e: React.FormEvent) {
    e.preventDefault();
    setSavingDeal(true);
    setDealError('');
    const valueCents = newDeal.value.trim() === '' ? null : Math.round(parseFloat(newDeal.value) * 100);
    const res = await fetch('/api/portal/crm/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: Number(companyId),
        title: newDeal.title,
        value: valueCents,
        pipelineId: newDeal.pipelineId ? Number(newDeal.pipelineId) : null,
        stageId: newDeal.stageId ? Number(newDeal.stageId) : null,
        priority: newDeal.priority,
        expectedCloseDate: newDeal.expectedCloseDate || null,
        notes: newDeal.notes || null,
      }),
    });
    const d = await res.json();
    setSavingDeal(false);
    if (!d.success) {
      setDealError(d.message ?? 'Failed to create deal.');
      return;
    }
    setShowDealForm(false);
    setNewDeal(f => ({ ...f, title: '', value: '', priority: 'medium', expectedCloseDate: '', notes: '' }));
    fetchCompany();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="text-center py-20">
        <span className="material-icons text-4xl text-muted-foreground">business</span>
        <p className="mt-2 text-muted-foreground">Company not found.</p>
        <Link href="/portal/crm/companies" className="text-primary text-sm hover:underline mt-2 inline-block">
          Back to companies
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/portal/crm/companies" className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-base">arrow_back</span>
          </Link>
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logoUrl}
              alt={`${company.name} logo`}
              className="w-12 h-12 rounded-lg object-contain bg-background border border-border"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-background border border-border flex items-center justify-center">
              <span className="material-icons text-muted-foreground">business</span>
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-foreground">{company.name}</h2>
              {company.size && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-accent text-foreground">
                  {company.size}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
              {company.domain && (
                <a href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                  <span className="material-icons text-sm">language</span>
                  {company.domain}
                </a>
              )}
              {company.industry && (
                <span className="flex items-center gap-1">
                  <span className="material-icons text-sm">category</span>
                  {company.industry}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
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
            onClick={deleteCompany}
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
          <h3 className="font-semibold text-foreground">Edit Company</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
              <input
                required
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Domain</label>
              <input
                value={editForm.domain}
                onChange={e => setEditForm(f => ({ ...f, domain: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Industry</label>
              <input
                value={editForm.industry}
                onChange={e => setEditForm(f => ({ ...f, industry: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Size</label>
              <select
                value={editForm.size}
                onChange={e => setEditForm(f => ({ ...f, size: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select size</option>
                {sizeOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
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
              <label className="block text-xs font-medium text-muted-foreground mb-1">Website</label>
              <input
                value={editForm.website}
                onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
              <textarea
                value={editForm.address}
                onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                rows={2}
                placeholder="123 Main St, City, State"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
              />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    value={editForm.latitude}
                    onChange={e => setEditForm(f => ({ ...f, latitude: e.target.value }))}
                    placeholder="e.g. 40.7128"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    value={editForm.longitude}
                    onChange={e => setEditForm(f => ({ ...f, longitude: e.target.value }))}
                    placeholder="e.g. -74.0060"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Auto-derived from address on save if left blank.</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <MediaPicker
                value={editForm.logoUrl}
                onChange={(url) => setEditForm(f => ({ ...f, logoUrl: url }))}
                label="Logo"
                mimeTypeFilter="image"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <MediaPicker
                value={editForm.logoUrl}
                onChange={(url) => setEditForm(f => ({ ...f, logoUrl: url }))}
                label="Logo"
                mimeTypeFilter="image"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
              <textarea
                value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={cancelEdit}
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

      {/* Tabs: Info / Contacts / Deals */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'info'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">info</span>
            Info
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'contacts'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">person</span>
            Contacts ({contactTotal})
          </button>
          <button
            onClick={() => setActiveTab('deals')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'deals'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">handshake</span>
            Deals ({deals.length})
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'info' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-foreground mb-4">Company Information</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <span className="material-icons text-base text-muted-foreground">phone</span>
                    <span className="text-sm text-foreground">{company.phone ?? 'No phone'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="material-icons text-base text-muted-foreground">language</span>
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                        {company.website}
                      </a>
                    ) : (
                      <span className="text-sm text-foreground">No website</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="material-icons text-base text-muted-foreground">location_on</span>
                    <span className="text-sm text-foreground">{company.address ?? 'No address'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="material-icons text-base text-muted-foreground">calendar_today</span>
                    <span className="text-sm text-muted-foreground">Added {new Date(company.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                {company.notes && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{company.notes}</p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border">
                <CrmCustomFieldsPanel
                  ref={customFieldsRef}
                  entityType="company"
                  entityId={Number(companyId)}
                  externalMode={editing ? 'edit' : 'view'}
                />
              </div>
            </div>
          )}

          {activeTab === 'contacts' && (() => {
            const totalPages = Math.max(1, Math.ceil(contactTotal / CONTACTS_PAGE_SIZE));
            return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <span className="material-icons text-base text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2">search</span>
                  <input
                    placeholder="Search contacts..."
                    value={contactSearchInput}
                    onChange={e => setContactSearchInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <PositionMultiSelect
                  options={availableTitles}
                  selected={titleFilter}
                  onChange={v => { setTitleFilter(v); setContactPage(1); }}
                />
                <button
                  onClick={() => setShowContactForm(v => !v)}
                  className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
                >
                  <span className="material-icons text-base">{showContactForm ? 'close' : 'person_add'}</span>
                  {showContactForm ? 'Cancel' : 'Add Contact'}
                </button>
              </div>

              {showContactForm && (
                <form onSubmit={createContact} className="bg-background border border-border rounded-lg p-4 space-y-3">
                  {contactError && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                      <span className="material-icons text-base">error</span>
                      {contactError}
                    </div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">First name *</label>
                      <input
                        required
                        value={newContact.firstName}
                        onChange={e => setNewContact(f => ({ ...f, firstName: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Last name</label>
                      <input
                        value={newContact.lastName}
                        onChange={e => setNewContact(f => ({ ...f, lastName: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                      <input
                        type="email"
                        value={newContact.email}
                        onChange={e => setNewContact(f => ({ ...f, email: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
                      <input
                        value={newContact.phone}
                        onChange={e => setNewContact(f => ({ ...f, phone: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
                      <input
                        value={newContact.title}
                        onChange={e => setNewContact(f => ({ ...f, title: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
                      <select
                        value={newContact.status}
                        onChange={e => setNewContact(f => ({ ...f, status: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="active">Active</option>
                        <option value="lead">Lead</option>
                        <option value="customer">Customer</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingContact}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {savingContact && <span className="material-icons animate-spin text-sm">refresh</span>}
                      Create Contact
                    </button>
                  </div>
                </form>
              )}

              {contactsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="material-icons animate-spin text-primary text-xl">refresh</span>
                </div>
              ) : contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {contactSearch || titleFilter.length > 0
                    ? 'No contacts match your filters.'
                    : 'No contacts at this company.'}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {contacts.map(c => (
                    <Link
                      key={c.id}
                      href={`/portal/crm/contacts/${c.id}`}
                      className="flex items-center justify-between py-3 hover:bg-accent -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.firstName} {c.lastName}</p>
                        <p className="text-xs text-muted-foreground">{c.title ?? c.email ?? ''}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[c.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {c.status}
                        </span>
                        <span className="material-icons text-base text-muted-foreground">chevron_right</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
                  <p className="text-xs text-muted-foreground">
                    Page {contactPage} of {totalPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={contactPage <= 1}
                      onClick={() => setContactPage(p => p - 1)}
                      className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="material-icons text-base">chevron_left</span>
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const start = Math.max(1, Math.min(contactPage - 2, totalPages - 4));
                      const p = start + i;
                      if (p > totalPages) return null;
                      return (
                        <button
                          key={p}
                          onClick={() => setContactPage(p)}
                          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                            p === contactPage
                              ? 'bg-primary text-primary-foreground'
                              : 'border border-border hover:bg-accent'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    <button
                      disabled={contactPage >= totalPages}
                      onClick={() => setContactPage(p => p + 1)}
                      className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="material-icons text-base">chevron_right</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          {activeTab === 'deals' && (() => {
            const dealStages = pipelines.find(p => String(p.id) === newDeal.pipelineId)?.stages
              ?.slice().sort((a, b) => a.order - b.order) ?? [];
            return (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={() => { if (showDealForm) setShowDealForm(false); else openDealForm(); }}
                  className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <span className="material-icons text-base">{showDealForm ? 'close' : 'add'}</span>
                  {showDealForm ? 'Cancel' : 'Add Deal'}
                </button>
              </div>

              {showDealForm && (
                <form onSubmit={createDeal} className="bg-background border border-border rounded-lg p-4 space-y-3">
                  {dealError && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                      <span className="material-icons text-base">error</span>
                      {dealError}
                    </div>
                  )}
                  {pipelines.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No pipelines available. Create one in the Deals section first.
                    </p>
                  ) : (
                    <>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Title *</label>
                          <input
                            required
                            value={newDeal.title}
                            onChange={e => setNewDeal(f => ({ ...f, title: e.target.value }))}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Value (USD)</label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={newDeal.value}
                            onChange={e => setNewDeal(f => ({ ...f, value: e.target.value }))}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Expected close</label>
                          <input
                            type="date"
                            value={newDeal.expectedCloseDate}
                            onChange={e => setNewDeal(f => ({ ...f, expectedCloseDate: e.target.value }))}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Pipeline</label>
                          <select
                            value={newDeal.pipelineId}
                            onChange={e => {
                              const pid = e.target.value;
                              const firstStage = pipelines.find(p => String(p.id) === pid)?.stages
                                ?.slice().sort((a, b) => a.order - b.order)[0];
                              setNewDeal(f => ({ ...f, pipelineId: pid, stageId: firstStage ? String(firstStage.id) : '' }));
                            }}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            {pipelines.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Stage</label>
                          <select
                            value={newDeal.stageId}
                            onChange={e => setNewDeal(f => ({ ...f, stageId: e.target.value }))}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            {dealStages.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
                          <select
                            value={newDeal.priority}
                            onChange={e => setNewDeal(f => ({ ...f, priority: e.target.value }))}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                          <textarea
                            value={newDeal.notes}
                            onChange={e => setNewDeal(f => ({ ...f, notes: e.target.value }))}
                            rows={2}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={savingDeal || !newDeal.pipelineId || !newDeal.stageId}
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {savingDeal && <span className="material-icons animate-spin text-sm">refresh</span>}
                          Create Deal
                        </button>
                      </div>
                    </>
                  )}
                </form>
              )}

              {deals.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No deals with this company.</p>
              ) : (
                <div className="divide-y divide-border">
                  {deals.map(d => (
                    <div key={d.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{d.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{d.stageName}</span>
                          {d.contactName && (
                            <>
                              <span>-</span>
                              <span>{d.contactName}</span>
                            </>
                          )}
                          {d.expectedCloseDate && (
                            <>
                              <span>-</span>
                              <span>Close: {new Date(d.expectedCloseDate).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-foreground">{formatMoney(d.value)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dealStatusColor[d.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {d.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
