'use client';

// Campaign sends are durable/async (PUX-046): the send route enqueues an
// internal_jobs row and flips status to 'sending'; the 1-minute drain cron
// does the dispatch. While a campaign sits in 'sending', poll its detail
// endpoint so the page picks up the terminal status ('sent' / 'ab_testing' /
// 'cancelled') without a manual refresh. Stops when `active` goes false or on
// unmount. `onData` must be referentially stable (useCallback) or the
// interval resets every render.

import { useEffect } from 'react';

const POLL_MS = 10_000;

export function useCampaignSendingPoll(
  id: string,
  active: boolean,
  onData: (data: unknown) => void,
): void {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const t = setInterval(() => {
      fetch(`/api/portal/email/campaigns/${id}`)
        .then(r => r.json())
        .then(d => {
          if (!cancelled) onData(d.data ?? null);
        })
        .catch(() => {
          /* transient poll failure — next tick retries */
        });
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id, active, onData]);
}
