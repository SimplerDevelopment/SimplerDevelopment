'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RelatedModulesStrip } from '@/components/portal/billing/RelatedModulesStrip';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, sBtn } from '@/components/portal/portal-ui';
import { useRouter } from 'next/navigation';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import { EmptyState } from '@/components/portal/EmptyState';
import CampaignsStudioTable from '@/components/portal/email/CampaignsStudioTable';
import DomainGetStarted from '@/components/portal/onboarding/DomainGetStarted';
import EmailTabs from '@/components/portal/email/EmailTabs';

interface Campaign {
  id: number;
  name: string;
  subject: string;
  status: string;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  sentAt: string | null;
  scheduledAt?: string | null;
  createdAt: string;
  listName: string | null;
}

interface EmailList {
  id: number;
  name: string;
  subscriberCount: number;
}

const statusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  ab_testing: 'bg-violet-100 text-violet-700',
};

// PUX-174 (design doc screen 33): the seven nav children as five tabs of links; Campaigns is this page.
// PUX-204 moved the strip to components/portal/email/EmailTabs so every Email page shares it.

export default function PortalEmailPage() {
  const router = useRouter();
  // PUX-174: open + click as bars, scheduled time beside the pill, one teal New campaign. Flag off is today's page.
  const studio = useFeatureFlag('portal-redesign');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lists, setLists] = useState<EmailList[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/email/campaigns').then(r => r.json()),
      fetch('/api/portal/email/lists').then(r => r.json()),
    ]).then(([c, l]) => {
      setCampaigns(c.data ?? []);
      setLists(l.data ?? []);
      setLoading(false);
    });
  }, []);

  const sentCampaigns = campaigns.filter(c => c.status === 'sent');
  const totalSent = sentCampaigns.reduce((sum, c) => sum + c.totalSent, 0);
  const totalOpened = sentCampaigns.reduce((sum, c) => sum + c.totalOpened, 0);
  const totalClicked = sentCampaigns.reduce((sum, c) => sum + c.totalClicked, 0);
  const avgOpenRate = totalSent > 0 ? Math.round(totalOpened / totalSent * 100) : 0;
  const avgClickRate = totalSent > 0 ? Math.round(totalClicked / totalSent * 100) : 0;
  const totalSubscribers = lists.reduce((sum, l) => sum + (l.subscriberCount ?? 0), 0);

  async function deleteCampaign(id: number, status: string) {
    if (status === 'sending') { alert('Cannot delete a campaign that is currently sending.'); return; }
    if (!confirm('Delete this campaign?')) return;
    await fetch(`/api/portal/email/campaigns/${id}`, { method: 'DELETE' });
    setCampaigns(prev => prev.filter(c => c.id !== id));
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <PortalPageHeader
        eyebrow={studio ? 'Grow · Reach' : 'Marketing'}
        title={studio ? 'Email' : 'Email Marketing'}
        subtitle={studio ? (loading ? '' : `${totalSubscribers.toLocaleString()} subscribers across ${lists.length} ${lists.length === 1 ? 'list' : 'lists'}`) : 'Manage your campaigns and subscriber lists.'}
        actions={
          <Link
            href="/portal/email/campaigns/new"
            className={studio ? sBtn : pBtnPrimary}
          >
            <span className="material-icons text-base">add</span>
            {studio ? 'New campaign' : 'New Campaign'}
          </Link>
        }
      />

      {studio && <EmailTabs active="/portal/email" />}

      <DomainGetStarted domainKey="email" />

      {studio ? (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Subscribers', value: totalSubscribers.toLocaleString(), note: `across ${lists.length} ${lists.length === 1 ? 'list' : 'lists'}` },
            { label: 'Avg open', value: `${avgOpenRate}%`, note: `${sentCampaigns.length} sent` },
            { label: 'Avg click', value: `${avgClickRate}%`, note: `${sentCampaigns.length} sent` },
          ].map((t) => (
            <div key={t.label} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{loading ? '—' : t.value}</p>
              <p className="text-[11px] text-muted-foreground">{t.note}</p>
            </div>
          ))}
        </div>
      ) : (<>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Lists', value: lists.length, icon: 'list_alt', href: '/portal/email/lists' },
          { label: 'Subscribers', value: totalSubscribers, icon: 'group', href: '/portal/email/lists' },
          { label: 'Campaigns Sent', value: sentCampaigns.length, icon: 'send', href: '/portal/email/campaigns' },
          { label: 'Avg Open Rate', value: `${avgOpenRate}%`, icon: 'drafts', href: null },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <span className="material-icons text-sm">{stat.icon}</span>
              <span className="text-xs">{stat.label}</span>
            </div>
            <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{loading ? '—' : stat.value}</p>
          </div>
        ))}
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/portal/email/campaigns/new" className="bg-card border border-border rounded-2xl p-5 hover:border-primary transition-colors group">
          <div className="flex items-center gap-3">
            <span className="material-icons text-2xl text-primary">add_circle</span>
            <div>
              <p className="font-display font-extrabold tracking-[-0.01em] text-foreground group-hover:text-primary transition-colors">New Campaign</p>
              <p className="text-sm text-muted-foreground">Create and send</p>
            </div>
          </div>
        </Link>
        <Link href="/portal/email/templates" className="bg-card border border-border rounded-2xl p-5 hover:border-primary transition-colors group">
          <div className="flex items-center gap-3">
            <span className="material-icons text-2xl text-primary">dynamic_feed</span>
            <div>
              <p className="font-display font-extrabold tracking-[-0.01em] text-foreground group-hover:text-primary transition-colors">Templates</p>
              <p className="text-sm text-muted-foreground">Reusable email designs</p>
            </div>
          </div>
        </Link>
        <Link href="/portal/email/segments" className="bg-card border border-border rounded-2xl p-5 hover:border-primary transition-colors group">
          <div className="flex items-center gap-3">
            <span className="material-icons text-2xl text-primary">filter_alt</span>
            <div>
              <p className="font-display font-extrabold tracking-[-0.01em] text-foreground group-hover:text-primary transition-colors">Segments</p>
              <p className="text-sm text-muted-foreground">Target specific audiences</p>
            </div>
          </div>
        </Link>
        <Link href="/portal/email/analytics" className="bg-card border border-border rounded-2xl p-5 hover:border-primary transition-colors group">
          <div className="flex items-center gap-3">
            <span className="material-icons text-2xl text-primary">analytics</span>
            <div>
              <p className="font-display font-extrabold tracking-[-0.01em] text-foreground group-hover:text-primary transition-colors">Analytics</p>
              <p className="text-sm text-muted-foreground">Performance insights</p>
            </div>
          </div>
        </Link>
      </div>

      </>)}

      {/* Recent campaigns */}
      {studio ? (
        loading ? null : campaigns.length === 0 ? (
          <EmptyState title="No campaigns yet." body="Write one, pick a list, and the open and click rates land here." cta={{ label: 'New campaign', icon: 'add', href: '/portal/email/campaigns/new', ghost: true }} ghostLabel="A campaign" />
        ) : (
          <CampaignsStudioTable campaigns={campaigns} onOpen={(c) => router.push(`/portal/email/campaigns/${c.id}`)} onDelete={(c) => deleteCampaign(c.id, c.status)} />
        )
      ) : (
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display font-extrabold tracking-[-0.01em] text-foreground">Recent Campaigns</h2>
          <Link href="/portal/email/campaigns" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : campaigns.length === 0 ? (
          <div className="p-10 text-center">
            <span className="material-icons text-3xl text-muted-foreground mb-2 block">campaign</span>
            <p className="text-muted-foreground text-sm mb-3">No campaigns yet.</p>
            <Link href="/portal/email/campaigns/new" className="text-sm text-primary hover:underline">Create your first campaign</Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {campaigns.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <Link href={`/portal/email/campaigns/${c.id}`} className="flex-1 hover:text-primary">
                  <p className="font-medium text-foreground text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.subject} · {c.listName ?? 'No list'}</p>
                </Link>
                <div className="flex items-center gap-3">
                  {c.status === 'sent' && (
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {c.totalSent > 0 ? Math.round(c.totalOpened / c.totalSent * 100) : 0}% open
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[c.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {c.status}
                  </span>
                  {(c.status === 'draft' || c.status === 'scheduled') && (
                    <button onClick={() => deleteCampaign(c.id, c.status)} className="p-1 text-muted-foreground hover:text-red-500 transition-colors">
                      <span className="material-icons text-sm">delete</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
      <RelatedModulesStrip currentDomain="email" />
    </div>
  );
}
