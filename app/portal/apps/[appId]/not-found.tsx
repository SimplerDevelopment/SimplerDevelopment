/**
 * Rendered when `findActivePluginBySlug` returns null from the entitlement
 * layout — either the slug doesn't match any `registered_apps` row, or the
 * row exists but is `status='draft'` / `status='disabled'`. We deliberately
 * do NOT distinguish those two cases in the UI: leaking "this plugin exists
 * but is disabled" tells unauthorised clients more than they need to know.
 */

import Link from 'next/link';

export default function PluginNotFound() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <span className="material-icons text-5xl text-muted-foreground mb-3 block">
          extension_off
        </span>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Plugin not found
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
          We couldn&rsquo;t find an active plugin matching this URL. It may
          have been disabled, or the link may be out of date.
        </p>

        <div className="flex flex-col items-center gap-3">
          <Link
            href="/portal/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">arrow_back</span>
            Back to dashboard
          </Link>

          <Link
            href="/portal"
            className="text-xs text-muted-foreground hover:underline"
          >
            Browse the portal
          </Link>
        </div>
      </div>
    </div>
  );
}
