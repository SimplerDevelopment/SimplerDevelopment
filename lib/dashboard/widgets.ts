/**
 * Dashboard widget registry.
 * Defines all 22 available widgets with their metadata and visibility rules.
 */

export type DashboardWidgetId =
  | 'websites-glance'
  | 'editorial-pipeline'
  | 'store-overview'
  | 'email-performance'
  | 'crm-snapshot'
  | 'crm-activity'
  | 'proposals-esign'
  | 'upcoming-bookings'
  | 'survey-responses'
  | 'ab-experiments'
  | 'projects-overview'
  | 'my-tasks'
  | 'support-tickets'
  | 'invoices'
  | 'brain-review-queue'
  | 'brain-tasks'
  | 'live-chat'
  | 'automations'
  | 'pitch-decks'
  | 'agency-status'
  | 'hosting-status'
  | 'ai-connect';

export interface DashboardWidgetDef {
  id: DashboardWidgetId;
  title: string;
  icon: string;
  solution: string;
  description: string;
  href: string;
  serviceCategory?: string;
  defaultEnabled: boolean;
}

export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  {
    id: 'websites-glance',
    title: 'Websites at a Glance',
    icon: 'language',
    solution: 'websites',
    description: 'Overview of your active sites, page counts, and recent publish activity.',
    href: '/portal/websites',
    serviceCategory: 'cms',
    defaultEnabled: false,
  },
  {
    id: 'editorial-pipeline',
    title: 'Editorial Pipeline',
    icon: 'rocket_launch',
    solution: 'publishing',
    description: 'Track drafts, scheduled posts, and content awaiting review.',
    href: '/portal/publishing',
    serviceCategory: 'cms',
    defaultEnabled: false,
  },
  {
    id: 'store-overview',
    title: 'Store Overview',
    icon: 'storefront',
    solution: 'ecommerce',
    description: 'Quick summary of recent orders, revenue, and top products.',
    href: '/portal/websites',
    serviceCategory: 'cms',
    defaultEnabled: false,
  },
  {
    id: 'email-performance',
    title: 'Email Performance',
    icon: 'email',
    solution: 'email-marketing',
    description: 'Recent campaign stats including open rates and subscriber growth.',
    href: '/portal/email',
    serviceCategory: 'email',
    defaultEnabled: false,
  },
  {
    id: 'crm-snapshot',
    title: 'CRM Snapshot',
    icon: 'groups',
    solution: 'crm',
    description: 'High-level summary of contacts, open deals, and pipeline value.',
    href: '/portal/crm',
    defaultEnabled: true,
  },
  {
    id: 'crm-activity',
    title: 'Recent CRM Activity',
    icon: 'history',
    solution: 'crm',
    description: 'Latest notes, calls, and deal updates across your CRM.',
    href: '/portal/crm',
    defaultEnabled: false,
  },
  {
    id: 'proposals-esign',
    title: 'Proposals & E-Sign',
    icon: 'draw',
    solution: 'contracts',
    description: 'Pending proposals, contracts awaiting signature, and recent closes.',
    href: '/portal/crm/proposals',
    defaultEnabled: false,
  },
  {
    id: 'upcoming-bookings',
    title: 'Upcoming Bookings',
    icon: 'calendar_month',
    solution: 'booking',
    description: 'Confirmed appointments and booking page performance.',
    href: '/portal/tools/booking',
    serviceCategory: 'booking',
    defaultEnabled: false,
  },
  {
    id: 'survey-responses',
    title: 'Survey Responses',
    icon: 'ballot',
    solution: 'surveys',
    description: 'Recent survey submissions and response rate trends.',
    href: '/portal/surveys',
    defaultEnabled: false,
  },
  {
    id: 'ab-experiments',
    title: 'A/B Experiments',
    icon: 'science',
    solution: 'experiments',
    description: 'Running experiments, conversion lifts, and winner recommendations.',
    href: '/portal/experiments',
    defaultEnabled: false,
  },
  {
    id: 'projects-overview',
    title: 'Projects Overview',
    icon: 'view_kanban',
    solution: 'project-management',
    description: 'Active projects, sprint status, and blocked card count.',
    href: '/portal/projects',
    serviceCategory: 'project-mgmt',
    defaultEnabled: true,
  },
  {
    id: 'my-tasks',
    title: 'My Tasks',
    icon: 'checklist',
    solution: 'project-management',
    description: 'Cards and tasks assigned to you across all projects.',
    href: '/portal/my-tasks',
    serviceCategory: 'project-mgmt',
    defaultEnabled: false,
  },
  {
    id: 'support-tickets',
    title: 'Support Tickets',
    icon: 'support_agent',
    solution: 'help-desk',
    description: 'Open tickets, recent updates, and SLA status at a glance.',
    href: '/portal/tickets',
    defaultEnabled: true,
  },
  {
    id: 'invoices',
    title: 'Invoices',
    icon: 'receipt_long',
    solution: 'invoicing',
    description: 'Outstanding invoices, recent payments, and amount due.',
    href: '/portal/invoices',
    defaultEnabled: true,
  },
  {
    id: 'brain-review-queue',
    title: 'Brain Review Queue',
    icon: 'psychology',
    solution: 'company-brain',
    description: 'Items flagged by the AI for your review and approval.',
    href: '/portal/brain/review',
    defaultEnabled: true,
  },
  {
    id: 'brain-tasks',
    title: 'Brain Tasks',
    icon: 'task_alt',
    solution: 'company-brain',
    description: 'AI-generated tasks and follow-ups pending your action.',
    href: '/portal/brain/tasks',
    defaultEnabled: true,
  },
  {
    id: 'live-chat',
    title: 'Live Chat',
    icon: 'smart_toy',
    solution: 'ai-chatbot',
    description: 'Recent conversations and AI chatbot engagement metrics.',
    href: '/portal/inbox',
    serviceCategory: 'ai',
    defaultEnabled: false,
  },
  {
    id: 'automations',
    title: 'Automations',
    icon: 'account_tree',
    solution: 'automations',
    description: 'Active automation workflows and recent trigger activity.',
    href: '/portal/brain/automations',
    defaultEnabled: false,
  },
  {
    id: 'pitch-decks',
    title: 'Recent Pitch Decks',
    icon: 'slideshow',
    solution: 'pitch-decks',
    description: 'AI-generated decks, last viewed, and sharing status.',
    href: '/portal/tools/pitch-decks',
    serviceCategory: 'pitch-decks',
    defaultEnabled: false,
  },
  {
    id: 'agency-status',
    title: 'Agency & White-Label',
    icon: 'storefront',
    solution: 'agency',
    description: 'White-label seat usage, sub-account status, and reseller health.',
    href: '/portal/agency',
    defaultEnabled: false,
  },
  {
    id: 'hosting-status',
    title: 'Hosting Status',
    icon: 'cloud',
    solution: 'hosting',
    description: 'Uptime, SSL status, bandwidth usage, and recent deploy log.',
    href: '/portal/hosting',
    serviceCategory: 'hosting',
    defaultEnabled: false,
  },
  {
    id: 'ai-connect',
    title: 'AI Connect',
    icon: 'cable',
    solution: 'ai-connect',
    description: 'Connected AI integrations, MCP tool usage, and token consumption.',
    href: '/portal/brain/connect',
    defaultEnabled: false,
  },
];

export interface DashboardWidgetPrefs {
  order?: string[];
  hidden?: string[];
  collapsed?: string[];
}

const BRAIN_WIDGET_IDS = new Set<DashboardWidgetId>(['brain-review-queue', 'brain-tasks']);

/**
 * Resolves which widgets are visible and available given the user's prefs,
 * active service categories, and brain enablement.
 *
 * - available: all 22 widgets, except brain widgets are excluded when !brainEnabled
 * - visible: available minus hidden, ordered by prefs.order (unknowns appended in registry order)
 *   When no pref recorded for a widget, default = defaultEnabled || serviceCategory matches
 */
export function resolveVisibleWidgets(
  prefs: DashboardWidgetPrefs,
  activeServiceCategories: Set<string>,
  brainEnabled: boolean,
): { visible: DashboardWidgetDef[]; available: DashboardWidgetDef[] } {
  const available = DASHBOARD_WIDGETS.filter(
    (w) => !(BRAIN_WIDGET_IDS.has(w.id) && !brainEnabled),
  );

  const hiddenSet = new Set(prefs.hidden ?? []);
  const orderList = prefs.order ?? [];

  // Build ordered list: first by prefs.order (filtered to available+not-hidden),
  // then append remaining available widgets not in order (in registry order).
  const availableMap = new Map(available.map((w) => [w.id, w]));
  const ordered: DashboardWidgetDef[] = [];
  const seen = new Set<string>();

  for (const id of orderList) {
    const w = availableMap.get(id as DashboardWidgetId);
    if (w && !hiddenSet.has(id)) {
      ordered.push(w);
      seen.add(id);
    }
  }

  for (const w of available) {
    if (!seen.has(w.id) && !hiddenSet.has(w.id)) {
      // No pref recorded: use defaultEnabled || serviceCategory gate
      const isDefaultVisible =
        w.defaultEnabled ||
        (!!w.serviceCategory && activeServiceCategories.has(w.serviceCategory));
      if (isDefaultVisible) {
        ordered.push(w);
      }
    }
  }

  return { visible: ordered, available };
}
