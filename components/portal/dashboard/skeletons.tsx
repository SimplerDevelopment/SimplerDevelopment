/**
 * Server-safe skeleton components for dashboard widget Suspense fallbacks.
 * No 'use client' — safe to import from RSC pages.
 */

/** A single shimmer row at a given width fraction */
function SkRow({ width = 'w-full' }: { width?: string }) {
  return (
    <div
      className={`h-[13px] rounded-[5px] bg-muted ${width}`}
      style={{
        backgroundImage: 'linear-gradient(90deg,hsl(var(--muted)) 25%,color-mix(in srgb,hsl(var(--muted)) 60%,transparent) 37%,hsl(var(--muted)) 63%)',
        backgroundSize: '400% 100%',
        animation: 'widget-shimmer 1.3s ease infinite',
      }}
    />
  );
}

export function WidgetSkeleton() {
  return (
    <>
      {/* Inject shimmer keyframes once via a style tag — safe in RSC */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes widget-shimmer {
          0%   { background-position: 100% 0 }
          100% { background-position: -100% 0 }
        }
      `}} />
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border">
          <div className="w-5 h-5 rounded bg-muted/40 shrink-0" />
          <div className="h-3.5 rounded bg-muted/40 w-28" />
        </div>
        {/* Body rows — shimmer lines at varying widths */}
        <div className="px-4 py-4 flex flex-col gap-[11px] min-h-[140px]">
          <SkRow />
          <SkRow width="w-[85%]" />
          <SkRow width="w-[70%]" />
          <SkRow width="w-[55%]" />
        </div>
      </div>
    </>
  );
}
