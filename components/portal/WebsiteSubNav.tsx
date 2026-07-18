'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

interface SiteSummary {
  id: number;
  name: string;
  domain: string | null;
  subdomain: string | null;
  vercelDomain: string | null;
}

interface WebsiteSubNavProps {
  site: SiteSummary;
}

interface NavItem {
  /** Path under the site root, e.g. '' for dashboard, 'entries' for entries. */
  path: string;
  label: string;
  /** Material Icons name. */
  icon: string;
  /** Other route segments that should also light this tab up. */
  matches?: string[];
}

const NAV: NavItem[] = [
  { path: '',                label: 'Dashboard',     icon: 'dashboard' },
  { path: 'entries',         label: 'Entries',       icon: 'article', matches: ['posts'] },
  { path: 'content-types',   label: 'Content Types', icon: 'description' },
  { path: 'taxonomy',        label: 'Taxonomy',      icon: 'account_tree', matches: ['categories', 'tags'] },
  { path: 'navigation',      label: 'Navigation',    icon: 'menu' },
  { path: 'branding',        label: 'Branding',      icon: 'palette' },
  { path: 'code',            label: 'Code',          icon: 'code' },
  { path: 'calendar',        label: 'Calendar',      icon: 'calendar_month' },
  { path: 'automations',     label: 'Automations',   icon: 'bolt' },
  { path: 'email',           label: 'Email',         icon: 'mail' },
  { path: 'store',           label: 'Store',         icon: 'shopping_cart' },
  { path: 'settings',        label: 'Settings',      icon: 'settings' },
];

// Routes that take over the full viewport (their own toolbar + iframe). The
// shared chrome would crowd them, so hide it.
const FULL_SCREEN_PATTERNS = [
  /\/posts\/\d+\/edit$/,
  /\/posts\/new$/,
  /\/content-types\/\d+\/template$/,
  /\/email\/[^/]+$/,
];

export function WebsiteSubNav({ site }: WebsiteSubNavProps) {
  const pathname = usePathname();
  const sitePrefix = `/portal/websites/${site.id}`;

  const isFullScreen = useMemo(
    () => FULL_SCREEN_PATTERNS.some((re) => re.test(pathname)),
    [pathname]
  );

  // Active tab: the one whose path is the deepest prefix of the current
  // segment after `/portal/websites/<id>/`. Empty path = dashboard wins only
  // when nothing else matches.
  const activePath = useMemo(() => {
    const tail = pathname.startsWith(sitePrefix) ? pathname.slice(sitePrefix.length).replace(/^\//, '') : '';
    if (!tail) return '';
    let best: NavItem | null = null;
    for (const item of NAV) {
      if (!item.path) continue;
      const candidates = [item.path, ...(item.matches || [])];
      for (const c of candidates) {
        if (tail === c || tail.startsWith(`${c}/`)) {
          if (!best || item.path.length > best.path.length) best = item;
        }
      }
    }
    return best?.path ?? '';
  }, [pathname, sitePrefix]);

  if (isFullScreen) return null;

  const liveUrl = site.domain
    ? `https://${site.domain}`
    : site.vercelDomain
      ? `https://${site.vercelDomain}`
      : site.subdomain
        ? `https://${site.subdomain}.simplerdevelopment.com`
        : null;
  const subtitle = site.domain || site.vercelDomain || (site.subdomain ? `${site.subdomain}.simplerdevelopment.com` : '');

  return (
    <div className="-mx-6 -mt-6 mb-6 sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
      {/* Site identity row */}
      <div className="px-6 pt-4 pb-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/portal/websites"
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            title="All websites"
          >
            <span className="material-icons text-base">arrow_back</span>
          </Link>
          <Link href={sitePrefix} className="min-w-0 flex items-center gap-2 group">
            <span className="material-icons text-primary shrink-0">language</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{site.name}</span>
              {subtitle && (
                <span className="block text-xs text-muted-foreground font-mono truncate">{subtitle}</span>
              )}
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors"
            >
              <span className="material-icons text-sm">open_in_new</span>
              View site
            </a>
          )}
          <Link
            href={`${sitePrefix}/posts/new`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-sm">add</span>
            New Entry
          </Link>
        </div>
      </div>

      {/* Tabs row — horizontal scroll on narrow viewports rather than wrap, so
          the layout stays predictable. */}
      <div className="px-6 overflow-x-auto">
        <nav className="flex items-center gap-0.5 -mb-px">
          {NAV.map((item) => {
            const href = item.path ? `${sitePrefix}/${item.path}` : sitePrefix;
            const active = item.path === activePath;
            return (
              <Link
                key={item.path || 'dashboard'}
                href={href}
                className={`group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                <span className={`material-icons text-base ${active ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground'}`}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
