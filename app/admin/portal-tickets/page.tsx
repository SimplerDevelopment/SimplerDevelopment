'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ticketStatusColor, priorityColor } from '@/lib/portal-utils';

interface Ticket {
  id: number;
  number: number;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  company: string | null;
  clientName: string;
  assignedToName: string | null;
}

const STATUS_OPTIONS = ['all', 'open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;
const PRIORITY_OPTIONS = ['all', 'urgent', 'high', 'medium', 'low'] as const;

export default function AdminPortalTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/admin/portal/tickets')
      .then(r => r.json())
      .then(d => { setTickets(d.data ?? []); setLoading(false); });
  }, []);

  const filtered = tickets.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return t.subject.toLowerCase().includes(s) ||
        (t.company || '').toLowerCase().includes(s) ||
        t.clientName.toLowerCase().includes(s) ||
        String(t.number).includes(s);
    }
    return true;
  });

  const openCount = tickets.filter(t => t.status === 'open').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
  const urgentCount = tickets.filter(t => t.priority === 'urgent' && t.status !== 'closed' && t.status !== 'resolved').length;
  const avgResponseTime = '--'; // Placeholder for future metric

  async function updateStatus(id: number, status: string) {
    const res = await fetch('/api/admin/portal/tickets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    const data = await res.json();
    if (data.success) {
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Support Tickets</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage all client support requests across the platform.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="inbox" label="Open" value={openCount} color={openCount > 0 ? 'text-blue-600' : undefined} />
        <StatCard icon="pending" label="In Progress" value={inProgressCount} color="text-yellow-600" />
        <StatCard icon="priority_high" label="Urgent" value={urgentCount} color={urgentCount > 0 ? 'text-red-600' : undefined} urgent={urgentCount > 0} />
        <StatCard icon="confirmation_number" label="Total Tickets" value={tickets.length} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg flex-1 max-w-sm">
          <span className="material-icons text-muted-foreground text-base">search</span>
          <input
            className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground"
            placeholder="Search tickets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {PRIORITY_OPTIONS.map(p => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                priorityFilter === p ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-3xl">refresh</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">support_agent</span>
          <h3 className="mt-4 font-semibold text-foreground">No tickets found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'No support tickets have been submitted.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Updated</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(t => (
                  <tr key={t.id} className={`hover:bg-accent/50 transition-colors ${
                    t.priority === 'urgent' && t.status !== 'closed' && t.status !== 'resolved' ? 'bg-red-50/30' : ''
                  }`}>
                    <td className="px-4 py-3 text-muted-foreground font-mono">#{t.number}</td>
                    <td className="px-4 py-3">
                      <Link href={`/portal/tickets/${t.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                        {t.subject}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(t.createdAt).toLocaleDateString()}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground text-xs">{t.company ?? t.clientName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor(t.priority)}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ticketStatusColor(t.status)}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground capitalize">{t.category || '--'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(t.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={t.status}
                          onChange={e => updateStatus(t.id, e.target.value)}
                          className="text-xs px-2 py-1 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="waiting">Waiting</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                        <Link href={`/portal/tickets/${t.id}`} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                          <span className="material-icons text-sm">open_in_new</span>
                        </Link>
                      </div>
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

function StatCard({ icon, label, value, color, urgent }: {
  icon: string; label: string; value: number; color?: string; urgent?: boolean;
}) {
  return (
    <div className={`bg-card border rounded-xl p-4 ${urgent ? 'border-red-200' : 'border-border'}`}>
      <div className="flex items-center gap-2">
        <span className={`material-icons text-base ${color || 'text-muted-foreground'}`}>{icon}</span>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold mt-1 ${urgent ? 'text-red-600' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
