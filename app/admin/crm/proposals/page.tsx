'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/portal-utils';

interface Proposal {
  id: number;
  title: string;
  status: string;
  viewCount: number;
  validUntil: string | null;
  sentAt: string | null;
  signedAt: string | null;
  createdAt: string;
  lineItems: { quantity: number; unitPrice: number; optional?: boolean; accepted?: boolean }[] | null;
  fees: { type: string; amount: number; label: string }[] | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  companyName: string | null;
  clientCompany: string | null;
  clientId: number;
}

function proposalStatusColor(status: string): string {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    viewed: 'bg-indigo-100 text-indigo-700',
    accepted: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
    expired: 'bg-orange-100 text-orange-700',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

function computeTotal(p: Proposal): number {
  if (!p.lineItems) return 0;
  const subtotal = p.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  if (!p.fees) return subtotal;
  return p.fees.reduce((total, f) => {
    if (f.type === 'flat') return total + f.amount;
    if (f.type === 'percent') return total + Math.round(subtotal * f.amount / 10000);
    return total;
  }, subtotal);
}

export default function CrmProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    const params = filter !== 'all' ? `?status=${filter}` : '';
    fetch(`/api/admin/portal/crm/proposals${params}`)
      .then(r => r.json())
      .then(d => { setProposals(d.data ?? []); setLoading(false); });
  }, [filter]);

  const totalSent = proposals.filter(p => p.status !== 'draft').length;
  const acceptedCount = proposals.filter(p => p.status === 'accepted').length;
  const acceptanceRate = totalSent > 0 ? Math.round((acceptedCount / totalSent) * 100) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/admin/crm" className="text-muted-foreground hover:text-foreground transition-colors">
              <span className="material-icons text-sm">arrow_back</span>
            </Link>
            <h1 className="text-2xl font-bold text-foreground">CRM Proposals</h1>
          </div>
          <p className="text-muted-foreground mt-1">All proposals across every client account.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['all', 'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'].map(s => (
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Total Sent</p>
          <p className="text-xl font-bold text-foreground">{totalSent}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Acceptance Rate</p>
          <p className="text-xl font-bold text-foreground">{acceptanceRate}%</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading proposals...</div>
      ) : proposals.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">description</span>
          <h3 className="mt-4 font-semibold text-foreground">No proposals found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {filter !== 'all' ? `No ${filter} proposals.` : 'No CRM proposals have been created yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Views</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {proposals.map(p => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{p.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.contactFirstName ? `${p.contactFirstName} ${p.contactLastName ?? ''}`.trim() : '-'}
                    </td>
                    <td className="px-4 py-3 text-foreground">{p.companyName ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.clientCompany ?? '-'}</td>
                    <td className="px-4 py-3 text-foreground">{formatCents(computeTotal(p))}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${proposalStatusColor(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span className="material-icons text-xs">visibility</span>
                        {p.viewCount}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.validUntil ? new Date(p.validUntil).toLocaleDateString() : '-'}
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
