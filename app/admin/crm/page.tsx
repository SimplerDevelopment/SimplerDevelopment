'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/portal-utils';

interface DashboardData {
  totalContacts: number;
  contactsByStatus: Record<string, number>;
  totalCompanies: number;
  dealsByStatus: Record<string, { count: number; value: number }>;
  proposalsByStatus: Record<string, number>;
  contractsByStatus: Record<string, number>;
  recentActivities: {
    id: number;
    type: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    completedAt: string | null;
    createdAt: string;
    clientCompany: string | null;
  }[];
}

const activityIcon: Record<string, string> = {
  call: 'phone',
  email: 'email',
  meeting: 'groups',
  note: 'sticky_note_2',
  task: 'task_alt',
};

export default function CrmDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/portal/crm/dashboard')
      .then(r => r.json())
      .then(d => { setData(d.data ?? null); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-20 text-muted-foreground">Loading CRM dashboard...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">error_outline</span>
          <h3 className="mt-4 font-semibold text-foreground">Failed to load dashboard</h3>
        </div>
      </div>
    );
  }

  const openDeals = data.dealsByStatus['open'] ?? { count: 0, value: 0 };
  const wonDeals = data.dealsByStatus['won'] ?? { count: 0, value: 0 };
  const lostDeals = data.dealsByStatus['lost'] ?? { count: 0, value: 0 };

  const proposalsSent = (data.proposalsByStatus['sent'] ?? 0) +
    (data.proposalsByStatus['viewed'] ?? 0) +
    (data.proposalsByStatus['accepted'] ?? 0) +
    (data.proposalsByStatus['declined'] ?? 0);

  const contractsPending = (data.contractsByStatus['sent'] ?? 0) +
    (data.contractsByStatus['partially_signed'] ?? 0);

  const navLinks = [
    { href: '/admin/crm/contacts', icon: 'contacts', label: 'Contacts', desc: 'Manage all CRM contacts' },
    { href: '/admin/crm/companies', icon: 'business', label: 'Companies', desc: 'View companies across clients' },
    { href: '/admin/crm/deals', icon: 'handshake', label: 'Deals', desc: 'Track deal pipelines' },
    { href: '/admin/crm/proposals', icon: 'description', label: 'Proposals', desc: 'Monitor proposals' },
    { href: '/admin/crm/contracts', icon: 'gavel', label: 'Contracts', desc: 'Track contract signings' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">CRM Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of contacts, deals, proposals, and contracts across all clients.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <span className="material-icons text-blue-600">contacts</span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Contacts</p>
              <p className="text-2xl font-bold text-foreground">{data.totalContacts}</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <span className="material-icons text-green-600">handshake</span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Open Deals</p>
              <p className="text-2xl font-bold text-foreground">{openDeals.count}</p>
              <p className="text-xs text-muted-foreground">{formatCents(openDeals.value)} pipeline</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <span className="material-icons text-purple-600">description</span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Proposals Sent</p>
              <p className="text-2xl font-bold text-foreground">{proposalsSent}</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <span className="material-icons text-orange-600">gavel</span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Contracts Pending</p>
              <p className="text-2xl font-bold text-foreground">{contractsPending}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Deal Pipeline + Proposal Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">Deal Pipeline</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="material-icons text-blue-600 text-sm">pending</span>
                <span className="text-sm font-medium text-blue-700">Open</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-blue-700">{openDeals.count} deals</span>
                <span className="text-xs text-blue-600 ml-2">{formatCents(openDeals.value)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="material-icons text-green-600 text-sm">check_circle</span>
                <span className="text-sm font-medium text-green-700">Won</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-green-700">{wonDeals.count} deals</span>
                <span className="text-xs text-green-600 ml-2">{formatCents(wonDeals.value)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="material-icons text-red-600 text-sm">cancel</span>
                <span className="text-sm font-medium text-red-700">Lost</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-red-700">{lostDeals.count} deals</span>
                <span className="text-xs text-red-600 ml-2">{formatCents(lostDeals.value)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">Proposal Status</h2>
          <div className="space-y-2">
            {['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'].map(s => {
              const ct = data.proposalsByStatus[s] ?? 0;
              if (ct === 0) return null;
              const colors: Record<string, string> = {
                draft: 'bg-gray-100 text-gray-700',
                sent: 'bg-blue-100 text-blue-700',
                viewed: 'bg-indigo-100 text-indigo-700',
                accepted: 'bg-green-100 text-green-700',
                declined: 'bg-red-100 text-red-700',
                expired: 'bg-orange-100 text-orange-700',
              };
              return (
                <div key={s} className="flex items-center justify-between py-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colors[s]}`}>{s}</span>
                  <span className="text-sm font-medium text-foreground">{ct}</span>
                </div>
              );
            })}
            {Object.values(data.proposalsByStatus).every(v => v === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">No proposals yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activities */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-semibold text-foreground mb-4">Recent Activities</h2>
        {data.recentActivities.length === 0 ? (
          <div className="text-center py-8">
            <span className="material-icons text-4xl text-muted-foreground">event_note</span>
            <p className="text-sm text-muted-foreground mt-2">No recent activities</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.recentActivities.map(a => (
              <div key={a.id} className="flex items-start gap-3 py-3">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="material-icons text-sm text-muted-foreground">{activityIcon[a.type] ?? 'event'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.clientCompany ?? 'Unknown client'} &middot; {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${a.completedAt ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {a.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nav Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {navLinks.map(l => (
          <Link key={l.href} href={l.href} className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all group">
            <span className="material-icons text-2xl text-muted-foreground group-hover:text-primary transition-colors">{l.icon}</span>
            <h3 className="mt-2 font-semibold text-foreground text-sm">{l.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{l.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
