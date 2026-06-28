import type { ReactNode } from 'react';

/**
 * Shared page header for top-level portal pages — the editorial header pattern
 * from the auth/onboarding redesign: a Geist-Mono uppercase eyebrow, a DM Sans
 * extrabold title, an optional subtitle, and a right-aligned actions slot.
 *
 * Replaces the portal's ad-hoc `<h1 className="text-2xl font-bold">`. Keep the
 * same `title` text a page used before (titles are asserted by some tests).
 *
 *   <PortalPageHeader
 *     eyebrow="Workspace"
 *     title="Dashboard"
 *     subtitle="Everything at a glance."
 *     actions={<button className={pBtnPrimary}>New project</button>}
 *   />
 */
export function PortalPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  /** Optional mono uppercase category label above the title. */
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned controls (buttons, filters). */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className ?? ''}`}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            {eyebrow}
          </div>
        )}
        <h1 className="mt-1.5 font-display text-[clamp(1.5rem,2.4vw,2rem)] font-extrabold leading-[1.05] tracking-[-0.028em] text-foreground">
          {title}
        </h1>
        {subtitle && <div className="mt-1.5 text-[14.5px] text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export default PortalPageHeader;
