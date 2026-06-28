'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PmNotificationBell from './PmNotificationBell';
import CrmNotificationBell from './CrmNotificationBell';
import { useAgencyChrome } from './AgencyChromeProvider';

// Map a portal pathname to a short breadcrumb trail. We avoid threading the
// full nav tree (apps/entitlements/active-site) through the topbar just for a
// label — a segment dictionary + title-case fallback covers every route and
// stays dependency-free.
const SEGMENT_LABELS: Record<string, string> = {
  portal: 'Home',
  dashboard: 'Dashboard',
  brain: 'Company Brain',
  crm: 'CRM',
  email: 'Email',
  publishing: 'Publishing',
  surveys: 'Surveys',
  websites: 'Websites',
  tickets: 'Support',
  inbox: 'Live Chat',
  invoices: 'Billing',
  services: 'Services',
  hosting: 'Hosting',
  agency: 'Agency',
  settings: 'Settings',
  'my-tasks': 'My Tasks',
  'pitch-decks': 'Pitch Decks',
  'org-chart': 'Org Chart',
  ab: 'A/B',
  media: 'Media',
  experiments: 'A/B Experiments',
  branding: 'Branding',
  tools: 'Tools',
  projects: 'Projects',
};

function titleCase(seg: string): string {
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildCrumb(pathname: string): string[] {
  const segs = pathname.split('/').filter(Boolean);
  // Drop the leading "portal"; ignore bare numeric id segments (siteId etc.).
  const rest = segs.slice(1).filter((s) => !/^\d+$/.test(s));
  if (rest.length === 0) return ['Dashboard'];
  // Keep it to the last two meaningful segments so the bar never wraps.
  return rest.slice(-2).map((s) => SEGMENT_LABELS[s] ?? titleCase(s));
}

interface PortalTopbarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
}

export default function PortalTopbar({ collapsed, onToggleCollapse, onOpenMobile }: PortalTopbarProps) {
  const pathname = usePathname();
  const { brandName } = useAgencyChrome();
  const crumb = buildCrumb(pathname);

  return (
    <header
      className="sticky top-0 z-20 h-14 flex items-center gap-3 px-4 sm:px-5 border-b border-border"
      style={{
        background: 'color-mix(in srgb, var(--background) 80%, transparent)',
        backdropFilter: 'saturate(180%) blur(12px)',
        WebkitBackdropFilter: 'saturate(180%) blur(12px)',
      }}
    >
      {/* Mobile: open the drawer */}
      <button
        onClick={onOpenMobile}
        className="lg:hidden w-8 h-8 grid place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title="Menu"
        aria-label="Open navigation"
      >
        <span className="material-icons text-xl">menu</span>
      </button>

      {/* Desktop: collapse the rail */}
      <button
        onClick={onToggleCollapse}
        className="hidden lg:grid w-8 h-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label="Toggle sidebar"
      >
        <span className="material-icons text-xl">{collapsed ? 'menu_open' : 'menu'}</span>
      </button>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm min-w-0" aria-label="Breadcrumb">
        <span className="text-muted-foreground truncate hidden sm:inline">{brandName}</span>
        {crumb.map((c, i) => (
          <span key={i} className="flex items-center gap-2 min-w-0">
            <span className="text-border select-none hidden sm:inline">/</span>
            <span className={i === crumb.length - 1 ? 'text-foreground font-semibold truncate' : 'text-muted-foreground truncate'}>
              {c}
            </span>
          </span>
        ))}
      </nav>

      {/* Search / command palette trigger */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('portal:open-cmdk'))}
        className="ml-auto flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-[var(--portal-surface-2)] text-muted-foreground text-[13px] hover:border-[var(--portal-border-strong)] transition-colors min-w-0 sm:min-w-[240px]"
        title="Search (⌘K)"
      >
        <span className="material-icons text-[17px]">search</span>
        <span className="hidden sm:inline">Jump to anything…</span>
        <kbd className="hidden sm:inline ml-auto font-mono text-[10.5px] px-1.5 py-0.5 rounded border border-border bg-card text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        <PmNotificationBell />
        <CrmNotificationBell />
        <Link
          href="/portal/settings/profile"
          className="w-8 h-8 rounded-full grid place-items-center text-white text-xs font-semibold shrink-0"
          style={{ background: 'linear-gradient(135deg,#2563eb,#10b981)' }}
          title="Account"
          aria-label="Account"
        >
          <span className="material-icons text-[18px]">person</span>
        </Link>
      </div>
    </header>
  );
}
