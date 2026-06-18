'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  siteId: number;
}

export default function RequestActivationButton({ siteId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/websites/${siteId}/provision`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to request activation. Please try again.');
      } else {
        setDone(true);
        // Refresh the page so the provisioning banner replaces this one
        router.refresh();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300 font-medium shrink-0">
        <span className="material-icons text-sm">check</span>
        Activation requested
      </span>
    );
  }

  return (
    <div className="shrink-0 flex flex-col items-end gap-1">
      <button
        onClick={handleRequest}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <span className="material-icons text-sm animate-spin" style={{ animationDuration: '1.5s' }}>autorenew</span>
            Requesting…
          </>
        ) : (
          <>
            <span className="material-icons text-sm">rocket_launch</span>
            Request activation
          </>
        )}
      </button>
      {error && (
        <p className="text-[10px] text-red-600 dark:text-red-400 max-w-[220px] text-right">{error}</p>
      )}
    </div>
  );
}
