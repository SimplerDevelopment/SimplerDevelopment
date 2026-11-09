'use client';
// Extracted verbatim from app/portal/email/campaigns/[id]/page.tsx (PUX-175) — the page is pinned at 522 code lines.

import type { Campaign } from './campaign-types';

export function CampaignStatsGrid({ campaign }: { campaign: Pick<Campaign, 'totalSent' | 'totalOpened' | 'totalClicked' | 'totalBounced'> }) {
  const openRate = campaign.totalSent > 0 ? Math.round(campaign.totalOpened / campaign.totalSent * 100) : 0;
  const clickRate = campaign.totalSent > 0 ? Math.round(campaign.totalClicked / campaign.totalSent * 100) : 0;
  const bounceRate = campaign.totalSent > 0 ? Math.round(campaign.totalBounced / campaign.totalSent * 100) : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {[
        { label: 'Sent', value: campaign.totalSent, icon: 'send' },
        { label: 'Open Rate', value: `${openRate}%`, icon: 'drafts' },
        { label: 'Click Rate', value: `${clickRate}%`, icon: 'touch_app' },
        { label: 'Bounce Rate', value: `${bounceRate}%`, icon: 'error_outline' },
      ].map(stat => (
        <div key={stat.label} className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <span className="material-icons text-sm">{stat.icon}</span>
            <span className="text-xs">{stat.label}</span>
          </div>
          <p className="text-xl font-display font-extrabold tracking-[-0.02em] text-foreground">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
