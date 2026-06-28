// Single source of truth for the admin navigation tree.
//
// Consumed by AdminSidebar (chrome), AdminTopbar (breadcrumbs), and
// CommandPalette (⌘K). Keeping one manifest means a new admin route is added
// in exactly one place and shows up in the sidebar, breadcrumbs, and palette
// together.
//
// Dynamic state (the approvals badge count) is NOT stored here — the manifest
// is pure data. Items that carry a live badge declare `badgeKey`, and the
// sidebar injects the number at render time.

export interface NavSubItem {
  href: string;
  label: string;
  icon: string;
}

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Identifies a live badge to inject at render (e.g. 'approvals'). */
  badgeKey?: string;
  subItems?: NavSubItem[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Build the nav tree. Agentic OS is a developer-only route; `NODE_ENV` is
 * statically inlined by Next.js at build time, so the entry is stripped from
 * production client bundles entirely (matches the server-side route gate).
 */
export function getNavSections(): NavSection[] {
  return [
    {
      label: 'Platform',
      items: [
        { href: '/admin', label: 'Dashboard', icon: 'space_dashboard' },
        { href: '/admin/clients', label: 'Clients', icon: 'business' },
        { href: '/admin/users', label: 'Staff', icon: 'badge' },
      ],
    },
    {
      label: 'Services',
      items: [
        {
          href: '/admin/portal-websites',
          label: 'Websites',
          icon: 'language',
          subItems: [
            { href: '/admin/branding', label: 'Branding', icon: 'palette' },
            { href: '/admin/portal-hosting', label: 'Hosting & DNS', icon: 'cloud' },
          ],
        },
        { href: '/admin/portal-ecommerce', label: 'eCommerce', icon: 'shopping_cart' },
        {
          href: '/admin/email',
          label: 'Email Marketing',
          icon: 'campaign',
          subItems: [
            { href: '/admin/email/campaigns', label: 'Campaigns', icon: 'send' },
            { href: '/admin/email/lists', label: 'Lists', icon: 'list' },
            { href: '/admin/email/domains', label: 'Domains', icon: 'dns' },
          ],
        },
        { href: '/admin/booking', label: 'Booking', icon: 'calendar_month' },
      ],
    },
    {
      label: 'Sales & CRM',
      items: [
        { href: '/admin/crm', label: 'CRM Dashboard', icon: 'monitoring' },
        { href: '/admin/crm/contacts', label: 'Contacts', icon: 'contacts' },
        { href: '/admin/crm/companies', label: 'Companies', icon: 'apartment' },
        { href: '/admin/crm/deals', label: 'Deals', icon: 'handshake' },
        { href: '/admin/crm/proposals', label: 'Proposals', icon: 'description' },
        { href: '/admin/crm/contracts', label: 'Contracts', icon: 'gavel' },
      ],
    },
    {
      label: 'Operations',
      items: [
        { href: '/admin/approvals', label: 'Approvals', icon: 'inbox', badgeKey: 'approvals' },
        {
          href: '/admin/portal-projects',
          label: 'Projects',
          icon: 'view_kanban',
          subItems: [
            { href: '/admin/portal-suggested-projects', label: 'Project Market', icon: 'rocket_launch' },
            { href: '/admin/portal-project-requests', label: 'Requests', icon: 'assignment_add' },
          ],
        },
        { href: '/admin/portal-tickets', label: 'Support Tickets', icon: 'support_agent' },
        { href: '/admin/automations', label: 'Automations', icon: 'bolt' },
        { href: '/admin/system-health', label: 'System Health', icon: 'monitor_heart' },
        { href: '/admin/oauth-clients', label: 'OAuth Clients', icon: 'key' },
        ...(process.env.NODE_ENV === 'development'
          ? [{ href: '/admin/agentic-os', label: 'Agentic OS', icon: 'auto_awesome' }]
          : []),
        { href: '/admin/portal-ai', label: 'AI Chat', icon: 'smart_toy' },
      ],
    },
    {
      label: 'Billing',
      items: [
        { href: '/admin/portal-invoices', label: 'Invoices', icon: 'receipt_long' },
        { href: '/admin/subscriptions', label: 'Subscriptions', icon: 'loyalty' },
        { href: '/admin/ai-credits', label: 'AI Credits', icon: 'token' },
        {
          href: '/admin/portal-services',
          label: 'Service Catalog',
          icon: 'storefront',
          subItems: [
            { href: '/admin/portal-service-requests', label: 'Service Requests', icon: 'assignment' },
          ],
        },
      ],
    },
    {
      label: 'Content',
      items: [
        {
          href: '/admin/posts',
          label: 'Posts',
          icon: 'article',
          subItems: [
            { href: '/admin/content-calendar', label: 'Calendar', icon: 'calendar_month' },
            { href: '/admin/post-types', label: 'Post Types', icon: 'category' },
            { href: '/admin/categories', label: 'Categories', icon: 'folder' },
            { href: '/admin/tags', label: 'Tags', icon: 'label' },
          ],
        },
        { href: '/admin/templates', label: 'Templates', icon: 'bookmark' },
        { href: '/admin/media', label: 'Media', icon: 'perm_media' },
      ],
    },
  ];
}

export interface FlatNavEntry {
  href: string;
  label: string;
  icon: string;
  section: string;
}

/** Every navigable destination (items + sub-items) as a flat list. */
export function flattenNav(sections: NavSection[] = getNavSections()): FlatNavEntry[] {
  const out: FlatNavEntry[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      out.push({ href: item.href, label: item.label, icon: item.icon, section: section.label });
      for (const sub of item.subItems ?? []) {
        out.push({ href: sub.href, label: sub.label, icon: sub.icon, section: section.label });
      }
    }
  }
  return out;
}

function titleize(segment: string): string {
  if (/^\d+$/.test(segment)) return `#${segment}`;
  return segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface Crumb {
  label: string;
  href: string;
}

/**
 * Breadcrumb trail for a pathname. Starts at "Admin", matches the deepest nav
 * entry that is a prefix of the path, then appends any trailing dynamic
 * segments (e.g. a client id) titleized.
 */
export function crumbsForPath(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Admin', href: '/admin' }];
  if (pathname === '/admin' || pathname === '/admin/') {
    crumbs.push({ label: 'Dashboard', href: '/admin' });
    return crumbs;
  }

  const entries = flattenNav();
  let best: FlatNavEntry | null = null;
  for (const e of entries) {
    if (e.href === '/admin') continue;
    if (pathname === e.href || pathname.startsWith(e.href + '/')) {
      if (!best || e.href.length > best.href.length) best = e;
    }
  }

  if (best) {
    crumbs.push({ label: best.label, href: best.href });
    let acc = best.href;
    for (const seg of pathname.slice(best.href.length).split('/').filter(Boolean)) {
      acc += '/' + seg;
      crumbs.push({ label: titleize(seg), href: acc });
    }
  } else {
    let acc = '/admin';
    for (const seg of pathname.replace(/^\/admin/, '').split('/').filter(Boolean)) {
      acc += '/' + seg;
      crumbs.push({ label: titleize(seg), href: acc });
    }
  }
  return crumbs;
}
