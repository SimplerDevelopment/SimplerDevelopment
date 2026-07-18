// Client-safe module segment definitions — no db imports.
// Maps domain keys to rich "get started" action lists shown in the
// post-onboarding module-setup step and the dashboard checklist.

export interface ModuleSegmentAction {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: string;
  /** Optional docs deep link rendered alongside the action. */
  docsHref?: string;
  /** Server-side detection key (see lib/onboarding/detections.ts). Steps
   *  without one are pointer rows — shown, but excluded from progress math. */
  detect?: string;
  /** Always-true step credited on first render. Every domain's FIRST action
   *  must set this so no consumer can ever compute 0% (goal gradient — spec
   *  "Per-Domain Onboarding", UX psychology req 1). */
  preCredited?: boolean;
}

export interface ModuleSegment {
  domainKey: string;
  title: string;
  blurb: string;
  actions: ModuleSegmentAction[];
}

/** Steps that participate in progress math (detected or pre-credited). */
export function countableActions(segment: ModuleSegment): ModuleSegmentAction[] {
  return segment.actions.filter((a) => a.preCredited || a.detect);
}

function enabledStep(domainLabel: string, href: string): ModuleSegmentAction {
  return {
    key: 'enabled',
    label: `${domainLabel} enabled`,
    description: 'This module is active on your account.',
    href,
    icon: 'check_circle',
    preCredited: true,
  };
}

export const RICH_SEGMENTS: Record<string, ModuleSegment> = {
  websites: {
    domainKey: 'websites',
    title: 'Name your first site',
    blurb: 'Build and launch your first website in minutes.',
    actions: [
      enabledStep('Websites', '/portal/websites'),
      {
        key: 'create-site',
        label: 'Name your first site',
        description: 'Pick a name and domain for your new site.',
        href: '/portal/websites',
        icon: 'add_circle',
        detect: 'websites.hasSite',
      },
      {
        key: 'visual-editor',
        label: 'Publish your first page',
        description: 'Design pages with drag-and-drop blocks, then publish.',
        href: '/portal/websites',
        icon: 'design_services',
        detect: 'websites.hasPublishedPage',
      },
      {
        key: 'setup-nav',
        label: 'Set up your navigation',
        description: 'Define menus and links for your site.',
        href: '/portal/websites',
        icon: 'menu',
        detect: 'websites.hasNavigation',
      },
    ],
  },

  crm: {
    domainKey: 'crm',
    title: 'Set up your CRM',
    blurb: 'Track every lead, deal, and conversation in one place.',
    actions: [
      enabledStep('CRM', '/portal/crm'),
      {
        key: 'add-contacts',
        label: 'Import or add your first contacts',
        description: 'Bring in your existing contacts or add them one by one.',
        href: '/portal/crm/contacts',
        icon: 'person_add',
        detect: 'crm.hasContact',
      },
      {
        key: 'create-pipeline',
        label: 'Create your sales pipeline',
        description: 'Define stages that match your sales process.',
        href: '/portal/crm/settings',
        icon: 'account_tree',
        detect: 'crm.hasPipeline',
      },
      {
        key: 'log-deal',
        label: 'Log your first deal',
        description: 'Start tracking an active opportunity.',
        href: '/portal/crm/deals',
        icon: 'handshake',
        detect: 'crm.hasDeal',
      },
    ],
  },

  email: {
    domainKey: 'email',
    title: 'Launch email marketing',
    blurb: 'Send beautiful campaigns that convert.',
    actions: [
      enabledStep('Email', '/portal/email'),
      {
        key: 'verify-sender',
        label: 'Verify your sender address',
        description: 'Authenticate your domain for reliable delivery.',
        href: '/portal/email/settings',
        icon: 'verified',
        // detect wired in DOB-006 once the sender-verification column is pinned down.
      },
      {
        key: 'create-list',
        label: 'Create your first list',
        description: 'Segment your audience from the start.',
        href: '/portal/email/lists',
        icon: 'group_add',
        detect: 'email.hasList',
      },
      {
        key: 'first-campaign',
        label: 'Draft your first campaign',
        description: 'Start from a proven template, not a blank page.',
        href: '/portal/email/templates',
        icon: 'article',
        detect: 'email.hasCampaign',
      },
    ],
  },

  brain: {
    domainKey: 'brain',
    title: 'Power up Company Brain',
    blurb: 'Make your company knowledge searchable and AI-ready.',
    actions: [
      enabledStep('Company Brain', '/portal/brain'),
      {
        key: 'add-knowledge',
        label: 'Add your first knowledge',
        description: 'Upload docs, paste links, or write notes.',
        href: '/portal/brain/knowledge',
        icon: 'upload_file',
        detect: 'brain.hasKnowledge',
      },
      {
        key: 'meet-assistant',
        label: 'Meet your AI assistant',
        description: 'Ask anything about your company data.',
        href: '/portal/brain/ask',
        icon: 'smart_toy',
        detect: 'brain.hasConversation',
      },
      {
        key: 'map-team',
        label: 'Map your team',
        description: 'Add people and their areas of expertise.',
        href: '/portal/brain/people',
        icon: 'groups',
        detect: 'brain.hasPerson',
      },
    ],
  },

  surveys: {
    domainKey: 'surveys',
    title: 'Create your first survey',
    blurb: 'Collect responses, qualify leads, and route results automatically.',
    actions: [
      enabledStep('Surveys', '/portal/surveys'),
      {
        key: 'create-survey',
        label: 'Create your first survey',
        description: 'Build a form, poll, or qualification questionnaire.',
        href: '/portal/surveys',
        icon: 'ballot',
        detect: 'surveys.hasSurvey',
      },
      {
        key: 'collect-response',
        label: 'Collect your first response',
        description: 'Share the survey link and watch results arrive.',
        href: '/portal/surveys',
        icon: 'how_to_vote',
        detect: 'surveys.hasResponse',
      },
    ],
  },

  bookings: {
    domainKey: 'bookings',
    title: 'Start taking bookings',
    blurb: 'Let clients book time with you directly.',
    actions: [
      enabledStep('Bookings', '/portal/tools/booking'),
      {
        key: 'create-page',
        label: 'Create a booking page',
        description: 'Set up a service, duration, and availability.',
        href: '/portal/tools/booking/new',
        icon: 'event_available',
        detect: 'bookings.hasPage',
      },
      {
        key: 'first-booking',
        label: 'Receive your first booking',
        description: 'Share your /book link and get a reservation.',
        href: '/portal/tools/booking',
        icon: 'event',
        detect: 'bookings.hasBooking',
      },
    ],
  },

  store: {
    domainKey: 'store',
    title: 'Open your store',
    blurb: 'Sell products with checkout, orders, and inventory.',
    actions: [
      enabledStep('Store', '/portal/websites'),
      {
        key: 'add-product',
        label: 'Add your first product',
        description: 'Create a product with pricing and images.',
        href: '/portal/websites',
        icon: 'inventory_2',
        detect: 'store.hasProduct',
      },
      {
        key: 'first-order',
        label: 'Receive your first order',
        description: 'Your storefront is live once orders can flow.',
        href: '/portal/websites',
        icon: 'shopping_cart',
        detect: 'store.hasOrder',
      },
    ],
  },

  esign: {
    domainKey: 'esign',
    title: 'Send your first contract',
    blurb: 'Draft, send, and e-sign agreements without leaving the portal.',
    actions: [
      enabledStep('E-sign', '/portal/crm/contracts'),
      {
        key: 'create-contract',
        label: 'Create your first contract',
        description: 'Draft an agreement from scratch or a template.',
        href: '/portal/crm/contracts',
        icon: 'history_edu',
        detect: 'esign.hasContract',
      },
      {
        key: 'send-contract',
        label: 'Send it for signature',
        description: 'Deliver a signing link to your counterparty.',
        href: '/portal/crm/contracts',
        icon: 'send',
        detect: 'esign.hasSentContract',
      },
      {
        key: 'first-signed',
        label: 'Get it fully executed',
        description: 'Collect every signature to seal the deal.',
        href: '/portal/crm/contracts',
        icon: 'task_alt',
        detect: 'esign.hasSignedContract',
      },
    ],
  },

  'pitch-decks': {
    domainKey: 'pitch-decks',
    title: 'Build your first deck',
    blurb: 'Design, share, and track branded presentations.',
    actions: [
      enabledStep('Pitch Decks', '/portal/websites'),
      {
        key: 'create-deck',
        label: 'Create your first deck',
        description: 'Start from a template or a blank canvas.',
        href: '/portal/websites',
        icon: 'slideshow',
        detect: 'decks.hasDeck',
      },
      {
        key: 'publish-deck',
        label: 'Publish and share it',
        description: 'Mint a share link and put it in front of someone.',
        href: '/portal/websites',
        icon: 'ios_share',
        detect: 'decks.hasPublishedDeck',
      },
    ],
  },

  automations: {
    domainKey: 'automations',
    title: 'Automate your first workflow',
    blurb: 'Trigger actions automatically from portal events.',
    actions: [
      enabledStep('Automations', '/portal/automations'),
      {
        key: 'create-automation',
        label: 'Create your first automation',
        description: 'Pick a trigger and the actions it fires.',
        href: '/portal/automations',
        icon: 'bolt',
        detect: 'automations.hasRule',
      },
      {
        key: 'enable-automation',
        label: 'Turn it on',
        description: 'Enable the rule so it runs on real events.',
        href: '/portal/automations',
        icon: 'toggle_on',
        detect: 'automations.hasEnabledRule',
      },
    ],
  },

  publishing: {
    domainKey: 'publishing',
    title: 'Publish to your channels',
    blurb: 'Draft and schedule social content from the portal.',
    actions: [
      enabledStep('Publishing', '/portal/publishing'),
      {
        key: 'connect-channel',
        label: 'Connect a channel',
        description: 'Link your LinkedIn account to publish.',
        href: '/portal/publishing',
        icon: 'link',
        detect: 'publishing.hasConnection',
      },
      {
        key: 'first-post',
        label: 'Draft your first post',
        description: 'Write it once, schedule it when ready.',
        href: '/portal/publishing',
        icon: 'post_add',
        detect: 'publishing.hasPost',
      },
    ],
  },

  projects: {
    domainKey: 'projects',
    title: 'Kick off a project',
    blurb: 'Keep work organized and your team in sync.',
    actions: [
      enabledStep('Projects', '/portal/projects'),
      {
        key: 'create-project',
        label: 'Create your first project',
        description: 'Set up a Kanban board for any workstream.',
        href: '/portal/projects',
        icon: 'add_task',
        detect: 'projects.hasProject',
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
 * Onboarding wizard tiers (OBQA-028 re-triage, card 563): complicated modules
 * no longer get their own per-module walk screen. `walk` = the original
 * action-checklist experience; `acknowledge` = a single "it's active" row with
 * no create-pressure (surveys); `summary` = grouped onto ONE final "Also
 * activated" screen instead of a dedicated segment (store/esign/pitch-decks/
 * automations/publishing — also sidesteps the LinkedIn-OAuth-mid-wizard
 * awkwardness for publishing). Kept db-free like the rest of this file.
 *
 * OBQA-005 re-triage: email joins the summary tier — an explain-only
 * "activated" row, mirroring the OBQA-028 model above, since sender
 * verification (its natural first action) isn't ready for inline setup (the
 * email settings page is broken — out of scope here). brain stays `walk`;
 * see OBQA-004 / BrainNoteSetupForm for its inline "create first note" action.
 */
export type WizardTier = 'walk' | 'acknowledge' | 'summary';

export const WIZARD_TIERS: Record<string, WizardTier> = {
  websites: 'walk',
  crm: 'walk',
  brain: 'walk',
  projects: 'walk',
  bookings: 'walk',
  surveys: 'acknowledge',
  email: 'summary',
  store: 'summary',
  esign: 'summary',
  'pitch-decks': 'summary',
  automations: 'summary',
  publishing: 'summary',
};

export function wizardTierFor(key: string): WizardTier {
  return WIZARD_TIERS[key] ?? 'walk';
}

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
      enabledStep(catalog?.name ?? key, catalog?.navHrefs?.[0] ?? '/portal/dashboard'),
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
