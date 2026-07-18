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
/**
 * Selectable controls. The `*Sel`/`*Soft` variants are SELF-CONTAINED — render
 * `active ? obPillSel : obPill`, never `${obPill} ${obPillSel}`. Concatenating
 * leaves both `text-foreground` and `text-background` on the element and the
 * stylesheet order (not string order) picks the winner — that shipped as
 * unreadable dark-on-dark selected pills (OBQA-023).
 */
export const obTile =
  'flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left text-[14px] font-semibold text-foreground transition hover:border-foreground/20 hover:bg-muted/40';
export const obTileSel =
  'flex items-center gap-3 rounded-2xl border border-primary bg-primary/[0.06] px-4 py-3.5 text-left text-[14px] font-semibold text-foreground ring-2 ring-primary/20 transition';

/**
 * Pills. `obPill` = unselected; `obPillSel` = filled (single-select);
 * `obPillSoft` = tinted (multi-select). Each is COMPLETE — render exactly one
 * (`active ? obPillSel : obPill`), never stack them: stacking used to put
 * text-foreground and text-background on the same element and stylesheet order
 * picked the wrong winner (dark-on-dark selected pills).
 */
const obPillBase = 'rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition';
export const obPill = `${obPillBase} border-border bg-card text-foreground hover:border-foreground/25`;
export const obPillSel = `${obPillBase} border-foreground bg-foreground text-background hover:border-foreground`;
export const obPillSoft = `${obPillBase} border-primary bg-primary/[0.08] text-primary hover:border-primary`;

/** Icon chip used inside tiles / segment headers. Render `active ? obChipOn : obChip`. */
export const obChip =
  'grid h-9 w-9 flex-none place-items-center rounded-xl bg-muted text-muted-foreground transition';
export const obChipOn =
  'grid h-9 w-9 flex-none place-items-center rounded-xl bg-primary text-primary-foreground transition';

// ── surfaces ────────────────────────────────────────────────────────────────
export const obPanel = 'rounded-2xl border border-border bg-card p-4';
export const obFootbar =
  'mt-6 flex items-center justify-between gap-4 rounded-2xl border border-border bg-[var(--portal-surface-2)] px-4 py-3.5';
