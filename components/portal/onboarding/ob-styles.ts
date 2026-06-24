/**
 * Shared Direction-A style tokens for the onboarding wizard, mirroring the
 * portal auth pages (`AuthShell`). One source of truth so the shell and all 12
 * step components stay visually locked: DM Sans display headings, Geist Mono
 * eyebrows, single blue accent, black (`bg-foreground`) primary buttons,
 * `rounded-xl` fields. Steps import these instead of hand-rolling classNames.
 */

// ── typography ──────────────────────────────────────────────────────────────
export const obEyebrow =
  'font-mono text-[11.5px] font-semibold uppercase tracking-[0.18em] text-primary';
export const obHeading =
  'mt-2.5 font-display text-[clamp(1.55rem,2.4vw,2rem)] font-extrabold leading-[1.06] tracking-[-0.028em] text-foreground';
export const obSubtext = 'mt-2 text-[15px] leading-relaxed text-muted-foreground';
export const obLabel = 'mb-2 block text-[13px] font-semibold text-foreground';
export const obHint = 'mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground';

// ── form fields ─────────────────────────────────────────────────────────────
export const obInput =
  'w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[14.5px] text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15';
export const obTextarea =
  'w-full resize-none rounded-xl border border-border bg-card px-3.5 py-3 text-[14.5px] leading-relaxed text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15';
export const obSelect =
  'w-full appearance-none rounded-xl border border-border bg-card px-3.5 py-3 pr-10 text-[14.5px] text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15';

// ── buttons ─────────────────────────────────────────────────────────────────
export const obPrimaryBtn =
  'group inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-3 text-[14.5px] font-bold text-background transition hover:-translate-y-px hover:shadow-lg hover:shadow-foreground/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0';
export const obGhostBtn =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:border-foreground/25 hover:shadow-sm disabled:opacity-50';
/** Quiet text link — the "Skip this" / inline-skip affordance. */
export const obQuietLink =
  'text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground';

// ── selectable controls ─────────────────────────────────────────────────────
/** Base tile (role / feature cards). Compose with `obTileSel` when selected. */
export const obTile =
  'flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left text-[14px] font-semibold text-foreground transition hover:border-foreground/20 hover:bg-muted/40';
export const obTileSel = 'border-primary bg-primary/[0.06] ring-2 ring-primary/20';

/** Base pill. `obPillSel` = filled (single-select); `obPillSoft` = tinted (multi-select). */
export const obPill =
  'rounded-xl border border-border bg-card px-4 py-2.5 text-[13.5px] font-semibold text-foreground transition hover:border-foreground/25';
export const obPillSel = 'border-foreground bg-foreground text-background hover:border-foreground';
export const obPillSoft = 'border-primary bg-primary/[0.08] text-primary hover:border-primary';

/** Icon chip used inside tiles / segment headers. */
export const obChip =
  'grid h-9 w-9 flex-none place-items-center rounded-xl bg-muted text-muted-foreground transition';
export const obChipOn = 'bg-primary text-primary-foreground';

// ── surfaces ────────────────────────────────────────────────────────────────
export const obPanel = 'rounded-2xl border border-border bg-card p-4';
export const obFootbar =
  'mt-6 flex items-center justify-between gap-4 rounded-2xl border border-border bg-[var(--portal-surface-2)] px-4 py-3.5';
