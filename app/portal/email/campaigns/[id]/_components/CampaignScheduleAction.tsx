'use client';

/**
 * PUX-175 (design doc screen 34): Schedule is the page's one teal action.
 * There is no schedule route — PATCH /api/portal/email/campaigns/[id]
 * {scheduledAt} already flips status to 'scheduled' (or back to 'draft' on
 * null) in lib/email/campaign-update-patch.ts, and the minute cron sends it.
 * Studio-only; the page gates on useFeatureFlag('portal-redesign').
 */

import { useState } from 'react';
import { sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { scheduledLabel } from '@/lib/email/campaign-rates';

export default function CampaignScheduleAction({
  campaignId, scheduledAt, disabled = false, onScheduled,
}: {
  campaignId: string;
  scheduledAt: string | null;
  disabled?: boolean;
  onScheduled: (patch: { scheduledAt: string | null; status: 'scheduled' | 'draft' }) => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(next: string | null) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/email/campaigns/${campaignId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduledAt: next }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || json.success === false) throw new Error(json.message || 'Could not update the send time.');
      onScheduled({ scheduledAt: next, status: next ? 'scheduled' : 'draft' });
      setValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  if (scheduledAt) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-sm text-foreground"><span className="material-icons text-base text-primary">event</span>Scheduled {scheduledLabel(scheduledAt)}</span>
        <button type="button" disabled={disabled || busy} onClick={() => patch(null)} className={`${sBtnGhost} disabled:opacity-50`}>Unschedule</button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </span>
    );
  }
  return (
    <form className="inline-flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (value) void patch(new Date(value).toISOString()); }}>
      <input type="datetime-local" aria-label="Send time" value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled || busy}
        className="rounded-[9px] border border-border bg-card px-2 py-[5px] text-[12.5px] text-foreground outline-none focus:border-primary" />
      <button type="submit" disabled={disabled || busy || !value} className={`${sBtn} disabled:opacity-50`}>
        <span className="material-icons text-base">event</span>{busy ? 'Scheduling…' : 'Schedule'}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  );
}
