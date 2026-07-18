'use client';

import { useState, useEffect } from 'react';

interface DnsInstruction {
  type: 'A' | 'CNAME' | 'TXT' | 'MX';
  host: string;
  value: string;
  ttl?: string;
  notes?: string;
}

interface HostedSite {
  id: number;
  clientId: number;
  name: string;
  customDomain: string | null;
  railwayProjectId: string | null;
  railwayServiceId: string | null;
  railwayEnvironmentId: string | null;
  railwayDomain: string | null;
  status: string;
  plan: string;
  renewalDate: string | null;
  notes: string | null;
  dnsInstructions: DnsInstruction[];
  createdAt: string;
  clientCompany: string | null;
  clientUserName: string;
  clientUserEmail: string;
}

interface ClientOption {
  id: number;
  company: string | null;
  userName: string;
  userEmail: string;
}

const statusColor: Record<string, string> = {
  provisioning: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-700',
};
const statusIcon: Record<string, string> = {
  provisioning: 'hourglass_empty',
  active: 'check_circle',
  suspended: 'pause_circle',
  cancelled: 'cancel',
};
const planLabel: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};
const planColor: Record<string, string> = {
  starter: 'bg-gray-100 text-gray-700',
  pro: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
};

const emptyForm = {
  clientId: '',
  name: '',
  customDomain: '',
  railwayProjectId: '',
  railwayServiceId: '',
  railwayEnvironmentId: '',
  railwayDomain: '',
  status: 'provisioning',
  plan: 'starter',
  renewalDate: '',
  notes: '',
};

const emptyDns: DnsInstruction = { type: 'CNAME', host: 'www', value: '', ttl: 'Auto', notes: '' };

export default function AdminPortalHostingPage() {
  const [sites, setSites] = useState<HostedSite[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editSite, setEditSite] = useState<HostedSite | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [dnsRows, setDnsRows] = useState<DnsInstruction[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [detailSite, setDetailSite] = useState<HostedSite | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/portal/hosting').then(r => r.json()),
      fetch('/api/admin/portal/clients').then(r => r.json()),
    ]).then(([hostsRes, clientsRes]) => {
      if (hostsRes.success) setSites(hostsRes.data);
      if (clientsRes.success) {
        setClients(clientsRes.data.map((c: { id: number; company: string | null; userName: string; userEmail: string }) => ({
          id: c.id, company: c.company, userName: c.userName, userEmail: c.userEmail,
        })));
      }
      setLoading(false);
    });
  }, []);

  const filtered = sites.filter(s => {
    const matchSearch = !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.customDomain || '').toLowerCase().includes(search.toLowerCase()) ||
      s.clientUserName.toLowerCase().includes(search.toLowerCase()) ||
      (s.clientCompany || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openCreate = () => {
    setEditSite(null);
    setForm(emptyForm);
    setDnsRows([]);
    setError('');
    setShowForm(true);
  };

  const openEdit = (site: HostedSite) => {
    setEditSite(site);
    setForm({
      clientId: String(site.clientId),
      name: site.name,
      customDomain: site.customDomain || '',
      railwayProjectId: site.railwayProjectId || '',
      railwayServiceId: site.railwayServiceId || '',
      railwayEnvironmentId: site.railwayEnvironmentId || '',
      railwayDomain: site.railwayDomain || '',
      status: site.status,
      plan: site.plan,
      renewalDate: site.renewalDate ? site.renewalDate.split('T')[0] : '',
      notes: site.notes || '',
    });
    setDnsRows(site.dnsInstructions || []);
    setError('');
    setShowForm(true);
    setDetailSite(null);
  };

  const handleSave = async () => {
    if (!form.name || !form.clientId) { setError('Client and site name are required.'); return; }
    setSaving(true); setError('');
    const payload = { ...form, dnsInstructions: dnsRows };
    const url = editSite ? `/api/admin/portal/hosting/${editSite.id}` : '/api/admin/portal/hosting';
    const method = editSite ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message || 'Save failed'); return; }
    if (editSite) {
      setSites(prev => prev.map(s => s.id === editSite.id ? { ...s, ...data.data } : s));
    } else {
      const newSite = { ...data.data, clientCompany: clients.find(c => c.id === parseInt(form.clientId))?.company || null, clientUserName: clients.find(c => c.id === parseInt(form.clientId))?.userName || '', clientUserEmail: clients.find(c => c.id === parseInt(form.clientId))?.userEmail || '' };
      setSites(prev => [...prev, newSite]);
    }
    setShowForm(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/admin/portal/hosting/${deleteId}`, { method: 'DELETE' });
    setSites(prev => prev.filter(s => s.id !== deleteId));
    setDeleteId(null);
    if (detailSite?.id === deleteId) setDetailSite(null);
  };

  const addDnsRow = () => setDnsRows(prev => [...prev, { ...emptyDns }]);
  const removeDnsRow = (i: number) => setDnsRows(prev => prev.filter((_, idx) => idx !== i));
  const updateDnsRow = (i: number, field: keyof DnsInstruction, value: string) => {
    setDnsRows(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  };

  const clientLabel = (c: ClientOption) => c.company ? `${c.company} (${c.userName})` : c.userName;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-icons animate-spin text-primary text-3xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hosting</h1>
          <p className="text-muted-foreground text-sm mt-1">Managed Railway hosting sold to clients.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">add</span>
          Add Hosted Site
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(['provisioning', 'active', 'suspended', 'cancelled'] as const).map(st => (
          <div key={st} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2">
              <span className={`material-icons text-lg ${st === 'active' ? 'text-green-500' : st === 'provisioning' ? 'text-yellow-500' : st === 'suspended' ? 'text-orange-500' : 'text-red-500'}`}>
                {statusIcon[st]}
              </span>
              <span className="text-xs text-muted-foreground capitalize">{st}</span>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">
              {sites.filter(s => s.status === st).length}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg flex-1 min-w-48">
          <span className="material-icons text-muted-foreground text-base">search</span>
          <input
            className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground"
            placeholder="Search sites, domains, clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground outline-none"
        >
          <option value="">All statuses</option>
          <option value="provisioning">Provisioning</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Sites table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <span className="material-icons text-4xl mb-2">cloud_off</span>
            <p className="text-sm">{search || statusFilter ? 'No sites match your filters.' : 'No hosted sites yet. Add one to get started.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Site</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Domain</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Renewal</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(site => (
                <tr key={site.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDetailSite(site)}
                      className="font-medium text-foreground hover:text-primary transition-colors text-left"
                    >
                      {site.name}
                    </button>
                    {site.railwayDomain && (
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate max-w-48">{site.railwayDomain}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-foreground">{site.clientCompany || site.clientUserName}</p>
                    <p className="text-xs text-muted-foreground">{site.clientUserEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    {site.customDomain ? (
                      <span className="font-mono text-xs text-foreground">{site.customDomain}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not configured</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${planColor[site.plan] || 'bg-gray-100 text-gray-700'}`}>
                      {planLabel[site.plan] || site.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[site.status] || 'bg-gray-100 text-gray-700'}`}>
                      <span className="material-icons text-xs">{statusIcon[site.status] || 'help'}</span>
                      {site.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {site.renewalDate ? new Date(site.renewalDate).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(site)} className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" title="Edit">
                        <span className="material-icons text-base">edit</span>
                      </button>
                      <button onClick={() => setDeleteId(site.id)} className="p-1.5 rounded hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600" title="Delete">
                        <span className="material-icons text-base">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {detailSite && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDetailSite(null)} />
          <div className="w-full max-w-lg bg-card border-l border-border h-full overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="font-semibold text-foreground">{detailSite.name}</h2>
                <p className="text-xs text-muted-foreground">{detailSite.clientCompany || detailSite.clientUserName}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(detailSite)} className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground">
                  <span className="material-icons text-base">edit</span>
                </button>
                <button onClick={() => setDetailSite(null)} className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground">
                  <span className="material-icons text-base">close</span>
                </button>
              </div>
            </div>
            <div className="p-4 space-y-5 flex-1">
              {/* Status / Plan */}
              <div className="flex gap-2">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusColor[detailSite.status]}`}>
                  <span className="material-icons text-xs">{statusIcon[detailSite.status]}</span>
                  {detailSite.status}
                </span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${planColor[detailSite.plan]}`}>
                  {planLabel[detailSite.plan]} Plan
                </span>
              </div>

              {/* Domain Info */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Domain</h3>
                <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                  {detailSite.customDomain && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Custom Domain</span>
                      <span className="font-mono text-foreground">{detailSite.customDomain}</span>
                    </div>
                  )}
                  {detailSite.railwayDomain && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Railway URL</span>
                      <span className="font-mono text-xs text-foreground">{detailSite.railwayDomain}</span>
                    </div>
                  )}
                  {!detailSite.customDomain && !detailSite.railwayDomain && (
                    <p className="text-sm text-muted-foreground">No domain configured.</p>
                  )}
                </div>
              </div>

              {/* Railway IDs */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Railway</h3>
                <div className="bg-muted/30 rounded-lg p-3 space-y-1 font-mono text-xs">
                  {detailSite.railwayProjectId && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Project ID</span>
                      <span className="text-foreground truncate">{detailSite.railwayProjectId}</span>
                    </div>
                  )}
                  {detailSite.railwayServiceId && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Service ID</span>
                      <span className="text-foreground truncate">{detailSite.railwayServiceId}</span>
                    </div>
                  )}
                  {detailSite.railwayEnvironmentId && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Env ID</span>
                      <span className="text-foreground truncate">{detailSite.railwayEnvironmentId}</span>
                    </div>
                  )}
                  {!detailSite.railwayProjectId && !detailSite.railwayServiceId && (
                    <p className="text-muted-foreground">No Railway IDs linked.</p>
                  )}
                </div>
              </div>

              {/* DNS Instructions */}
              {detailSite.dnsInstructions && detailSite.dnsInstructions.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">DNS Records</h3>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Host</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Value</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">TTL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailSite.dnsInstructions.map((r, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 font-semibold text-primary">{r.type}</td>
                            <td className="px-3 py-2 font-mono">{r.host}</td>
                            <td className="px-3 py-2 font-mono truncate max-w-[120px]">{r.value}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.ttl || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Notes */}
              {detailSite.notes && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</h3>
                  <p className="text-sm text-foreground bg-muted/30 rounded-lg p-3">{detailSite.notes}</p>
                </div>
              )}

              {/* Renewal */}
              {detailSite.renewalDate && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="material-icons text-base text-muted-foreground">calendar_today</span>
                  <span className="text-muted-foreground">Renews</span>
                  <span className="text-foreground font-medium">{new Date(detailSite.renewalDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-border">
              <button
                onClick={() => setDeleteId(detailSite.id)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors w-full"
              >
                <span className="material-icons text-base">delete</span>
                Delete Site
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-8">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl mx-4 shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{editSite ? 'Edit Hosted Site' : 'Add Hosted Site'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground">
                <span className="material-icons text-base">close</span>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <span className="material-icons text-base">error</span>
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Client */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Client *</label>
                  <select
                    value={form.clientId}
                    onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
                    disabled={!!editSite}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
                  >
                    <option value="">Select a client...</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{clientLabel(c)}</option>
                    ))}
                  </select>
                </div>

                {/* Name */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Site Name *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Acme Corp E-commerce"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>

                {/* Status / Plan */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="provisioning">Provisioning</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Plan</label>
                  <select
                    value={form.plan}
                    onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>

                {/* Custom Domain */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Custom Domain</label>
                  <input
                    value={form.customDomain}
                    onChange={e => setForm(f => ({ ...f, customDomain: e.target.value }))}
                    placeholder="shop.client.com"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono outline-none focus:border-primary"
                  />
                </div>

                {/* Railway Domain */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Railway URL</label>
                  <input
                    value={form.railwayDomain}
                    onChange={e => setForm(f => ({ ...f, railwayDomain: e.target.value }))}
                    placeholder="xxx.up.railway.app"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono outline-none focus:border-primary"
                  />
                </div>

                {/* Railway IDs */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Railway Project ID</label>
                  <input
                    value={form.railwayProjectId}
                    onChange={e => setForm(f => ({ ...f, railwayProjectId: e.target.value }))}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground font-mono outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Railway Service ID</label>
                  <input
                    value={form.railwayServiceId}
                    onChange={e => setForm(f => ({ ...f, railwayServiceId: e.target.value }))}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground font-mono outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Railway Environment ID</label>
                  <input
                    value={form.railwayEnvironmentId}
                    onChange={e => setForm(f => ({ ...f, railwayEnvironmentId: e.target.value }))}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground font-mono outline-none focus:border-primary"
                  />
                </div>

                {/* Renewal Date */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Renewal Date</label>
                  <input
                    type="date"
                    value={form.renewalDate}
                    onChange={e => setForm(f => ({ ...f, renewalDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Internal Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Internal notes visible to staff only..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary resize-none"
                />
              </div>

              {/* DNS Instructions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted-foreground">DNS Records (shown to client)</label>
                  <button
                    onClick={addDnsRow}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <span className="material-icons text-sm">add</span>
                    Add record
                  </button>
                </div>
                {dnsRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 text-center">No DNS records added. Click &quot;Add record&quot; to add one.</p>
                ) : (
                  <div className="space-y-2">
                    {dnsRows.map((row, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <select
                          value={row.type}
                          onChange={e => updateDnsRow(i, 'type', e.target.value)}
                          className="w-20 shrink-0 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground outline-none"
                        >
                          <option>A</option>
                          <option>CNAME</option>
                          <option>TXT</option>
                          <option>MX</option>
                        </select>
                        <input
                          value={row.host}
                          onChange={e => updateDnsRow(i, 'host', e.target.value)}
                          placeholder="Host (e.g. @)"
                          className="w-24 shrink-0 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono outline-none"
                        />
                        <input
                          value={row.value}
                          onChange={e => updateDnsRow(i, 'value', e.target.value)}
                          placeholder="Value / points to"
                          className="flex-1 min-w-0 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono outline-none"
                        />
                        <input
                          value={row.ttl || ''}
                          onChange={e => updateDnsRow(i, 'ttl', e.target.value)}
                          placeholder="TTL"
                          className="w-16 shrink-0 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground outline-none"
                        />
                        <button onClick={() => removeDnsRow(i)} className="shrink-0 p-1.5 text-muted-foreground hover:text-red-600 transition-colors">
                          <span className="material-icons text-base">remove_circle_outline</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving && <span className="material-icons text-base animate-spin">refresh</span>}
                {editSite ? 'Save Changes' : 'Add Site'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="material-icons text-red-500 text-2xl">warning</span>
              <h2 className="font-semibold text-foreground">Delete hosted site?</h2>
            </div>
            <p className="text-sm text-muted-foreground">This will permanently remove the site record. The actual Railway project is not affected.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
