// Portal navigation tree — single source of truth for both the sidebar
// and the Cmd+K palette. Keeping this structured (children + alsoActiveOn)
// lets the sidebar render its tree and lets the palette flatten it into a
// searchable list of jumpable targets.

import type { UserAppNavMeta } from '@/lib/plugins/load-user-apps';

export interface PortalNavChild {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  alsoActiveOn?: string;
  // Extra strings to match against in the command palette (e.g. synonyms,
  // sub-feature names) without polluting the visible label.
  keywords?: string[];
  children?: PortalNavChild[];
  /** Billing domain key that gates this item (matches FEATURE_DOMAINS[n].key). */
  requiredDomain?: string;
  /** Set by buildPortalNavItems when the client is not entitled to this domain. */
  locked?: boolean;
}

export interface PortalNavItem extends PortalNavChild {
  children?: PortalNavChild[];
}

/**
 * Build the full portal nav tree. Per-site branches are only included when
 * the user is already inside `/portal/websites/[siteId]/...` — palette callers
 * should pass `null` for activeSiteId when they don't have site context yet.
 *
 * The optional `apps` param injects an "Apps" group (one parent + one child
 * per installed plugin + grandchildren for each plugin's manifest nav items)
 * directly before the trailing "Settings" entry. Server callers that know
 * the active client's entitled apps pass them in; client callers that don't
 * have that context omit the param and get the unmodified base tree.
 *
 * The optional `entitlements` param gates top-level items by billing domain.
 * When provided and `gatingBypassed` is false, any item whose `requiredDomain`
 * is not in `domains` gets `locked: true` (children inherit the lock). When
 * omitted or bypassed, all items are rendered as today.
 */
export function buildPortalNavItems(
  activeSiteId: string | null,
  activeSiteName: string | null,
  apps?: UserAppNavMeta[],
  entitlements?: { domains: Set<string>; gatingBypassed: boolean },
): PortalNavItem[] {
  const items: PortalNavItem[] = [
    { href: '/portal/dashboard', label: 'Dashboard', icon: 'dashboard', keywords: ['home', 'overview'] },
    {
      href: '/portal/brain',
      label: 'Company Brain',
      icon: 'psychology',
      exact: true,
      requiredDomain: 'brain',
      keywords: ['ai', 'knowledge'],
      children: [
        // Calendar is intentionally hidden from sidebar + cmd-k. The page at
        // /portal/brain/calendar still renders for direct URL navigation.
        // Relationships is intentionally hidden from sidebar + cmd-k. The page
        // at /portal/brain/relationships still renders for direct URL access.
        { href: '/portal/brain/tasks', label: 'Tasks', icon: 'checklist', alsoActiveOn: '/portal/brain/review', keywords: ['kanban', 'review queue', 'todo', 'communications'] },
        { href: '/portal/brain/initiatives', label: 'Initiatives', icon: 'flag', keywords: ['programs', 'projects', 'okr', 'objectives', 'cross-functional', 'multi-quarter'] },
        { href: '/portal/brain/goals', label: 'Goals', icon: 'track_changes', keywords: ['okr', 'objectives', 'kpi', 'metrics', 'progress'] },
        { href: '/portal/brain/playbooks', label: 'Playbooks', icon: 'play_circle', keywords: ['runbooks', 'processes', 'workflows', 'onboarding', 'renewal', 'incident response', 'sop'] },
        { href: '/portal/brain/playbook-runs', label: 'Playbook Runs', icon: 'playlist_play', keywords: ['runs', 'instances', 'in-flight', 'monitor'] },
        { href: '/portal/brain/knowledge', label: 'Knowledge', icon: 'menu_book', keywords: ['notes', 'wiki', 'docs'] },
        { href: '/portal/brain/decisions', label: 'Decisions', icon: 'gavel', keywords: ['decision log', 'rationale', 'supersede', 'adr'] },
        { href: '/portal/brain/topics', label: 'Topics', icon: 'account_tree', keywords: ['taxonomy', 'tags', 'categories', 'tree'] },
        { href: '/portal/brain/people', label: 'People', icon: 'groups', keywords: ['team', 'employees', 'staff', 'expertise', 'who knows'] },
        { href: '/portal/brain/org-chart', label: 'Org Chart', icon: 'account_tree', keywords: ['org units', 'departments', 'hierarchy', 'reporting structure'] },
        { href: '/portal/brain/glossary', label: 'Glossary', icon: 'menu_book', keywords: ['terms', 'definitions', 'acronyms', 'vocabulary'] },
        { href: '/portal/brain/documents', label: 'Documents', icon: 'description', keywords: ['sop', 'policy', 'guide', 'required reading', 'acknowledgments', 'versioned'] },
        { href: '/portal/brain/documents/queue', label: 'My reading queue', icon: 'assignment_late', keywords: ['required reads', 'acknowledgments', 'overdue', 'due soon', 'unread documents'] },
        { href: '/portal/brain/templates', label: 'Templates', icon: 'auto_stories', keywords: ['note templates', 'forms', 'structured notes'] },
        { href: '/portal/branding', label: 'Branding & Messaging', icon: 'palette', keywords: ['brand', 'theme', 'colors', 'logo', 'voice', 'messaging'] },
        { href: '/portal/brain/automations', label: 'Automations', icon: 'bolt', keywords: ['rules', 'triggers', 'actions', 'schedule', 'scheduled', 'plugin scripts', 'workflows'] },
        { href: '/portal/brain/ask', label: 'Connect AI', icon: 'cable', keywords: ['mcp', 'ask brain', 'chat'] },
        { href: '/portal/brain/settings', label: 'Settings', icon: 'settings', keywords: ['brain settings'] },
      ],
    },
    {
      href: '/portal/projects',
      label: 'Projects',
      icon: 'view_kanban',
      exact: true,
      requiredDomain: 'projects',
      alsoActiveOn: '/portal/my-tasks',
      children: [
        { href: '/portal/projects', label: 'All Projects', icon: 'view_kanban', exact: true },
        { href: '/portal/my-tasks', label: 'My Tasks', icon: 'task_alt' },
      ],
    },
    {
      href: '/portal/publishing',
      label: 'Publishing',
      icon: 'rocket_launch',
      requiredDomain: 'publishing',
      keywords: ['content calendar', 'publishing command center', 'schedule', 'blog', 'social', 'email blast'],
      children: [
        { href: '/portal/publishing/board', label: 'Board', icon: 'view_kanban' },
        { href: '/portal/publishing/calendar', label: 'Calendar', icon: 'calendar_month', keywords: ['content calendar', 'schedule'] },
        { href: '/portal/publishing/campaigns', label: 'Campaigns', icon: 'campaign' },
        { href: '/portal/publishing/tags', label: 'Tags', icon: 'sell' },
        { href: '/portal/publishing/permissions', label: 'Permissions', icon: 'lock' },
      ],
    },
    {
      href: '/portal/crm',
      label: 'CRM',
      icon: 'contacts',
      exact: true,
      requiredDomain: 'crm',
      keywords: ['customer relationship management', 'pipeline'],
      children: [
        { href: '/portal/crm', label: 'Dashboard', icon: 'dashboard', exact: true, keywords: ['crm home'] },
        { href: '/portal/crm/contacts', label: 'Contacts', icon: 'people', keywords: ['leads', 'people'] },
        { href: '/portal/crm/companies', label: 'Companies', icon: 'business', keywords: ['organizations', 'accounts'] },
        { href: '/portal/crm/deals', label: 'Deals', icon: 'handshake', keywords: ['pipeline', 'opportunities'] },
        { href: '/portal/crm/contracts', label: 'Contracts', icon: 'description', keywords: ['agreements', 'esign', 'documents'] },
        { href: '/portal/crm/settings', label: 'Settings', icon: 'settings', keywords: ['crm settings', 'custom fields'] },
      ],
    },
    {
      href: '/portal/tickets',
      label: 'Tickets',
      icon: 'support_agent',
      keywords: ['help desk', 'support', 'requests'],
    },
    {
      href: '/portal/invoices',
      label: 'Invoices',
      icon: 'receipt_long',
      keywords: ['billing', 'payments', 'charges'],
    },
    {
      href: '/portal/inbox',
      label: 'Live Chat',
      icon: 'forum',
      keywords: ['chat', 'conversations', 'messages', 'live chat', 'inbox'],
    },
    {
      href: '/portal/hosting',
      label: 'Hosting',
      icon: 'dns',
      keywords: ['dns', 'domains', 'servers'],
    },
    {
      href: '/portal/services',
      label: 'Services',
      icon: 'miscellaneous_services',
      keywords: ['subscriptions', 'add-ons'],
    },
    {
      href: '/portal/email',
      label: 'Email',
      icon: 'email',
      exact: true,
      requiredDomain: 'email',
      keywords: ['marketing', 'newsletters'],
      children: [
        { href: '/portal/email', label: 'Dashboard', icon: 'dashboard', exact: true },
        { href: '/portal/email/campaigns', label: 'Campaigns', icon: 'campaign' },
        { href: '/portal/email/templates', label: 'Templates', icon: 'dynamic_feed' },
        { href: '/portal/email/lists', label: 'Lists', icon: 'list_alt', keywords: ['mailing list', 'audiences'] },
        { href: '/portal/email/segments', label: 'Segments', icon: 'filter_alt' },
        { href: '/portal/email/analytics', label: 'Analytics', icon: 'analytics', keywords: ['stats', 'opens', 'clicks'] },
        { href: '/portal/email/settings', label: 'Settings', icon: 'settings', keywords: ['email settings'] },
      ],
    },
    {
      href: '/portal/surveys',
      label: 'Surveys',
      icon: 'poll',
      exact: true,
      requiredDomain: 'surveys',
      keywords: ['forms', 'questionnaires'],
      children: [
        { href: '/portal/surveys', label: 'All Surveys', icon: 'poll', exact: true },
        { href: '/portal/surveys/new', label: 'New Survey', icon: 'add_circle', keywords: ['create survey'] },
      ],
    },
    {
      href: '/portal/tools/pitch-decks',
      label: 'Pitches & Proposals',
      icon: 'slideshow',
      exact: true,
      requiredDomain: 'pitch-decks',
      keywords: ['slides', 'presentations', 'proposals', 'quotes'],
      children: [
        { href: '/portal/tools/pitch-decks', label: 'Pitch Decks', icon: 'slideshow', exact: true, keywords: ['slides', 'presentations'] },
        { href: '/portal/crm/proposals', label: 'Proposals', icon: 'request_quote', keywords: ['quotes'] },
      ],
    },
    { href: '/portal/websites', label: 'Websites', icon: 'language', exact: true, requiredDomain: 'websites', keywords: ['sites', 'cms'] },
    ...(activeSiteId
      ? [{
          href: `/portal/websites/${activeSiteId}`,
          label: activeSiteName || 'Website',
          icon: 'web',
          exact: true,
          requiredDomain: 'websites',
          children: [
            {
              href: `/portal/websites/${activeSiteId}/entries`,
              label: 'Content',
              icon: 'article',
              alsoActiveOn: `/portal/websites/${activeSiteId}/posts`,
              keywords: ['pages', 'posts'],
              children: [
                { href: `/portal/websites/${activeSiteId}/entries`, label: 'Entries', icon: 'edit_note', alsoActiveOn: `/portal/websites/${activeSiteId}/posts` },
                { href: `/portal/websites/${activeSiteId}/taxonomy`, label: 'Taxonomies', icon: 'account_tree', keywords: ['categories', 'tags'] },
                { href: `/portal/websites/${activeSiteId}/content-types`, label: 'Content Types', icon: 'description' },
              ],
            },
            {
              href: `/portal/websites/${activeSiteId}/store`,
              label: 'Store',
              icon: 'shopping_cart',
              exact: true,
              keywords: ['ecommerce', 'shop'],
              children: [
                { href: `/portal/websites/${activeSiteId}/store/products`, label: 'Products', icon: 'inventory_2' },
                { href: `/portal/websites/${activeSiteId}/store/orders`, label: 'Orders', icon: 'receipt_long' },
                { href: `/portal/websites/${activeSiteId}/store/categories`, label: 'Categories', icon: 'category' },
                { href: `/portal/websites/${activeSiteId}/store/discounts`, label: 'Discounts', icon: 'sell' },
                { href: `/portal/websites/${activeSiteId}/store/shipping`, label: 'Shipping', icon: 'local_shipping' },
                { href: `/portal/websites/${activeSiteId}/store/settings`, label: 'Store Settings', icon: 'settings' },
              ],
            },
            { href: `/portal/websites/${activeSiteId}/email`, label: 'Website Emails', icon: 'email', keywords: ['transactional', 'site emails'] },
            { href: `/portal/websites/${activeSiteId}/navigation`, label: 'Navigation', icon: 'menu', keywords: ['menus'] },
            { href: `/portal/websites/${activeSiteId}/settings`, label: 'Website Settings', icon: 'settings' },
          ],
        }]
      : []
    ),
    { href: '/portal/media', label: 'Media', icon: 'perm_media', requiredDomain: 'websites', keywords: ['images', 'files', 'uploads'] },
    { href: '/portal/experiments', label: 'A/B Experiments', icon: 'science', requiredDomain: 'websites', keywords: ['ab', 'a/b', 'split test', 'variant', 'experiment'] },
    // MCP Approvals is intentionally hidden from sidebar + cmd-k. The page
    // at /portal/approvals still renders for direct URL access.
    {
      href: '/portal/agency',
      label: 'Agency',
      icon: 'storefront',
      exact: true,
      keywords: ['white label', 'white-label', 'reseller', 'custom domain', 'agency branding', 'saas mode', 'scale'],
      children: [
        { href: '/portal/agency', label: 'Overview', icon: 'storefront', exact: true },
        { href: '/portal/agency/custom-domain', label: 'Custom Domain', icon: 'dns', keywords: ['dns', 'cname', 'verify'] },
        { href: '/portal/agency/branding', label: 'Agency Branding', icon: 'palette', keywords: ['logo', 'wordmark', 'agency name'] },
      ],
    },
    { href: '/portal/settings', label: 'Settings', icon: 'settings', keywords: ['account', 'team', 'billing'] },
  ];

  // Inject the "Apps" group before Settings when the caller supplied a list
  // of entitled plugins. Done as a post-process splice (rather than inline
  // in the array literal) so the base tree stays trivially readable and the
  // existing call signature `buildPortalNavItems(siteId, siteName)` keeps
  // working unchanged.
  if (apps && apps.length > 0) {
    const appsGroup: PortalNavItem = {
      href: '/portal/apps',
      label: 'Apps',
      icon: 'apps',
      keywords: ['plugins', 'integrations'],
      children: apps.map((a) => ({
        href: `/portal/apps/${a.slug}`,
        label: a.name,
        icon: a.icon,
        keywords: [a.slug],
        children: a.navItems.map((item) => ({
          // Manifest hrefs are plugin-local and start with `/`. The portal
          // rewrites them under `/portal/apps/<slug>`. A bare `/` becomes
          // the slug root itself rather than appearing as `/<slug>/`.
          href: `/portal/apps/${a.slug}${item.href === '/' ? '' : item.href}`,
          label: item.label,
          icon: item.icon,
          keywords: item.keywords ?? [],
        })),
      })),
    };

    const settingsIdx = items.findIndex((i) => i.href === '/portal/settings');
    if (settingsIdx >= 0) {
      items.splice(settingsIdx, 0, appsGroup);
    } else {
      items.push(appsGroup);
    }
  }

  // Apply entitlement gating: when entitlements are provided and gating is
  // active, mark items and their children as locked when the required domain
  // is not in the entitled set.
  if (entitlements && !entitlements.gatingBypassed) {
    const lockChildren = (children: PortalNavChild[]): PortalNavChild[] =>
      children.map((c) => ({
        ...c,
        locked: true,
        children: c.children ? lockChildren(c.children) : c.children,
      }));

    for (const item of items) {
      if (item.requiredDomain && !entitlements.domains.has(item.requiredDomain)) {
        item.locked = true;
        if (item.children) {
          item.children = lockChildren(item.children);
        }
      }
    }
  }

  return items;
}

export interface PortalNavTarget {
  href: string;
  label: string;
  icon: string;
  /** Breadcrumb labels from root to (but not including) this item. */
  breadcrumb: string[];
  /** Lower-cased haystack used for fuzzy matching. */
  haystack: string;
}

/**
 * Walk the nav tree depth-first and emit one record per navigable destination.
 * Parents that have children are still emitted because clicking them is valid.
 * Each destination is deduplicated by href so the palette doesn't double-list
 * the same page when a parent and its first child share the same href.
 */
export function flattenPortalNav(items: PortalNavItem[]): PortalNavTarget[] {
  const out: PortalNavTarget[] = [];
  const seen = new Set<string>();

  const walk = (nodes: PortalNavChild[], trail: string[]) => {
    for (const node of nodes) {
      // Locked nodes are not surfaced in the Cmd+K palette — their href is not
      // a reachable destination for ungated users.
      if (node.locked) continue;
      if (!seen.has(node.href)) {
        seen.add(node.href);
        const haystackParts = [
          ...trail.map((s) => s.toLowerCase()),
          node.label.toLowerCase(),
          ...(node.keywords ?? []).map((k) => k.toLowerCase()),
        ];
        out.push({
          href: node.href,
          label: node.label,
          icon: node.icon,
          breadcrumb: trail,
          haystack: haystackParts.join(' '),
        });
      }
      if (node.children?.length) walk(node.children, [...trail, node.label]);
    }
  };

  walk(items, []);
  return out;
}
