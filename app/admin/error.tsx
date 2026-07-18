'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin error boundary]', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="bg-card border border-border rounded-lg p-8 max-w-md w-full space-y-4 text-center">
        <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-destructive/10">
          <span className="material-icons text-destructive text-2xl">error_outline</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mt-1">
            An unexpected error occurred in the admin panel.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground mt-2 font-mono bg-muted px-2 py-1 rounded inline-block">
              Digest: {error.digest}
            </p>
          )}
        </div>
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">refresh</span>
            Try again
          </button>
          <Link
            href="/admin"
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <span className="material-icons text-base">home</span>
            Admin home
          </Link>
        </div>
      </div>
    </div>
  );
}
