'use client';

/**
 * Caught when the plugin proxy / rewrite throws — most often when the
 * upstream plugin host returns 5xx, the rewrite target is unreachable, or
 * the JWT mint fails. We render a generic "temporarily unavailable" screen
 * with a retry button rather than spilling the underlying error, since the
 * underlying error message often references the plugin's host URL.
 *
 * The `digest` (when present) is the only server-correlated identifier we
 * surface — operators looking at Vercel logs can grep for it.
 */

import { useEffect } from 'react';
import Link from 'next/link';

export default function PluginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[portal/apps] plugin proxy error:', error);
    }
  }, [error]);

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <span className="material-icons text-5xl text-amber-500 mb-3 block">
          warning_amber
        </span>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Plugin temporarily unavailable
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
          We couldn&rsquo;t reach this plugin right now. It&rsquo;s usually a
          transient issue &mdash; try again in a moment. If the problem
          persists, contact your account manager.
        </p>

        {error.digest && (
          <p className="text-xs text-muted-foreground mb-6 font-mono">
            Reference: {error.digest}
          </p>
        )}

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">refresh</span>
            Retry
          </button>

          <Link
            href="/portal/dashboard"
            className="text-xs text-muted-foreground hover:underline"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
