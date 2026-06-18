/**
 * Server-safe skeleton components for dashboard widget Suspense fallbacks.
 * No 'use client' — safe to import from RSC pages.
 */

export function WidgetSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl animate-pulse">
      {/* header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <div className="w-5 h-5 bg-muted/40 rounded" />
        <div className="h-4 bg-muted/40 rounded w-32" />
      </div>
      {/* body */}
      <div className="p-5 space-y-2">
        <div className="h-4 bg-muted/40 rounded w-3/4" />
        <div className="h-4 bg-muted/40 rounded w-1/2" />
        <div className="h-4 bg-muted/40 rounded w-2/3" />
      </div>
    </div>
  );
}
