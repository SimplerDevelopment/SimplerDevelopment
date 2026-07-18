'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Campaign {
  id: number;
  name: string;
  subject: string;
  status: string;
  totalRecipients: number;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  sentAt: string | null;
  createdAt: string;
  listName: string | null;
}

interface List {
  id: number;
  name: string;
  subscriberCount: number;
}

export default function EmailDashboardPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/email/campaigns').then(r => r.json()),
      fetch('/api/admin/email/lists').then(r => r.json()),
    ]).then(([c, l]) => {
      setCampaigns(c.data ?? []);
      setLists(l.data ?? []);
      setLoading(false);
    });
  }, []);

  const totalSubscribers = lists.reduce((sum, l) => sum + (l.subscriberCount ?? 0), 0);
  const sentCampaigns = campaigns.filter(c => c.status === 'sent');
  const avgOpenRate = sentCampaigns.length
    ? Math.round(sentCampaigns.reduce((sum, c) => sum + (c.totalSent > 0 ? c.totalOpened / c.totalSent : 0), 0) / sentCampaigns.length * 100)
    : 0;

  const statusColor: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    scheduled: 'bg-blue-100 text-blue-700',
    sending: 'bg-yellow-100 text-yellow-700',
    sent: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Email Marketing</h1>
          <p className="text-muted-foreground mt-1">Manage campaigns, subscriber lists, and analytics.</p>
        </div>
        <Link
          href="/admin/email/campaigns/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">add</span>
          New Campaign
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Subscribers', value: totalSubscribers, icon: 'group' },
          { label: 'Lists', value: lists.length, icon: 'list' },
          { label: 'Campaigns Sent', value: sentCampaigns.length, icon: 'send' },
          { label: 'Avg Open Rate', value: `${avgOpenRate}%`, icon: 'open_in_new' },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <span className="material-icons text-base">{stat.icon}</span>
              <span className="text-xs">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{loading ? '—' : stat.value}</p>
          </div>
        ))}
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/admin/email/lists" className="bg-card border border-border rounded-lg p-5 hover:border-primary transition-colors group">
          <div className="flex items-center gap-3">
            <span className="material-icons text-2xl text-primary">list_alt</span>
            <div>
              <p className="font-semibold text-foreground group-hover:text-primary transition-colors">Subscriber Lists</p>
              <p className="text-sm text-muted-foreground">{loading ? '…' : `${lists.length} list${lists.length !== 1 ? 's' : ''}, ${totalSubscribers} subscribers`}</p>
            </div>
          </div>
        </Link>
        <Link href="/admin/email/campaigns" className="bg-card border border-border rounded-lg p-5 hover:border-primary transition-colors group">
          <div className="flex items-center gap-3">
            <span className="material-icons text-2xl text-primary">campaign</span>
            <div>
              <p className="font-semibold text-foreground group-hover:text-primary transition-colors">Campaigns</p>
              <p className="text-sm text-muted-foreground">{loading ? '…' : `${campaigns.length} total, ${sentCampaigns.length} sent`}</p>
            </div>
          </div>
        </Link>
        <Link href="/admin/email/domains" className="bg-card border border-border rounded-lg p-5 hover:border-primary transition-colors group">
          <div className="flex items-center gap-3">
            <span className="material-icons text-2xl text-primary">domain</span>
            <div>
              <p className="font-semibold text-foreground group-hover:text-primary transition-colors">Sending Domains</p>
              <p className="text-sm text-muted-foreground">Verify &amp; manage domains</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Recent campaigns */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Recent Campaigns</h2>
          <Link href="/admin/email/campaigns" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        {loading ? (
          <p className="p-6 text-muted-foreground text-sm">Loading…</p>
        ) : campaigns.length === 0 ? (
          <div className="p-10 text-center">
            <span className="material-icons text-3xl text-muted-foreground mb-2 block">campaign</span>
            <p className="text-muted-foreground text-sm">No campaigns yet.</p>
            <Link href="/admin/email/campaigns/new" className="mt-3 inline-block text-sm text-primary hover:underline">Create your first campaign</Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {campaigns.slice(0, 5).map(c => (
              <Link key={c.id} href={`/admin/email/campaigns/${c.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-accent transition-colors">
                <div>
                  <p className="font-medium text-foreground text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.subject} · {c.listName}</p>
                </div>
                <div className="flex items-center gap-4">
                  {c.status === 'sent' && (
                    <span className="text-xs text-muted-foreground">
                      {c.totalSent > 0 ? Math.round(c.totalOpened / c.totalSent * 100) : 0}% open
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[c.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {c.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
