'use client';

/**
 * PUX-175 (design doc screen 34): the rendered email beside the settings
 * that shape it — what Overview and Content used to split across tabs.
 * Block campaigns preview through EmailPreviewPane (the render-preview
 * route in an iframe); legacy htmlContent campaigns render sanitized in a
 * box. Editing still happens in the existing editor (`onEdit`), so the
 * settings here are read-only rows plus the Schedule action slot.
 * Studio-only; the page gates on useFeatureFlag('portal-redesign').
 */

import type { ReactNode } from 'react';
import { EmailPreviewPane } from '@/components/email/EmailPreviewPane';
import { sanitizeRichHtml } from '@/lib/security/sanitize-html';
import { sBtnGhost } from '@/components/portal/portal-ui';
import { GhostCard } from '@/components/portal/EmptyState';
import type { Block } from '@/types/blocks';

export default function CampaignSettingsPreview({
  campaign, blocks, sendTime, onEdit,
}: {
  campaign: { subject: string; previewText: string | null; listName: string | null; htmlContent: string | null; status: string };
  blocks: Block[] | null;
  /** The Schedule action (or a "Sent …" label) rendered in the Send time row. */
  sendTime: ReactNode;
  onEdit?: () => void;
}) {
  const rows: [string, ReactNode][] = [
    ['Subject', campaign.subject || '—'],
    ['Preview text', campaign.previewText || '—'],
    ['List', campaign.listName ?? '—'],
    ['Send time', sendTime],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-semibold text-foreground"><span className="material-icons text-base text-muted-foreground">visibility</span>Email preview</h2>
        {blocks && blocks.length > 0 ? (
          <div className="mx-auto max-w-[420px]"><EmailPreviewPane blocks={blocks} /></div>
        ) : campaign.htmlContent ? (
          <div className="mx-auto max-w-[420px] overflow-hidden rounded-xl border border-border bg-white p-4 text-black" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(campaign.htmlContent) }} />
        ) : (
          <GhostCard icon="mail" title="No content yet" body="Write the email and it previews here." onClick={onEdit} />
        )}
      </section>
      <aside className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-semibold text-foreground"><span className="material-icons text-base text-muted-foreground">tune</span>Settings</h2>
        <dl className="space-y-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 text-foreground">{v}</dd></div>
          ))}
        </dl>
        {onEdit && campaign.status === 'draft' && (
          <button type="button" onClick={onEdit} className={`${sBtnGhost} mt-4`}><span className="material-icons text-base">edit</span>Edit content</button>
        )}
      </aside>
    </div>
  );
}
