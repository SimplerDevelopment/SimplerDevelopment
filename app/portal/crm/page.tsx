'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface DashboardData {
  totalContacts: number;
  totalCompanies: number;
  openDealsValue: number;
  wonDealsValue: number;
  recentActivities: Activity[];
}

interface Activity {
  id: number;
  type: string;
  title: string;
  description: string | null;
  createdAt: string;
}

const activityIcons: Record<string, string> = {
  call: 'phone',
  email: 'mail',
  meeting: 'groups',
  note: 'sticky_note_2',
  task: 'task_alt',
  deal_created: 'add_circle',
  deal_won: 'emoji_events',
  deal_lost: 'cancel',
  contact_created: 'person_add',
  stage_change: 'swap_horiz',
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function CrmDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/crm/dashboard')
      .then(r => r.json())
      .then(d => {
        setData(d.data ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <span className="material-icons text-4xl text-muted-foreground">error_outline</span>
        <p className="mt-2 text-muted-foreground">Failed to load CRM dashboard.</p>
      </div>
    );
  }

  const stats = [
    { label: 'Total Contacts', value: data.totalContacts, icon: 'people', color: 'text-blue-600', href: '/portal/crm/contacts' },
    { label: 'Total Companies', value: data.totalCompanies, icon: 'business', color: 'text-purple-600', href: '/portal/crm/companies' },
    { label: 'Open Deals Value', value: formatCurrency(data.openDealsValue), icon: 'trending_up', color: 'text-orange-600', href: '/portal/crm/deals' },
    { label: 'Won Deals Value', value: formatCurrency(data.wonDealsValue), icon: 'emoji_events', color: 'text-green-600', href: '/portal/crm/deals' },
  ];

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Link key={s.label} href={s.href} className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-colors group">
            <span className={`material-icons text-2xl ${s.color}`}>{s.icon}</span>
            <p className="mt-3 text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold text-foreground mb-4">Recent Activity</h2>
          {(data.recentActivities ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No recent activity.</p>
          ) : (
            <ul className="space-y-3">
              {(data.recentActivities ?? []).map(a => (
                <li key={a.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
                  <span className="material-icons text-base text-muted-foreground mt-0.5">
                    {activityIcons[a.type] ?? 'circle'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{a.title}</p>
                    {a.description && (
                      <p className="text-xs text-muted-foreground truncate">{a.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground capitalize">{a.type}</span>
                      <span className="text-xs text-muted-foreground">&middot;</span>
                      <span className="text-xs text-muted-foreground">{relativeTime(a.createdAt)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Link
              href="/portal/crm/contacts"
              className="flex items-center gap-3 w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span className="material-icons text-base">person_add</span>
              Add Contact
            </Link>
            <Link
              href="/portal/crm/deals"
              className="flex items-center gap-3 w-full px-4 py-3 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <span className="material-icons text-base">add_circle</span>
              Add Deal
            </Link>
            <Link
              href="/portal/crm/deals"
              className="flex items-center gap-3 w-full px-4 py-3 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <span className="material-icons text-base">view_column</span>
              View Pipeline
            </Link>
            <Link
              href="/portal/crm/companies"
              className="flex items-center gap-3 w-full px-4 py-3 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <span className="material-icons text-base">domain_add</span>
              Add Company
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
