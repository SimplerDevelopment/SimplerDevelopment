'use client';

// E2 perf — interactive wrapper for the admin/clients RSC page. The server
// passes `initialClients`; this component owns search/filter state and the
// create form. After a successful create, it re-fetches via the API route.

import { useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/portal-utils';

interface Client {
  id: number;
  userId: number;
  company: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
  userActive: boolean;
  activeServices: number;
  websiteCount: number;
  activeProjects: number;
  openTickets: number;
  totalRevenue: number;
  mrr: number;
}

export function AdminClientsView({ initialClients }: { initialClients: Client[] }) {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '', phone: '', website: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = clients.filter(c => {
    if (statusFilter === 'active' && !c.userActive) return false;
    if (statusFilter === 'inactive' && c.userActive) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return c.userName.toLowerCase().includes(s) ||
      c.userEmail.toLowerCase().includes(s) ||
      (c.company || '').toLowerCase().includes(s);
  });

  const totalMrr = clients.filter(c => c.userActive).reduce((s, c) => s + c.mrr, 0);
  const totalRevenue = clients.reduce((s, c) => s + c.totalRevenue, 0);
  const activeCount = clients.filter(c => c.userActive).length;

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/admin/portal/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message ?? 'Failed'); return; }
    // Reload to get full enriched data
    const refreshRes = await fetch('/api/admin/portal/clients');
    const refreshData = await refreshRes.json();
    setClients(refreshData.data ?? []);
    setShowForm(false);
    setForm({ name: '', email: '', password: '', company: '', phone: '', website: '', notes: '' });
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage client accounts, services, and portal access.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">add</span>
          New Client
        </button>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon="business" label="Active Clients" value={String(activeCount)} sub={`${clients.length} total`} />
        <SummaryCard icon="trending_up" label="Total MRR" value={formatCents(totalMrr)} iconColor="text-green-600" />
        <SummaryCard icon="payments" label="Lifetime Revenue" value={formatCents(totalRevenue)} iconColor="text-blue-600" />
        <SummaryCard icon="support_agent" label="Open Tickets" value={String(clients.reduce((s, c) => s + c.openTickets, 0))} iconColor="text-orange-600" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg flex-1 max-w-sm">
          <span className="material-icons text-muted-foreground text-base">search</span>
          <input
            className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                statusFilter === s ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Create Client Account</h2>
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center gap-2">
              <span className="material-icons text-base">error_outline</span>{error}
            </div>
          )}
          <form onSubmit={createClient} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name <span className="text-destructive">*</span></label>
              <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email <span className="text-destructive">*</span></label>
              <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Password <span className="text-destructive">*</span></label>
              <input type="password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Company</label>
              <input type="text" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Website</label>
              <input type="url" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1">Internal Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? <><span className="material-icons text-base animate-spin">refresh</span>Saving...</> : 'Create Client'}
              </button>
            </div>
          </form>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">group</span>
          <h3 className="mt-4 font-semibold text-foreground">{search ? 'No matching clients' : 'No clients yet'}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {search ? 'Try a different search term.' : 'Create your first client account above.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Services</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Sites</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Projects</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Tickets</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">MRR</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(client => (
                  <tr key={client.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{client.userName}</p>
                      <p className="text-xs text-muted-foreground">{client.userEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{client.company ?? '--'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        client.userActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        <span className="material-icons text-xs">{client.userActive ? 'check_circle' : 'cancel'}</span>
                        {client.userActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {client.activeServices > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                          {client.activeServices}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-foreground">{client.websiteCount}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-foreground">{client.activeProjects}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {client.openTickets > 0 ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                          {client.openTickets}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-mono font-medium ${client.mrr > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {client.mrr > 0 ? formatCents(client.mrr) : '--'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs font-mono text-foreground">
                        {client.totalRevenue > 0 ? formatCents(client.totalRevenue) : '--'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(client.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <span className="material-icons text-sm">open_in_new</span>
                        Manage
                      </Link>
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

function SummaryCard({ icon, label, value, sub, iconColor }: {
  icon: string; label: string; value: string; sub?: string; iconColor?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={`material-icons text-base ${iconColor || 'text-muted-foreground'}`}>{icon}</span>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
