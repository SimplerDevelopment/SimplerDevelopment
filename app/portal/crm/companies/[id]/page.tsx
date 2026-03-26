'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Company {
  id: number;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
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

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function CrmCompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'contacts' | 'deals'>('contacts');

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
    notes: '',
  });

  const fetchCompany = useCallback(async () => {
    const res = await fetch(`/api/portal/crm/companies/${companyId}`);
    const d = await res.json();
    if (d.success && d.data) {
      const co = d.data.company ?? d.data;
      setCompany(co);
      setContacts(d.data.contacts ?? []);
      setDeals(d.data.deals ?? []);
    }
  }, [companyId]);

  useEffect(() => {
    fetchCompany().then(() => setLoading(false));
  }, [fetchCompany]);

  function startEditing() {
    if (!company) return;
    setEditForm({
      name: company.name,
      domain: company.domain ?? '',
      industry: company.industry ?? '',
      size: company.size ?? '',
      phone: company.phone ?? '',
      website: company.website ?? '',
      address: company.address ?? '',
      notes: company.notes ?? '',
    });
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/portal/crm/companies/${companyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) {
      await fetchCompany();
      setEditing(false);
    }
  }

  async function deleteCompany() {
    if (!confirm('Are you sure you want to delete this company?')) return;
    await fetch(`/api/portal/crm/companies/${companyId}`, { method: 'DELETE' });
    router.push('/portal/crm/companies');
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
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
              <input
                value={editForm.address}
                onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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

      {/* Company Info */}
      <div className="bg-card border border-border rounded-xl p-6">
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

      {/* Tabs: Contacts / Deals */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('contacts')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'contacts'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">person</span>
            Contacts ({contacts.length})
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
          {activeTab === 'contacts' && (
            <>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No contacts at this company.</p>
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
            </>
          )}

          {activeTab === 'deals' && (
            <>
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
                        <span className="text-sm font-semibold text-foreground">{formatCurrency(d.value)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dealStatusColor[d.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {d.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
