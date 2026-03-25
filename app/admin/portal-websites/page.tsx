'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ClientWebsite {
  id: number;
  clientId: number;
  name: string;
  domain: string | null;
  description: string | null;
  active: boolean;
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

const emptyForm = { clientId: '', name: '', domain: '', description: '' };

export default function AdminPortalWebsitesPage() {
  const [websites, setWebsites] = useState<ClientWebsite[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editSite, setEditSite] = useState<ClientWebsite | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/portal/websites').then(r => r.json()),
      fetch('/api/admin/portal/clients').then(r => r.json()),
    ]).then(([sitesRes, clientsRes]) => {
      if (sitesRes.success) setWebsites(sitesRes.data);
      if (clientsRes.success) setClients(clientsRes.data.map((c: ClientOption & { userName: string }) => ({
        id: c.id, company: c.company, userName: c.userName, userEmail: c.userEmail,
      })));
      setLoading(false);
    });
  }, []);

  const filtered = websites.filter(w =>
    !search ||
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    (w.domain || '').toLowerCase().includes(search.toLowerCase()) ||
    w.clientUserName.toLowerCase().includes(search.toLowerCase()) ||
    (w.clientCompany || '').toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditSite(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  };

  const openEdit = (site: ClientWebsite) => {
    setEditSite(site);
    setForm({ clientId: String(site.clientId), name: site.name, domain: site.domain || '', description: site.description || '' });
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.clientId || !form.name) { setError('Client and name are required.'); return; }
    setSaving(true); setError('');
    const url = editSite ? `/api/admin/portal/websites/${editSite.id}` : '/api/admin/portal/websites';
    const method = editSite ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message || 'Save failed'); return; }
    if (editSite) {
      setWebsites(prev => prev.map(w => w.id === editSite.id ? { ...w, ...data.data } : w));
    } else {
      const c = clients.find(c => c.id === parseInt(form.clientId));
      setWebsites(prev => [...prev, { ...data.data, clientCompany: c?.company || null, clientUserName: c?.userName || '', clientUserEmail: c?.userEmail || '' }]);
    }
    setShowForm(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/admin/portal/websites/${deleteId}`, { method: 'DELETE' });
    setWebsites(prev => prev.filter(w => w.id !== deleteId));
    setDeleteId(null);
  };

  const handleToggleActive = async (site: ClientWebsite) => {
    const res = await fetch(`/api/admin/portal/websites/${site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !site.active }),
    });
    const data = await res.json();
    if (data.success) setWebsites(prev => prev.map(w => w.id === site.id ? { ...w, active: !site.active } : w));
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Websites</h1>
          <p className="text-muted-foreground text-sm mt-1">Websites managed through the client portal CMS.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">add</span>
          Add Website
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg max-w-sm">
        <span className="material-icons text-muted-foreground text-base">search</span>
        <input
          className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground"
          placeholder="Search websites or clients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <span className="material-icons text-4xl mb-2">web</span>
            <p className="text-sm">{search ? 'No websites match your search.' : 'No client websites yet.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Website</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Domain</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(site => (
                <tr key={site.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{site.name}</p>
                    {site.description && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-48">{site.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-foreground">{site.clientCompany || site.clientUserName}</p>
                    <p className="text-xs text-muted-foreground">{site.clientUserEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    {site.domain ? (
                      <span className="font-mono text-xs text-foreground">{site.domain}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggleActive(site)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${site.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      <span className="material-icons text-xs">{site.active ? 'check_circle' : 'cancel'}</span>
                      {site.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(site.createdAt).toLocaleDateString()}
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

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg mx-4 shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{editSite ? 'Edit Website' : 'Add Website'}</h2>
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
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Client *</label>
                <select
                  value={form.clientId}
                  onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
                  disabled={!!editSite}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
                >
                  <option value="">Select a client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Website Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Acme Corp Main Site"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Domain</label>
                <input
                  value={form.domain}
                  onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                  placeholder="www.acmecorp.com"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {saving && <span className="material-icons text-base animate-spin">refresh</span>}
                {editSite ? 'Save Changes' : 'Add Website'}
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
              <h2 className="font-semibold text-foreground">Delete website?</h2>
            </div>
            <p className="text-sm text-muted-foreground">This will delete the website record. All posts belonging to this website will lose their website association.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
