/**
 * Shared portal style tokens — the Direction-A design language (auth +
 * onboarding) expressed as className strings for the portal's hand-rolled
 * pages. The portal has no shadcn/cva primitive layer, so pages compose these
 * to stay visually consistent: Geist/DM Sans type, single blue accent, black
 * (`bg-foreground`) primary buttons, rounded-xl surfaces, mono eyebrows.
 *
 * Pair with <PortalPageHeader/> for page titles. Import what you need:
 *   import { pBtnPrimary, pCard } from '@/components/portal/portal-ui';
 */

// ── typography ──────────────────────────────────────────────────────────────
export const pEyebrow =
  'font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary';
export const pTitle =
  'font-display text-[clamp(1.5rem,2.4vw,2rem)] font-extrabold leading-[1.05] tracking-[-0.028em] text-foreground';
export const pSectionTitle =
  'font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground';
export const pSubtext = 'text-[14.5px] text-muted-foreground';

// ── buttons ─────────────────────────────────────────────────────────────────
/** Primary CTA — black (`bg-foreground`), matches auth/onboarding. */
export const pBtnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background transition hover:-translate-y-px hover:shadow-lg hover:shadow-foreground/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0';
/** Secondary — bordered. */
export const pBtnGhost =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-foreground/25 hover:shadow-sm disabled:opacity-50';
/** Subtle blue-tinted action (keeps the accent for non-primary affordances). */
export const pBtnSoft =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/15';

// ── surfaces & fields ───────────────────────────────────────────────────────
export const pCard = 'rounded-2xl border border-border bg-card';
export const pCardPad = 'rounded-2xl border border-border bg-card p-5';
export const pInput =
  'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15';
export const pSelect =
  'w-full appearance-none rounded-xl border border-border bg-card px-3.5 py-2.5 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15';

// ── chips / pills ───────────────────────────────────────────────────────────
export const pChip =
  'inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-[12px] font-semibold text-muted-foreground';
