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
}

export default function AdminPortalTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/api/admin/portal/tickets')
      .then(r => r.json())
      .then(d => { setTickets(d.data ?? []); setLoading(false); });
  }, []);

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);

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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Support Tickets</h1>
          <p className="text-muted-foreground mt-1">Manage all client support requests.</p>
        </div>
        <div className="flex items-center gap-2">
          {['all', 'open', 'in_progress', 'waiting', 'resolved', 'closed'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === s ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">support_agent</span>
          <h3 className="mt-4 font-semibold text-foreground">No tickets</h3>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Updated</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">#{t.number}</td>
                  <td className="px-4 py-3">
                    <Link href={`/portal/tickets/${t.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                      {t.subject}
                    </Link>
                    <p className="text-xs text-muted-foreground capitalize">{t.category}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t.company ?? t.clientName}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor(t.priority)}`}>{t.priority}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ticketStatusColor(t.status)}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(t.updatedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
