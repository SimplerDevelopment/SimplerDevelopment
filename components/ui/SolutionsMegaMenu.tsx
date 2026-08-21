'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getAllSolutions } from '@/lib/data/solutions';
import { getSolutionArt } from '@/lib/data/solution-art';

/**
 * Desktop "Solutions" nav item with a full-width mega-menu pane. Hovering (or
 * focusing) the trigger reveals every platform solution as a card — the same
 * visual language as the cards on the /solutions page (tinted background,
 * watermark number, icon, feature checks) — laid out in a grid.
 */
export function SolutionsMegaMenu() {
  const pathname = usePathname();
  const solutions = getAllSolutions();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openNow = () => {
    cancelClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  // Close the pane whenever the route changes. Guarded so we only write state
  // when the pane is actually open — syncing visibility to the route is a
  // legitimate effect, not a cascading-render smell.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setOpen(false);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => cancelClose(), []);

  const isActive = pathname === '/solutions' || pathname.startsWith('/solutions/');

  return (
    <div
      className="static"
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
      onFocus={openNow}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) scheduleClose();
      }}
    >
      <Link
        href="/solutions"
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-1 text-sm font-semibold transition-colors ${
          isActive
            ? 'text-[var(--retro-gold)]'
            : 'text-[color-mix(in_srgb,var(--retro-cream)_85%,transparent)] hover:text-[var(--retro-gold)]'
        }`}
      >
        Solutions
        <span
          className={`material-icons text-base transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </Link>

      {/* Mega pane — breaks out of the nav container to span the viewport. */}
      <div
        className={`fixed left-0 right-0 top-16 z-40 transition-all duration-200 ${
          open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
      >
        <div className="container mx-auto px-4">
          <div className="retro overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--retro-gold)_30%,transparent)] bg-[var(--retro-ink)] text-[var(--retro-cream)]">
            {/* Header */}
            <div className="flex items-end justify-between gap-4 border-b border-[color-mix(in_srgb,var(--retro-gold)_25%,transparent)] px-6 pt-6 pb-4">
              <div>
                <p className="eyebrow eyebrow--on-ink mb-1">{`// PLATFORM`}</p>
                <h2 className="font-display text-2xl font-bold leading-tight">
                  Every tool your business needs
                </h2>
              </div>
              <Link
                href="/solutions"
                className="hidden lg:inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-[var(--retro-orange)] transition-all hover:gap-2"
              >
                View all {solutions.length} solutions
                <span className="material-icons text-lg">arrow_forward</span>
              </Link>
            </div>

            {/* Card grid */}
            <div className="max-h-[72vh] overflow-y-auto p-5">
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {solutions.map((solution, index) => {
                  const art = getSolutionArt(solution.slug);
                  return (
                  <Link
                    key={solution.slug}
                    href={`/solutions/${solution.slug}`}
                    onClick={() => setOpen(false)}
                    className="group relative overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--retro-gold)_25%,transparent)] p-4 transition-colors hover:border-[var(--retro-gold)]"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--retro-cream) 6%, transparent)' }}
                  >
                    {/* Card-background art, where the module has any. Rendered
                        FIRST so it sits under the watermark and the z-10
                        content layer without needing a z-index of its own.
                        The art is already quiet and mostly dark negative space
                        by design, but the scrim guarantees the feature list
                        stays legible over the brighter motifs (the CRM and
                        contracts pieces have the most light in them).
                        Absent `art` renders nothing and the card looks exactly
                        as it did before — which is how the seven modules
                        without art still work. */}
                    {art && (
                      <>
                        <Image
                          src={art}
                          alt=""
                          fill
                          sizes="(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, 45vw"
                          className="absolute inset-0 object-cover opacity-80 transition-opacity duration-200 group-hover:opacity-100"
                        />
                        <span
                          aria-hidden
                          className="absolute inset-0"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--retro-ink) 55%, transparent)' }}
                        />
                      </>
                    )}

                    {/* Watermark number */}
                    <span
                      className="absolute -right-1 -top-3 text-5xl font-black leading-none select-none pointer-events-none"
                      style={{ color: 'color-mix(in srgb, var(--retro-gold) 14%, transparent)' }}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <span
                      className="material-icons relative z-10 mb-3 block"
                      style={{ color: 'var(--retro-gold)', fontSize: '30px' }}
                    >
                      {solution.icon}
                    </span>

                    <h3 className="font-display relative z-10 mb-2 text-sm font-bold transition-colors group-hover:text-[var(--retro-gold)]">
                      {solution.badge}
                    </h3>

                    <ul className="relative z-10 grid grid-cols-1 gap-1.5">
                      {solution.features.slice(0, 3).map((feature, fi) => (
                        <li key={fi} className="flex items-start gap-1.5 text-xs leading-snug">
                          <span
                            className="material-icons text-sm flex-shrink-0"
                            style={{ color: 'var(--retro-orange)' }}
                          >
                            check
                          </span>
                          <span className="text-[color-mix(in_srgb,var(--retro-cream)_70%,transparent)]">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
