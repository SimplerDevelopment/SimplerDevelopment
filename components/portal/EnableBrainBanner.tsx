'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function EnableBrainBanner() {
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function enable() {
    setEnabling(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const json: { success: boolean; message?: string } = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to enable Company Brain.');
        return;
      }
      // Re-render the dashboard with the brain widgets now visible.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setEnabling(false);
    }
  }

  return (
    <div className="bg-gradient-to-r from-primary/10 via-purple-500/10 to-pink-500/10 border border-primary/20 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <span className="material-icons text-primary text-3xl shrink-0">psychology</span>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">Turn this dashboard into a command center</h3>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
              Enable Company Brain to surface pending reviews, overdue tasks, stale prospects, and recent automation runs right here.
              AI proposes — you approve. <Link href="/portal/brain" className="text-primary hover:underline">Learn more</Link>.
            </p>
            {error && (
              <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                <span className="material-icons text-sm">error_outline</span>
                {error}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={enable}
          disabled={enabling}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0 disabled:opacity-50"
        >
          {enabling
            ? <><span className="material-icons animate-spin text-base">progress_activity</span>Enabling…</>
            : <><span className="material-icons text-base">power_settings_new</span>Enable Company Brain</>
          }
        </button>
      </div>
    </div>
  );
}
