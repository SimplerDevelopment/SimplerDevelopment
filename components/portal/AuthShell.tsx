'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAgencyChrome } from '@/components/portal/AgencyChromeProvider';

/**
 * Split-screen shell for the portal auth pages (login / signup / forgot).
 * Left: the form (children). Right: a bold, drifting color-mesh brand panel
 * that renders the *tenant's* brandName — brand-agnostic so it stays correct
 * under white-label. The panel is hidden below `lg` so the form goes full-width
 * on mobile.
 */
export function AuthShell({
  children,
  panelTitle,
  panelSubtitle = 'Sign in to your command center.',
}: {
  children: ReactNode;
  /** Overrides the big panel heading. Defaults to the tenant brand name. */
  panelTitle?: string;
  panelSubtitle?: string;
}) {
  const { brandName } = useAgencyChrome();

  return (
    // `w-full` is load-bearing: the portal layout centers auth pages inside a
    // `flex justify-center` wrapper (for the old centered-card pages). Without
    // w-full this full-bleed split shrinks to content width and leaves a gap.
    <div className="grid min-h-screen w-full lg:grid-cols-[46%_54%]">
      {/* LEFT — form */}
      <div className="relative flex flex-col justify-center bg-background px-6 py-16 sm:px-12 lg:px-[7vw]">
        {/* wordmark — the main-site logo (icon + Simpler Development), from the
            top-nav. Note: this is the platform mark, not the tenant brand. */}
        <Link
          href="/"
          className="absolute left-5 top-6 flex items-center font-heading text-xl text-foreground sm:left-11 lg:left-[6.5vw]"
        >
          <Image src="/iconLogo.png" alt="" width={56} height={56} className="nav-logo-icon" priority />
          <span>
            <b>Simpler</b> Development
          </span>
        </Link>

        <div className="mx-auto w-full max-w-[400px] lg:mx-0">{children}</div>
      </div>

      {/* RIGHT — living brand panel (hidden on small screens) */}
      <div className="relative hidden overflow-hidden bg-[#0e0d0c] px-[6vw] text-white lg:flex lg:flex-col lg:justify-center">
        <div className="auth-mesh">
          <span className="auth-blob" style={{ width: 520, height: 520, background: '#2563eb', top: '-6%', left: '6%' }} />
          <span className="auth-blob" style={{ width: 460, height: 460, background: '#10b981', bottom: '-10%', left: '30%', animationDelay: '-6s' }} />
          <span className="auth-blob" style={{ width: 420, height: 420, background: '#f59e0b', top: '22%', right: '-6%', animationDelay: '-11s' }} />
        </div>
        <div className="auth-grain" />

        <div className="relative z-10 max-w-[520px]">
          <div className="mb-5 flex items-center gap-2.5 font-mono text-[12px] uppercase tracking-[0.2em] text-white/55">
            <span className="auth-dot inline-block h-[7px] w-[7px] rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
            Client Portal
          </div>
          <h2 className="font-display text-[clamp(2.5rem,4vw,3.4rem)] font-extrabold leading-[1.03] tracking-[-0.03em]">
            {panelTitle ?? brandName}
          </h2>
          <p className="mt-5 max-w-[420px] text-[17px] leading-relaxed text-white/65">{panelSubtitle}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Shared Direction-A form styles (keep the 3 auth pages consistent) ──────── */
export const authEyebrow = 'font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-primary';
export const authHeading = 'mt-3 font-display text-[clamp(1.85rem,3vw,2.25rem)] font-extrabold leading-[1.06] tracking-[-0.025em] text-foreground';
export const authSubtext = 'mt-2 text-[15px] text-muted-foreground';
export const authLabel = 'mb-1.5 block text-[13px] font-semibold text-foreground';
export const authInput =
  'w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15';
export const authPrimaryBtn =
  'group flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[15px] font-bold text-background transition hover:-translate-y-px hover:shadow-lg hover:shadow-foreground/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0';
export const authGhostBtn =
  'flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition hover:border-foreground/25 hover:shadow-md';

/** Icon-prefixed field wrapper. Pass the input (using `authInput`) as children. */
export function AuthField({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="material-icons pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-muted-foreground/70">
        {icon}
      </span>
      {children}
    </div>
  );
}

/** "or with email" divider. */
export function AuthDivider({ label = 'or with email' }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3.5 text-[12.5px] text-muted-foreground/70">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
