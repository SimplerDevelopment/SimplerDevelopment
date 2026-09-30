'use client';

import { useState, useEffect } from 'react';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pCard } from '@/components/portal/portal-ui';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import EmailTabs from '@/components/portal/email/EmailTabs';
import { weeklySeries, seriesPoints } from '@/lib/email/weekly';

interface AnalyticsData {
  overview: {
    totalCampaigns: number;
    totalSent: number;
    totalOpened: number;
    totalClicked: number;
    totalBounced: number;
    totalUnsubscribed: number;
    openRate: string;
    clickRate: string;
  };
  subscribers: {
    total: number;
    active: number;
    totalLists: number;
    listBreakdown: { id: number; name: string; total: number; active: number }[];
  };
  recentCampaigns: {
    id: number;
    name: string;
    subject: string;
    sentAt: string | null;
    totalSent: number;
    totalOpened: number;
    totalClicked: number;
    totalBounced: number;
  }[];
}

function StatCard({ icon, label, value, sub, color }: { icon: string; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className={`${pCard} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`material-icons text-lg ${color || 'text-primary'}`}>{icon}</span>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function EmailAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const studio = useFeatureFlag('portal-redesign'); // PUX-205
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/email/analytics')
      .then(r => r.json())
      .then(res => { if (res.success) setData(res.data); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><span className="material-icons animate-spin text-3xl text-muted-foreground">autorenew</span></div>;
  }

  if (!data) {
    return <div className="text-center py-20 text-muted-foreground">Failed to load analytics</div>;
  }

  const { overview, subscribers, recentCampaigns } = data;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Email"
        title="Analytics"
        subtitle="Campaign performance and subscriber insights"
      />

      {studio && <EmailTabs active="/portal/email/analytics" />}

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon="send" label="Emails Sent" value={overview.totalSent.toLocaleString()} />
        <StatCard icon="mark_email_read" label="Open Rate" value={`${overview.openRate}%`} sub={`${overview.totalOpened.toLocaleString()} opened`} color="text-green-500" />
        <StatCard icon="ads_click" label="Click Rate" value={`${overview.clickRate}%`} sub={`${overview.totalClicked.toLocaleString()} clicked`} color="text-blue-500" />
        <StatCard icon="people" label="Subscribers" value={subscribers.active.toLocaleString()} sub={`${subscribers.total.toLocaleString()} total across ${subscribers.totalLists} lists`} color="text-purple-500" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon="campaign" label="Campaigns Sent" value={overview.totalCampaigns} />
        <StatCard icon="error_outline" label="Bounced" value={overview.totalBounced.toLocaleString()} color="text-red-500" />
        <StatCard icon="unsubscribe" label="Unsubscribed" value={overview.totalUnsubscribed.toLocaleString()} color="text-amber-500" />
      </div>

      {/* List breakdown */}
      {subscribers.listBreakdown.length > 0 && (
        <div className={`${pCard} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold">Subscriber Lists</h2>
          </div>
          <div className="divide-y divide-border">
            {subscribers.listBreakdown.map(list => {
              const pct = list.total > 0 ? Math.round((list.active / list.total) * 100) : 0;
              return (
                <div key={list.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{list.name}</p>
                    <p className="text-xs text-muted-foreground">{list.active} active / {list.total} total</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {studio && (() => {
        const series = weeklySeries(recentCampaigns);
        const any = series.some((p) => p.sent > 0);
        return (
          <section className="rounded-2xl border border-border bg-card p-5" aria-label="Twelve-week trend">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Last twelve weeks</h2>
              <p className="text-xs text-muted-foreground">Built from the campaigns below — there is no separate history, so weeks with nothing sent are zeros.</p>
            </div>
            {any ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                {(['sent', 'opened', 'clicked'] as const).map((k) => (
                  <div key={k}>
                    <p className="text-xs font-medium capitalize text-foreground">{k}</p>
                    <svg viewBox="0 0 160 36" className="mt-1 h-9 w-full" aria-hidden><polyline points={seriesPoints(series, k)} fill="none" stroke="currentColor" strokeWidth="1.5" className={k === 'sent' ? 'text-muted-foreground' : k === 'opened' ? 'text-[var(--portal-ok)]' : 'text-primary'} /></svg>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Nothing sent in the last twelve weeks yet — the trend draws itself from the first send.</p>
            )}
          </section>
        );
      })()}

      {/* Campaign performance table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold">Campaign Performance</h2>
        </div>
        {recentCampaigns.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">No sent campaigns yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Campaign</th>
                  <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase text-right">Sent</th>
                  <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase text-right">Opened</th>
                  <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase text-right">Clicked</th>
                  <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase text-right">Bounced</th>
                  <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase text-right">Open Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentCampaigns.map(c => {
                  const openRate = c.totalSent > 0 ? ((c.totalOpened / c.totalSent) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3">
                        <p className="font-medium truncate max-w-[200px]">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.sentAt ? new Date(c.sentAt).toLocaleDateString() : ''}</p>
                      </td>
                      <td className="px-5 py-3 text-right">{c.totalSent.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-green-600">{c.totalOpened.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-blue-600">{c.totalClicked.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-red-500">{c.totalBounced}</td>
                      <td className="px-5 py-3 text-right font-medium">{openRate}%</td>
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
