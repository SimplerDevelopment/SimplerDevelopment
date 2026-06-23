'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Campaign {
  id: number;
  name: string;
  subject: string;
  status: string;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  sentAt: string | null;
  createdAt: string;
  listName: string | null;
}

const statusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function PortalCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/email/campaigns')
      .then(r => r.json())
      .then(d => { setCampaigns(d.data ?? []); setLoading(false); });
  }, []);

  async function deleteCampaign(id: number, status: string) {
    if (status === 'sending') { alert('Cannot delete a campaign that is sending.'); return; }
    if (!confirm('Delete this campaign?')) return;
    await fetch(`/api/portal/email/campaigns/${id}`, { method: 'DELETE' });
    setCampaigns(prev => prev.filter(c => c.id !== id));
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Link href="/portal/email" className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-base">arrow_back</span>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{loading ? '' : `${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`}</p>
          </div>
        </div>
        <Link href="/portal/email/campaigns/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <span className="material-icons text-base">add</span>
          New Campaign
        </Link>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-icons text-4xl text-muted-foreground mb-3 block">campaign</span>
            <p className="text-muted-foreground mb-4">No campaigns yet.</p>
            <Link href="/portal/email/campaigns/new" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
              Create Campaign
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Campaign</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">List</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Open Rate</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map(c => {
                const openRate = c.totalSent > 0 ? Math.round(c.totalOpened / c.totalSent * 100) : 0;
                return (
                  <tr key={c.id} className="hover:bg-accent transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/portal/email/campaigns/${c.id}`} className="font-medium text-foreground hover:text-primary">
                        {c.name}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate max-w-xs">{c.subject}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{c.listName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[c.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                      {c.status === 'sent' ? `${openRate}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/portal/email/campaigns/${c.id}`} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent">
                          <span className="material-icons text-base">{c.status === 'draft' ? 'edit' : 'visibility'}</span>
                        </Link>
                        {c.status !== 'sending' && (
                          <button onClick={() => deleteCampaign(c.id, c.status)}
                            className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                            <span className="material-icons text-base">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
