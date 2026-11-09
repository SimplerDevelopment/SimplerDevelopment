'use client';

/**
 * PUX-196 (design doc screen 55): the white-label preview proves the token.
 * AgencyChromeProvider injects --agency-primary at runtime; this inset sets
 * the same variable inline on a miniature rail + button, so the chosen
 * colour visibly swaps without a class changing. '#2563eb' is the real
 * fallback the branding form uses for its swatch.
 */

import type { CSSProperties } from 'react';

export const DEFAULT_AGENCY_COLOR = '#2563eb';

export default function AgencyPreview({ color, name, logoUrl }: { color: string | null; name?: string | null; logoUrl?: string | null }) {
  const style = { '--agency-primary': color || DEFAULT_AGENCY_COLOR } as CSSProperties;
  return (
    <div style={style} className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="White-label preview" data-color={color || DEFAULT_AGENCY_COLOR}>
      <div className="flex" style={{ transform: 'scale(1)' }}>
        <div className="w-24 shrink-0 space-y-2 p-3 text-[10px] text-white/90" style={{ background: 'var(--agency-primary)' }}>
          <div className="flex items-center gap-1.5 font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element -- tenant-supplied logo URL */}
            {logoUrl ? <img src={logoUrl} alt="" className="h-4 w-4 rounded bg-white/90 object-contain" /> : <span className="h-4 w-4 rounded bg-white/30" aria-hidden />}
            <span className="truncate">{name || 'Your agency'}</span>
          </div>
          {['Home', 'Projects', 'Sites', 'Billing'].map((l, i) => (
            <div key={l} className={`rounded px-1.5 py-0.5 ${i === 0 ? 'bg-white/20' : 'opacity-70'}`}>{l}</div>
          ))}
        </div>
        <div className="flex-1 space-y-2 p-3">
          <div className="h-2 w-1/2 rounded bg-muted" />
          <div className="h-2 w-3/4 rounded bg-muted" />
          <span className="inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold text-white" style={{ background: 'var(--agency-primary)' }}>New project</span>
        </div>
      </div>
      <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">Rail and buttons take <code>--agency-primary</code> when white-label is on — this is the same variable, set live.</p>
    </div>
  );
}
