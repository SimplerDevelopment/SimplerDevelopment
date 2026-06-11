'use client';

/**
 * Client island for the "Enable Company Brain" button on the brain landing
 * page. Posts to the existing settings endpoint, then triggers a router
 * refresh so the server-rendered page re-fetches the profile and swaps the
 * onboarding screen for the dashboard.
 *
 * Kept as a tiny dedicated component so the parent page can stay an RSC
 * (and thus get the cached `getDashboardSummary` benefit) — the rest of the
 * onboarding shell is plain server-rendered markup.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface SettingsResponse {
  success: boolean;
  data?: unknown;
  message?: string;
}

export function EnableBrainButton() {
  const router = useRouter();
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onClick = async () => {
    setEnabling(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const json: SettingsResponse = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to enable Company Brain.');
      } else {
        // RSC needs to re-fetch the profile to flip into the dashboard view.
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setEnabling(false);
    }
  };

  return (
    <>
      <button
        onClick={onClick}
        disabled={enabling}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {enabling ? (
          <>
            <span className="material-icons animate-spin text-base">progress_activity</span>
            Enabling…
          </>
        ) : (
          <>
            <span className="material-icons text-base">power_settings_new</span>
            Enable Company Brain
          </>
        )}
      </button>
      {error && (
        <p className="mt-3 text-xs text-destructive">{error}</p>
      )}
    </>
  );
}
