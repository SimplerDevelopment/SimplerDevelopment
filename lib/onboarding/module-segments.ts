// Client-safe module segment definitions — no db imports.
// Maps domain keys to rich "get started" action lists shown in the
// post-onboarding module-setup step and the dashboard checklist.

export interface ModuleSegmentAction {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: string;
}

export interface ModuleSegment {
  domainKey: string;
  title: string;
  blurb: string;
  actions: ModuleSegmentAction[];
}

export const RICH_SEGMENTS: Record<string, ModuleSegment> = {
  websites: {
    domainKey: 'websites',
    title: 'Name your first site',
    blurb: 'Build and launch your first website in minutes.',
    actions: [
      {
        key: 'create-site',
        label: 'Name your first site',
        description: 'Pick a name and domain for your new site.',
        href: '/portal/websites',
        icon: 'add_circle',
      },
      {
        key: 'visual-editor',
        label: 'Open the visual editor',
        description: 'Design pages with drag-and-drop blocks.',
        href: '/portal/websites',
        icon: 'design_services',
      },
      {
        key: 'setup-nav',
        label: 'Set up your navigation',
        description: 'Define menus and links for your site.',
        href: '/portal/websites',
        icon: 'menu',
      },
    ],
  },

  crm: {
    domainKey: 'crm',
    title: 'Set up your CRM',
    blurb: 'Track every lead, deal, and conversation in one place.',
    actions: [
      {
        key: 'add-contacts',
        label: 'Import or add your first contacts',
        description: 'Bring in your existing contacts or add them one by one.',
        href: '/portal/crm/contacts',
        icon: 'person_add',
      },
      {
        key: 'create-pipeline',
        label: 'Create your sales pipeline',
        description: 'Define stages that match your sales process.',
        href: '/portal/crm/settings',
        icon: 'account_tree',
      },
      {
        key: 'log-deal',
        label: 'Log your first deal',
        description: 'Start tracking an active opportunity.',
        href: '/portal/crm/deals',
        icon: 'handshake',
      },
    ],
  },

  email: {
    domainKey: 'email',
    title: 'Launch email marketing',
    blurb: 'Send beautiful campaigns that convert.',
    actions: [
      {
        key: 'verify-sender',
        label: 'Verify your sender address',
        description: 'Authenticate your domain for reliable delivery.',
        href: '/portal/email/settings',
        icon: 'verified',
      },
      {
        key: 'create-list',
        label: 'Create your first list',
        description: 'Segment your audience from the start.',
        href: '/portal/email/lists',
        icon: 'group_add',
      },
      {
        key: 'browse-templates',
        label: 'Browse campaign templates',
        description: 'Start from a proven design, not a blank page.',
        href: '/portal/email/templates',
        icon: 'article',
      },
    ],
  },

  brain: {
    domainKey: 'brain',
    title: 'Power up Company Brain',
    blurb: 'Make your company knowledge searchable and AI-ready.',
    actions: [
      {
        key: 'add-knowledge',
        label: 'Add your first knowledge',
        description: 'Upload docs, paste links, or write notes.',
        href: '/portal/brain/knowledge',
        icon: 'upload_file',
      },
      {
        key: 'meet-assistant',
        label: 'Meet your AI assistant',
        description: 'Ask anything about your company data.',
        href: '/portal/brain/ask',
        icon: 'smart_toy',
      },
      {
        key: 'map-team',
        label: 'Map your team',
        description: 'Add people and their areas of expertise.',
        href: '/portal/brain/people',
        icon: 'groups',
      },
    ],
  },

  projects: {
    domainKey: 'projects',
    title: 'Kick off a project',
    blurb: 'Keep work organized and your team in sync.',
    actions: [
      {
        key: 'create-project',
        label: 'Create your first project',
        description: 'Set up a Kanban board for any workstream.',
        href: '/portal/projects',
        icon: 'add_task',
      },
      {
        key: 'check-tasks',
        label: 'Check My Tasks',
        description: 'See all your open tasks across every project.',
        href: '/portal/my-tasks',
        icon: 'task_alt',
      },
    ],
  },
};

/**
 * Returns the rich segment for a domain key if one exists; otherwise builds a
 * generic fallback from the catalog entry.
 */
export function getSegmentForDomain(
  key: string,
  catalog?: { name: string; tagline: string; navHrefs: string[] },
): ModuleSegment {
  const rich = RICH_SEGMENTS[key];
  if (rich) return rich;

  return {
    domainKey: key,
    title: `Get started with ${catalog?.name ?? key}`,
    blurb: catalog?.tagline ?? '',
    actions: [
      {
        key: 'explore',
        label: `Explore ${catalog?.name ?? key}`,
        description: 'Start using this module.',
        href: catalog?.navHrefs?.[0] ?? '/portal/dashboard',
        icon: 'open_in_new',
      },
    ],
  };
}
