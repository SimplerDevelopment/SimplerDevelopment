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
  return (
    <section className="relative isolate overflow-hidden bg-[var(--retro-ink)] text-[var(--retro-cream)]">
      {stars && <StarFieldGate />}
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-6 py-16 sm:py-24 lg:grid-cols-2">
        <div>
          {eyebrow && (
            <p className="eyebrow eyebrow--on-ink flex items-center gap-3">
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
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_82%,transparent)] sm:text-lg">
            {subtitle}
          </p>
          {(primary || secondary) && (
            <div className="mt-8 flex flex-wrap gap-3">
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
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[color-mix(in_srgb,var(--retro-cream)_65%,transparent)]">
              {footnote}
            </div>
          )}
        </div>

        <div className="relative flex justify-center lg:justify-end">
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

/** Logo strip. Names only — the board keeps this quiet and monochrome. */
export function TrustStrip({ eyebrow = 'Trusted by teams shipping in production', names }: { eyebrow?: string; names: string[] }) {
  return (
    <InkPanel className="border-y border-[color-mix(in_srgb,var(--retro-gold)_25%,transparent)]">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <p className="eyebrow eyebrow--on-ink text-center">{eyebrow}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {names.map((n) => (
            <span key={n} className="font-display text-sm font-bold tracking-wide text-[color-mix(in_srgb,var(--retro-cream)_80%,transparent)]">
              {n}
            </span>
          ))}
        </div>
      </div>
    </InkPanel>
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

/** Cream band wrapper — the default page section. */
export function CreamBand({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`bg-[var(--retro-cream)] ${className}`}>
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">{children}</div>
    </section>
  );
}

export function TestimonialCard({ quote, name, role }: { quote: string; name: string; role: string }) {
  return (
    <figure className="flex h-full flex-col rounded-md border border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)] bg-[var(--retro-cream)] p-6">
      <blockquote className="text-sm leading-relaxed text-[var(--retro-ink)]">“{quote}”</blockquote>
      <figcaption className="mt-4 text-xs text-[color-mix(in_srgb,var(--retro-ink)_65%,transparent)]">
        — <span className="font-semibold text-[var(--retro-ink)]">{name}</span>, {role}
      </figcaption>
    </figure>
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
