/**
 * Composed retro sections — the bands every marketing page is assembled from.
 *
 * These mirror the "section & component library" board one-for-one so that a
 * page is a list of bands rather than bespoke layout. If a page needs a shape
 * that is not here, add it here rather than inline: the value of the system is
 * that all 15 public pages alternate the same cream/ink rhythm.
 */
import Image from 'next/image';
import type { ReactNode } from 'react';
import { RetroButton, SectionHeading, Star, InkPanel } from './primitives';
// (re-exported at the bottom for pages that treat this file as the entry point)
// Client island — keeps these sections usable from Server Components. See the
// gate's header for why the dynamic import can't live here.
import StarFieldGate from './StarFieldGate';
import HeroConsoleGate from './HeroConsoleGate';

/**
 * Hero. `art` names a file in /public/retro — the illustration sits right of
 * the copy on desktop and drops below it on mobile, per the responsive board.
 */
export function RetroHero({
  eyebrow,
  title,
  accent,
  subtitle,
  primary,
  secondary,
  art = 'city-launch',
  video = false,
  footnote,
  stars = true,
}: {
  eyebrow?: string;
  title: string;
  accent?: string;
  subtitle: ReactNode;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  art?: string;
  /** Swap the still illustration for the animated console (homepage only). */
  video?: boolean;
  footnote?: ReactNode;
  stars?: boolean;
}) {
  /* The video hero stacks: copy centred on top, console full-width beneath.
     The side-by-side grid is kept for the still-illustration callers, whose
     art is roughly 3:2 and sits happily in a half-width column. The console
     clip is 3.4:1 — in that same column it reads as a thin strip, and it has
     detail (five running screens) that is the whole point of using it, so it
     wants the full page width. */
  const stacked = video;

  return (
    <section className="relative isolate overflow-hidden bg-[var(--retro-ink)] text-[var(--retro-cream)]">
      {stars && <StarFieldGate />}
      <div
        className={`relative mx-auto max-w-7xl px-6 ${
          stacked
            ? 'pt-8 pb-0 sm:pt-10'
            : 'grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-2'
        }`}
      >
        <div className={stacked ? 'mx-auto max-w-5xl text-center' : ''}>
          {eyebrow && (
            <p className={`eyebrow eyebrow--on-ink flex items-center gap-3 ${stacked ? 'justify-center' : ''}`}>
              <Star className="h-3 w-3" />
              {eyebrow}
            </p>
          )}
          <h1 className="font-display mt-4 text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
            {title}
            {accent && (
              <>
                <br />
                <span className="text-[var(--retro-orange)]">{accent}</span>
              </>
            )}
          </h1>
          <p
            className={`mt-5 max-w-xl text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)] sm:text-lg ${
              stacked ? 'mx-auto' : ''
            }`}
          >
            {subtitle}
          </p>
          {(primary || secondary) && (
            <div className={`mt-8 flex flex-wrap gap-3 ${stacked ? 'justify-center' : ''}`}>
              {primary && (
                <RetroButton href={primary.href} variant="primary" icon="rocket">
                  {primary.label}
                </RetroButton>
              )}
              {secondary && (
                <RetroButton href={secondary.href} variant="ghost" icon="arrow">
                  {secondary.label}
                </RetroButton>
              )}
            </div>
          )}
          {footnote && (
            <div
              className={`mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[color-mix(in_srgb,var(--retro-cream)_65%,transparent)] ${
                stacked ? 'justify-center' : ''
              }`}
            >
              {footnote}
            </div>
          )}
        </div>

        <div className={stacked ? 'relative mt-10 flex justify-center'  : 'relative flex justify-center lg:justify-end'}>
          {video ? (
            <HeroConsoleGate />
          ) : (
            <Image
              src={`/retro/${art}.webp`}
              alt=""
              width={900}
              height={600}
              priority
              className="h-auto w-full max-w-lg object-contain drop-shadow-none"
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** Closing call to action. One per page, always the last band before the footer. */
export function CTABanner({
  title,
  subtitle,
  primary,
  secondary,
  art = 'rocket',
}: {
  title: string;
  subtitle?: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
  art?: string;
}) {
  return (
    <InkPanel>
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-6 py-14 md:flex-row md:justify-between">
        <div className="flex items-center gap-6">
          <Image src={`/retro/${art}.webp`} alt="" width={200} height={200} className="hidden h-20 w-20 object-contain sm:block" />
          <div>
            <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h2>
            {subtitle && (
              <p className="mt-2 text-sm text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <RetroButton href={primary.href} variant="primary" icon="rocket">
            {primary.label}
          </RetroButton>
          {secondary && (
            <RetroButton href={secondary.href} variant="ghost" icon="arrow">
              {secondary.label}
            </RetroButton>
          )}
        </div>
      </div>
    </InkPanel>
  );
}

/**
 * Cream band wrapper — the default page section.
 *
 * `id` makes the band an in-page anchor target. It carries `scroll-mt-16`
 * because the nav is `fixed` at `h-16`: without the offset an anchored jump
 * parks the band's heading underneath the bar, which reads as "the link went
 * to the wrong place".
 */
export function CreamBand({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`bg-[var(--retro-cream)] ${id ? 'scroll-mt-16' : ''} ${className}`}>
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">{children}</div>
    </section>
  );
}

/** Page header for interior pages that don't warrant a full hero. */
export function PageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: ReactNode }) {
  return (
    <InkPanel className="relative isolate overflow-hidden">
      <div className="mx-auto max-w-4xl px-6 py-14 text-center sm:py-20">
        {eyebrow && (
          <p className="eyebrow eyebrow--on-ink flex items-center justify-center gap-3">
            <Star className="h-3 w-3" />
            {eyebrow}
            <Star className="h-3 w-3" />
          </p>
        )}
        <h1 className="font-display mt-4 text-3xl font-extrabold leading-tight sm:text-5xl">{title}</h1>
        {subtitle && (
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_80%,transparent)]">
            {subtitle}
          </p>
        )}
      </div>
    </InkPanel>
  );
}

/**
 * Re-exported primitives.
 *
 * Pages naturally reach for `sections` as the single entry point and import
 * things like InkPanel from here — which used to fail at build time. Because
 * these are all in one module graph, ONE bad import 500s every route in the
 * `(pages)` group, not just the page with the typo. Re-exporting removes the
 * distinction rather than asking every author to remember which file a given
 * component lives in.
 */
export {
  SectionHeading,
  InkPanel,
  RetroCard,
  RetroButton,
  RetroBadge,
  StatBlock,
  OrbitDivider,
  Star,
} from './primitives';
