'use client';

// E2 perf — interactive wrapper for the admin/clients RSC page. The server
// passes `initialClients`; this component owns search/filter state and the
// create form. After a successful create, it re-fetches via the API route.

import { useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/portal-utils';
import {
  PageHeader, Button, Stat, Panel, Badge, StatusDot,
  Segmented, SearchField, DataTable, EmptyState, type Column,
} from '@/components/admin/ui';

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

type StatusFilter = 'all' | 'active' | 'inactive';

const LOGO_COLORS = ['#0070f3', '#7928ca', '#15803d', '#f5a623', '#dc2626', '#0891b2', '#9333ea'];
const logoColor = (id: number) => LOGO_COLORS[id % LOGO_COLORS.length];
const initial = (c: Client) => (c.company || c.userName || '?').trim().charAt(0).toUpperCase();

const inputCls =
  'w-full px-3 py-2 rounded-[5px] border border-border bg-background text-[13.5px] text-foreground outline-none focus:border-[var(--admin-accent)] focus:ring-[3px] focus:ring-[var(--admin-accent-glow)] transition-colors placeholder:text-muted-foreground';

export function AdminClientsView({ initialClients }: { initialClients: Client[] }) {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '', phone: '', website: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = clients.filter((c) => {
    if (statusFilter === 'active' && !c.userActive) return false;
    if (statusFilter === 'inactive' && c.userActive) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return c.userName.toLowerCase().includes(s) || c.userEmail.toLowerCase().includes(s) || (c.company || '').toLowerCase().includes(s);
  });

  const activeCount = clients.filter((c) => c.userActive).length;
  const totalMrr = clients.filter((c) => c.userActive).reduce((s, c) => s + c.mrr, 0);
  const totalRevenue = clients.reduce((s, c) => s + c.totalRevenue, 0);
  const openTickets = clients.reduce((s, c) => s + c.openTickets, 0);

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
    const refreshRes = await fetch('/api/admin/portal/clients');
    const refreshData = await refreshRes.json();
    setClients(refreshData.data ?? []);
    setShowForm(false);
    setForm({ name: '', email: '', password: '', company: '', phone: '', website: '', notes: '' });
  }

  const num = (n: number) => <span className="font-mono tabular-nums">{n}</span>;

  const columns: Array<Column<Client>> = [
    {
      key: 'client', header: 'Client',
      render: (c) => (
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-[7px] grid place-items-center text-white font-mono font-semibold text-[13px] shrink-0" style={{ background: logoColor(c.id) }}>{initial(c)}</span>
          <div className="min-w-0">
            <Link href={`/admin/clients/${c.id}`} className="font-medium text-foreground hover:text-[var(--admin-accent)] transition-colors truncate block">{c.userName}</Link>
            <div className="text-[12px] text-muted-foreground truncate">{c.userEmail}</div>
          </div>
        </div>
      ),
    },
    { key: 'company', header: 'Company', render: (c) => <span className="text-muted-foreground">{c.company ?? '—'}</span> },
    {
      key: 'status', header: 'Status',
      render: (c) => (
        <span className="inline-flex items-center gap-2 text-[12.5px]">
          <StatusDot tone={c.userActive ? 'ok' : 'neutral'} />
          {c.userActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    { key: 'services', header: 'Services', align: 'center', render: (c) => num(c.activeServices) },
    { key: 'sites', header: 'Sites', align: 'center', render: (c) => num(c.websiteCount) },
    { key: 'projects', header: 'Projects', align: 'center', render: (c) => num(c.activeProjects) },
    {
      key: 'tickets', header: 'Tickets', align: 'center',
      render: (c) => c.openTickets > 0
        ? <Badge tone="bad"><span className="font-mono">{c.openTickets}</span></Badge>
        : <span className="font-mono tabular-nums text-muted-foreground">0</span>,
    },
    { key: 'mrr', header: 'MRR', align: 'right', render: (c) => <span className={`font-mono tabular-nums ${c.mrr > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{c.mrr > 0 ? formatCents(c.mrr) : '—'}</span> },
    { key: 'revenue', header: 'Revenue', align: 'right', render: (c) => <span className="font-mono tabular-nums text-foreground">{c.totalRevenue > 0 ? formatCents(c.totalRevenue) : '—'}</span> },
    { key: 'joined', header: 'Joined', align: 'right', render: (c) => <span className="font-mono text-[12px] text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span> },
    { key: 'go', header: '', align: 'right', render: (c) => <Link href={`/admin/clients/${c.id}`} className="text-muted-foreground hover:text-foreground"><span className="material-icons text-[18px] align-middle">chevron_right</span></Link> },
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader title="Clients" subtitle="Every tenant across the platform.">
        <Button variant="primary" icon="add" onClick={() => setShowForm((v) => !v)}>New client</Button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon="business" label="Active clients" value={activeCount} sub={`${clients.length} total`} />
        <Stat icon="trending_up" label="Total MRR" value={formatCents(totalMrr)} />
        <Stat icon="payments" label="Lifetime revenue" value={formatCents(totalRevenue)} />
        <Stat icon="support_agent" label="Open tickets" value={openTickets} tone={openTickets > 0 ? 'bad' : undefined} />
      </div>

      <div className="flex items-center gap-3 flex-wrap mt-4 mb-3">
        <Segmented<StatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'All', count: clients.length },
            { value: 'active', label: 'Active', count: activeCount },
            { value: 'inactive', label: 'Inactive', count: clients.length - activeCount },
          ]}
        />
        <SearchField value={search} onChange={setSearch} placeholder="Filter clients…" className="min-w-[220px]" />
        <span className="ml-auto text-xs text-muted-foreground font-mono">{filtered.length} shown</span>
      </div>

      {showForm && (
        <div className="mb-3">
          <Panel title="Create client account">
            <form onSubmit={createClient} className="p-4">
              {error && (
                <div className="mb-4 p-3 rounded-[5px] text-[13px] flex items-center gap-2" style={{ color: 'var(--admin-bad)', background: 'var(--admin-bad-bg)' }}>
                  <span className="material-icons text-base">error_outline</span>{error}
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Name" required><input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
                <Field label="Email" required><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></Field>
                <Field label="Password" required><input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} /></Field>
                <Field label="Company"><input type="text" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={inputCls} /></Field>
                <Field label="Phone"><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
                <Field label="Website"><input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className={inputCls} /></Field>
                <div className="sm:col-span-2">
                  <Field label="Internal notes"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inputCls} resize-none`} /></Field>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" variant="primary" icon={saving ? 'hourglass_empty' : 'check'} disabled={saving}>{saving ? 'Saving…' : 'Create client'}</Button>
              </div>
            </form>
          </Panel>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(c) => c.id}
        empty={
          <EmptyState
            icon="business"
            title={search ? 'No matching clients' : 'No clients yet'}
            message={search ? 'Try a different search term.' : 'When you onboard your first tenant, they’ll show up here.'}
            action={!search ? <Button variant="primary" icon="add" onClick={() => setShowForm(true)}>New client</Button> : undefined}
          />
        }
      />
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] font-medium text-foreground">{label}{required && <span className="text-[var(--admin-bad)]"> *</span>}</label>
      {children}
    </div>
  );
}
