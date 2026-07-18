'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getAllSolutions } from '@/lib/data/solutions';

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
        className={`flex items-center gap-1 text-sm font-heading font-semibold hover:text-primary transition-colors ${
          isActive ? 'text-primary' : ''
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
          <div className="rounded-2xl border bg-background shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-end justify-between gap-4 px-6 pt-6 pb-4 border-b">
              <div>
                <p className="text-primary font-mono text-xs font-semibold tracking-wider mb-1">{`// PLATFORM`}</p>
                <h2 className="font-display text-2xl font-bold leading-tight">
                  Every tool your business needs
                </h2>
              </div>
              <Link
                href="/solutions"
                className="hidden lg:inline-flex items-center gap-1 text-sm font-semibold text-primary hover:gap-2 transition-all whitespace-nowrap"
              >
                View all {solutions.length} solutions
                <span className="material-icons text-lg">arrow_forward</span>
              </Link>
            </div>

            {/* Card grid */}
            <div className="max-h-[72vh] overflow-y-auto p-5">
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {solutions.map((solution, index) => (
                  <Link
                    key={solution.slug}
                    href={`/solutions/${solution.slug}`}
                    onClick={() => setOpen(false)}
                    className="group relative overflow-hidden rounded-xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                    style={{
                      backgroundColor: `${solution.color}08`,
                      borderColor: `${solution.color}20`,
                    }}
                  >
                    {/* Watermark number */}
                    <span
                      className="absolute -right-1 -top-3 text-5xl font-black leading-none select-none pointer-events-none"
                      style={{ color: `${solution.color}12` }}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <span
                      className="material-icons relative z-10 mb-3 block"
                      style={{ color: solution.color, fontSize: '30px' }}
                    >
                      {solution.icon}
                    </span>

                    <h3 className="relative z-10 font-heading font-bold text-sm mb-2 group-hover:text-primary transition-colors">
                      {solution.badge}
                    </h3>

                    <ul className="relative z-10 grid grid-cols-1 gap-1.5">
                      {solution.features.slice(0, 3).map((feature, fi) => (
                        <li key={fi} className="flex items-start gap-1.5 text-xs leading-snug">
                          <span
                            className="material-icons text-sm flex-shrink-0"
                            style={{ color: solution.color }}
                          >
                            check
                          </span>
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
