'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';

type QueueResult = { queued: true; totalTargets: number };

export function useCampaignSend<T extends { name: string; status: string }>(
  id: string, campaign: T | null, setCampaign: Dispatch<SetStateAction<T | null>>,
) {
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<QueueResult | null>(null);
  async function sendCampaign() {
    if (!campaign) return;
    const resuming = campaign.status === 'partial' || campaign.status === 'failed';
    const prompt = resuming ? `Resume the undelivered recipients of "${campaign.name}"?`
      : `Send "${campaign.name}" to all active subscribers now?`;
    if (!confirm(prompt)) return;
    setSending(true);
    try {
      const response = await fetch(`/api/portal/email/campaigns/${id}/send`, { method: 'POST' });
      const result = await response.json();
      if (!result.success) { alert(result.message); return; }
      setSendResult(result.data);
      setCampaign(previous => previous ? { ...previous, status: 'sending' } : previous);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Campaign could not be queued');
    } finally { setSending(false); }
  }
  return { sending, sendResult, sendCampaign };
}
