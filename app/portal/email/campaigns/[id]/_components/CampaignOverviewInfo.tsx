'use client';
// Extracted verbatim from app/portal/email/campaigns/[id]/page.tsx (PUX-175) — the page is pinned at 522 code lines.

import type { Campaign } from './campaign-types';

export function CampaignOverviewInfo({ campaign, onToggleUseBlockEditor }: { campaign: Campaign; onToggleUseBlockEditor: () => void }) {
  return (
    <div className="bg-card border border-border rounded-2xl divide-y divide-border mt-4">
      {[
        { label: 'From', value: `${campaign.fromName} <${campaign.fromEmail}>` },
        { label: 'Reply-To', value: campaign.replyTo ?? '—' },
        { label: 'List', value: campaign.listName ?? '—' },
        { label: 'Preview Text', value: campaign.previewText ?? '—' },
        { label: 'Sent At', value: campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : '—' },
        { label: 'Unsubscribes', value: campaign.totalUnsubscribed },
      ].map(row => (
        <div key={row.label} className="flex px-5 py-3 gap-4">
          <span className="text-sm text-muted-foreground w-28 shrink-0">{row.label}</span>
          <span className="text-sm text-foreground">{row.value}</span>
        </div>
      ))}
      {campaign.status === 'draft' && (
        <div className="flex px-5 py-3 gap-4 items-center">
          <span className="text-sm text-muted-foreground w-28 shrink-0">Editor</span>
          <div className="flex items-center gap-3 flex-1">
            <span className="text-sm text-foreground">
              {campaign.useBlockEditor ? 'Block builder (cached MJML-style render)' : 'Template / HTML'}
            </span>
            <button
              onClick={onToggleUseBlockEditor}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-xl text-xs hover:bg-accent"
              title="Toggle between the legacy template flow and the new block builder"
            >
              <span className="material-icons text-sm">swap_horiz</span>
              Switch to {campaign.useBlockEditor ? 'template' : 'block builder'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
