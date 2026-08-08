/**
 * Retro-future primitives for the public marketing pages.
 *
 * One dark ground, one light paper, one warm accent, gold for ornament. The
 * eight values live in `app/globals.css` under `.retro` and this file only
 * composes them — never inline a hex here, or the next palette change has to
 * hunt for it (that is exactly how StarField ended up painting stars in the
 * previous palette after the 2026-08-07 swap to Deep Space).
 *
 * The period read comes from restraint, not decoration: flat fills, hairline
 * rules, hard corners (4-6px, never pill), and wide-tracked uppercase display
 * type. Anything soft — big radii, blur, gradient fills, drop shadows — reads
 * as 2020s SaaS and breaks it immediately. That is why there are no shadow
 * utilities anywhere below.
 */
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

// ─── Ornament ───────────────────────────────────────────────────────────────

/** Four-pointed star. The board uses it as the universal separator. */
export function Star({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`inline-block ${className}`} fill="currentColor">
      <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
    </svg>
  );
}

/**
 * Eyebrow + heading, star-flanked. Every band on the board opens with one, so
 * consistency here is most of what makes the pages feel like a single system.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  onDark = false,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: 'center' | 'left';
  onDark?: boolean;
}) {
  const centered = align === 'center';
  return (
    <div className={`${centered ? 'text-center mx-auto max-w-3xl' : 'text-left'} mb-10`}>
      {eyebrow && (
        // `onDark` already tells us which ground this sits on, so it also picks
        // the eyebrow ink: real gold on ink, burnt amber on cream (gold is only
        // 1.6:1 there). The stars stay gold on both — ornament, not text.
        <p
          className={`eyebrow flex items-center gap-3 ${onDark ? 'eyebrow--on-ink' : ''} ${
            centered ? 'justify-center' : ''
          }`}
        >
          <Star className="h-3 w-3 text-[var(--retro-gold)]" />
          {eyebrow}
          <Star className="h-3 w-3 text-[var(--retro-gold)]" />
        </p>
      )}
      <h2
        className={`font-display mt-3 text-3xl font-extrabold leading-tight sm:text-4xl ${
          onDark ? 'text-[var(--retro-cream)]' : 'text-[var(--retro-ink)]'
        }`}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={`mt-4 text-base leading-relaxed ${
            onDark
              ? 'text-[color-mix(in_srgb,var(--retro-cream)_78%,transparent)]'
              : 'text-[color-mix(in_srgb,var(--retro-ink)_75%,transparent)]'
          }`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

/** Thin orbital rule from the artifact set — a band separator, not a border. */
export function OrbitDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`flex justify-center py-10 ${className}`} aria-hidden>
      <Image src="/retro/orbit-divider.webp" alt="" width={420} height={40} className="h-8 w-auto opacity-70" />
    </div>
  );
}

// ─── Actions ────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded px-6 py-3 text-sm font-bold ' +
  'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-[var(--retro-gold)] focus-visible:ring-offset-2';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--retro-orange)] text-[var(--retro-cream)] hover:bg-[var(--retro-rust)] ' +
    'focus-visible:ring-offset-[var(--retro-cream)]',
  secondary:
    'bg-[var(--retro-cream)] text-[var(--retro-ink)] border border-[var(--retro-ink)] ' +
    'hover:bg-[color-mix(in_srgb,var(--retro-gold)_22%,var(--retro-cream))] ' +
    'focus-visible:ring-offset-[var(--retro-cream)]',
  ghost:
    'text-[var(--retro-cream)] border border-[color-mix(in_srgb,var(--retro-cream)_45%,transparent)] ' +
    'hover:bg-[color-mix(in_srgb,var(--retro-cream)_12%,transparent)] ' +
    'focus-visible:ring-offset-[var(--retro-ink)]',
};

export function RetroButton({
  href,
  children,
  variant = 'primary',
  icon,
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  icon?: 'rocket' | 'arrow';
  className?: string;
}) {
  return (
    <Link href={href} className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}>
      {children}
      {icon === 'rocket' && <span aria-hidden>🚀</span>}
      {icon === 'arrow' && <span aria-hidden>→</span>}
    </Link>
  );
}

// ─── Surfaces ───────────────────────────────────────────────────────────────

/**
 * Feature card. `accent` is the filled-orange variant from the board — it is
 * meant to mark exactly one card in a row as the recommended path, so using it
 * on more than one per row throws the emphasis away.
 */
export function RetroCard({
  title,
  children,
  icon,
  index,
  href,
  accent = false,
}: {
  title: string;
  children: ReactNode;
  icon?: string;
  index?: number;
  href?: string;
  accent?: boolean;
}) {
  const body = (
    <div
      className={`flex h-full flex-col gap-3 rounded-md border p-6 transition-colors ${
        accent
          ? 'border-[var(--retro-rust)] bg-[var(--retro-orange)] text-[var(--retro-cream)]'
          : 'border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)] bg-[var(--retro-cream)] text-[var(--retro-ink)] hover:border-[var(--retro-mid)]'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {typeof index === 'number' && (
            <span
              className={`font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                accent
                  ? 'border-[var(--retro-cream)] text-[var(--retro-cream)]'
                  : 'border-[var(--retro-mid)] text-[var(--retro-mid)]'
              }`}
            >
              {String(index).padStart(2, '0')}
            </span>
          )}
          <h3 className="font-display text-lg font-bold leading-snug">{title}</h3>
        </div>
        {icon && (
          <Image src={`/retro/${icon}.webp`} alt="" width={120} height={120} className="h-12 w-12 shrink-0 object-contain" />
        )}
      </div>
      <div
        className={`text-sm leading-relaxed ${
          accent ? 'text-[color-mix(in_srgb,var(--retro-cream)_90%,transparent)]' : 'text-[color-mix(in_srgb,var(--retro-ink)_78%,transparent)]'
        }`}
      >
        {children}
      </div>
      {href && (
        <span className={`mt-auto pt-2 text-sm font-bold ${accent ? 'text-[var(--retro-cream)]' : 'text-[var(--retro-orange)]'}`}>
          Learn more →
        </span>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Dark band — the board alternates cream and ink to segment the page. */
export function InkPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`bg-[var(--retro-ink)] text-[var(--retro-cream)] ${className}`}>
      {children}
    </section>
  );
}

export function RetroBadge({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'orange' | 'teal' }) {
  const tones = {
    gold: 'border-[var(--retro-gold)] text-[var(--retro-gold)]',
    orange: 'border-[var(--retro-orange)] text-[var(--retro-orange)]',
    teal: 'border-[var(--retro-mid)] text-[var(--retro-mid)]',
  } as const;
  return (
    <span
      className={`font-display inline-flex items-center rounded border px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-[0.14em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Big number + label. Used for the outcomes strip. */
export function StatBlock({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-3xl font-extrabold text-[var(--retro-orange)] sm:text-4xl">{value}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--retro-ink)]">{label}</div>
      {sub && <div className="text-xs text-[color-mix(in_srgb,var(--retro-ink)_60%,transparent)]">{sub}</div>}
    </div>
  );
}
