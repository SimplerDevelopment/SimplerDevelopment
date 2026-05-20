/**
 * Fallback page for `/portal/apps/<slug>/<...remainder>` when the
 * middleware proxy rewrite does NOT land — e.g. during local dev where the
 * plugin host is unreachable, or the very brief window between auth and the
 * rewrite firing. In normal operation the middleware (Worker 2C) catches
 * the request before it ever hits this server component, so this page is
 * intentionally minimal.
 *
 * `force-dynamic` because the appId is a runtime parameter — Next mustn't
 * try to statically render this for any specific slug at build time.
 * Revalidate=0 doubles down: we never want a stale "Loading…" page.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PluginAppFallbackPage({
  params,
}: {
  params: Promise<{ appId: string; slug?: string[] }>;
}) {
  // We read params for the side effect of resolving them — Next 16 requires
  // awaiting before any conditional render. We don't actually need the value.
  await params;

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <span
          className="material-icons animate-spin text-3xl"
          aria-hidden="true"
        >
          progress_activity
        </span>
        <p className="text-sm">Loading&hellip;</p>
      </div>
    </div>
  );
}
