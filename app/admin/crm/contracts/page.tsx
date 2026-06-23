'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Contract {
  id: number;
  title: string;
  status: string;
  sentAt: string | null;
  fullyExecutedAt: string | null;
  createdAt: string;
  clientCompany: string | null;
  clientId: number;
  signerTotal: number;
  signerSigned: number;
}

function contractStatusColor(status: string): string {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    partially_signed: 'bg-yellow-100 text-yellow-700',
    fully_executed: 'bg-green-100 text-green-700',
    voided: 'bg-red-100 text-red-700',
    expired: 'bg-orange-100 text-orange-700',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

export default function CrmContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    const params = filter !== 'all' ? `?status=${filter}` : '';
    fetch(`/api/admin/portal/crm/contracts${params}`)
      .then(r => r.json())
      .then(d => { setContracts(d.data ?? []); setLoading(false); });
  }, [filter]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/admin/crm" className="text-muted-foreground hover:text-foreground transition-colors">
              <span className="material-icons text-sm">arrow_back</span>
            </Link>
            <h1 className="text-2xl font-bold text-foreground">CRM Contracts</h1>
          </div>
          <p className="text-muted-foreground mt-1">All contracts across every client account.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['all', 'draft', 'sent', 'partially_signed', 'fully_executed', 'voided', 'expired'].map(s => (
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
        <div className="text-center py-12 text-muted-foreground">Loading contracts...</div>
      ) : contracts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">gavel</span>
          <h3 className="mt-4 font-semibold text-foreground">No contracts found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {filter !== 'all' ? `No ${filter.replace('_', ' ')} contracts.` : 'No CRM contracts have been created yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Signers</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contracts.map(c => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{c.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.clientCompany ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${contractStatusColor(c.status)}`}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.signerTotal > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="material-icons text-sm text-muted-foreground">draw</span>
                          <span className="text-foreground font-medium">{c.signerSigned}</span>
                          <span className="text-muted-foreground">/ {c.signerTotal}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString()}
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
