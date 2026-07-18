'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatCents, priorityColor } from '@/lib/portal-utils';

interface Deal {
  id: number;
  title: string;
  value: number | null;
  currency: string | null;
  status: string;
  priority: string | null;
  expectedCloseDate: string | null;
  createdAt: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  companyName: string | null;
  stageName: string;
  stageColor: string | null;
  pipelineName: string;
  clientCompany: string | null;
  clientId: number;
}

function dealStatusColor(status: string): string {
  const map: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    won: 'bg-green-100 text-green-700',
    lost: 'bg-red-100 text-red-700',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

export default function CrmDealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    const params = filter !== 'all' ? `?status=${filter}` : '';
    fetch(`/api/admin/portal/crm/deals${params}`)
      .then(r => r.json())
      .then(d => { setDeals(d.data ?? []); setLoading(false); });
  }, [filter]);

  const pipelineValue = deals.filter(d => d.status === 'open').reduce((s, d) => s + (d.value ?? 0), 0);
  const wonValue = deals.filter(d => d.status === 'won').reduce((s, d) => s + (d.value ?? 0), 0);
  const lostCount = deals.filter(d => d.status === 'lost').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/admin/crm" className="text-muted-foreground hover:text-foreground transition-colors">
              <span className="material-icons text-sm">arrow_back</span>
            </Link>
            <h1 className="text-2xl font-bold text-foreground">CRM Deals</h1>
          </div>
          <p className="text-muted-foreground mt-1">All deals across every client pipeline.</p>
        </div>
        <div className="flex items-center gap-2">
          {['all', 'open', 'won', 'lost'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filter === s ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Pipeline Value</p>
          <p className="text-xl font-bold text-foreground">{formatCents(pipelineValue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Won Value</p>
          <p className="text-xl font-bold text-green-600">{formatCents(wonValue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Lost Deals</p>
          <p className="text-xl font-bold text-red-600">{lostCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading deals...</div>
      ) : deals.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">handshake</span>
          <h3 className="mt-4 font-semibold text-foreground">No deals found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {filter !== 'all' ? `No ${filter} deals.` : 'No CRM deals have been created yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Stage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Pipeline</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Close Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {deals.map(d => (
                  <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{d.title}</td>
                    <td className="px-4 py-3 text-foreground">{d.value != null ? formatCents(d.value) : '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.contactFirstName ? `${d.contactFirstName} ${d.contactLastName ?? ''}`.trim() : '-'}
                    </td>
                    <td className="px-4 py-3 text-foreground">{d.companyName ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{d.clientCompany ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: d.stageColor ?? '#6366f1' }}
                        />
                        {d.stageName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{d.pipelineName}</td>
                    <td className="px-4 py-3">
                      {d.priority && (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${priorityColor(d.priority)}`}>
                          {d.priority}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.expectedCloseDate ? new Date(d.expectedCloseDate).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${dealStatusColor(d.status)}`}>
                        {d.status}
                      </span>
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
