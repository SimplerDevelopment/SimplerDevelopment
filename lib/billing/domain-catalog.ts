// Feature-domain SKU catalog — the single source of truth for what we sell
// as per-domain SaaS modules in the portal.
//
// Pricing model (ADR-worthy summary):
// - Each sellable feature domain is one `services` row (category = domain key,
//   slug = `module-<key>`, billingCycle = monthly). Seeded by
//   scripts/seed-domain-modules.ts; price is *data* (services.price /
//   Stripe Price), so product can reprice without a deploy. The numbers here
//   are seed defaults + display fallbacks only.
// - "Everything" bundle is one `services` row with category 'bundle' —
//   `hasServiceAccess()` already treats 'bundle' as granting every category.
//   Bundle price is deliberately ~40% below the sum of the parts.
// - Domains split into two cost classes:
//     flat    — no marginal 3rd-party cost (CRM, projects, surveys, bookings,
//               publishing). Sold as a flat monthly fee.
//     metered — real per-unit COGS behind them (AI tokens → Anthropic/OpenAI,
//               email sends → Resend, e-sign envelopes → Dropbox Sign,
//               hosting GB → Railway/Vercel). Sold as flat fee + included
//               monthly allowance + overage. AI-token meters settle against
//               the existing ai_credit ledger; infra meters settle through
//               usage_meter_events → metered Stripe subscription items.
// - clients.billingMode ('agency' | 'saas' | 'byok') decides how a client
//   relates to this catalog:
//     agency — legacy managed clients; module gating is bypassed entirely.
//     saas   — prepays module subscriptions; usage past the included
//              allowance is billed (pay-as-you-go credits or metered items).
//     byok   — supplies their own 3rd-party API keys (byokProviders below);
//              meters with `waivedForByok` are not billed because the COGS
//              lands on the client's own keys. Hosting is never waived —
//              the infra is ours regardless of whose API keys run on it.

export type BillingMode = 'agency' | 'saas' | 'byok';

export const BILLING_MODES: BillingMode[] = ['agency', 'saas', 'byok'];

export interface DomainMeter {
  /** usage_meter_events.resource / metered_subscription_items.resource value */
  resource: string;
  label: string;
  /** display unit, e.g. 'emails', 'tokens', 'GB' */
  unit: string;
  /** included per month with the single-module subscription */
  includedPerMonth: number;
  /** included per month on the Everything bundle */
  bundleIncludedPerMonth: number;
  /** overage price in cents per `overageUnitSize` units */
  overageRateCents: number;
  overageUnitSize: number;
  /** true when BYOK clients carry this cost on their own provider key */
  waivedForByok: boolean;
}

export interface FeatureDomain {
  /** stable key — doubles as services.category (must match layout/API gates) */
  key: string;
  /** services.slug for the seeded module SKU */
  slug: string;
  name: string;
  /** marketing one-liner shown on pricing cards and upsells */
  tagline: string;
  /** Material icon name */
  icon: string;
  /** seed default + display fallback; live price = services.price */
  monthlyPriceCents: number;
  /** Live Stripe IDs (created 2026-06-11 in acct SimplerDevelopment.com via
   * Stripe MCP) — copied onto the services row by scripts/seed-domain-modules.ts.
   * Repricing: create a new Stripe Price, update services.stripePriceId. */
  stripeProductId?: string;
  stripePriceId?: string;
  /** marketing bullets for the pricing card */
  features: string[];
  meters: DomainMeter[];
  /** AI credits granted per cycle (services.includedAiCredits) */
  includedAiCredits: number;
  /** client_api_keys.provider values a BYOK client must connect to use this */
  byokProviders: string[];
  /** related domain keys to cross-promote inside this domain's UI */
  promotesTo: string[];
  /** top-level portal nav hrefs gated by this domain (prefix match) */
  navHrefs: string[];
}

export const AI_TOKENS_METER: Omit<DomainMeter, 'includedPerMonth' | 'bundleIncludedPerMonth'> = {
  resource: 'ai_tokens',
  label: 'AI usage',
  unit: 'tokens',
  overageRateCents: 100, // $1.00 per 100k tokens past the included grant
  overageUnitSize: 100_000,
  waivedForByok: true,
};

export const FEATURE_DOMAINS: FeatureDomain[] = [
  {
    key: 'websites',
    slug: 'module-websites',
    stripeProductId: 'prod_UgUqarrMNckesj',
    stripePriceId: 'price_1Th7smCVr9RJZQZPIMZLs3ae',
    name: 'Websites & CMS',
    tagline: 'Build, edit, and A/B test client websites with the visual editor.',
    icon: 'language',
    monthlyPriceCents: 2_900,
    features: [
      'Block-based CMS with visual editor',
      'Custom content types and taxonomies',
      'A/B experiments built in',
      'Media library',
      'Managed hosting and domains',
    ],
    meters: [
      {
        resource: 'hosting_bandwidth_gb',
        label: 'Bandwidth',
        unit: 'GB',
        includedPerMonth: 100,
        bundleIncludedPerMonth: 500,
        overageRateCents: 5,
        overageUnitSize: 1,
        waivedForByok: false, // hosting infra is ours in every mode
      },
      {
        resource: 'hosting_storage_gb',
        label: 'Storage',
        unit: 'GB',
        includedPerMonth: 10,
        bundleIncludedPerMonth: 50,
        overageRateCents: 10,
        overageUnitSize: 1,
        waivedForByok: false,
      },
    ],
    includedAiCredits: 0,
    byokProviders: [],
    promotesTo: ['store', 'email', 'brain'],
    navHrefs: ['/portal/websites', '/portal/media', '/portal/experiments'],
  },
  {
    key: 'crm',
    slug: 'module-crm',
    stripeProductId: 'prod_UgUqG2GHti3xYa',
    stripePriceId: 'price_1Th7ssCVr9RJZQZPB9zMaKJE',
    name: 'CRM & Sales',
    tagline: 'Contacts, companies, deals, and pipelines — your whole sales motion.',
    icon: 'contacts',
    monthlyPriceCents: 2_500,
    features: [
      'Contacts, companies, and deal pipelines',
      'Custom fields and saved views',
      'Lead scoring rules',
      'Activity timeline',
    ],
    meters: [],
    includedAiCredits: 0,
    byokProviders: [],
    promotesTo: ['email', 'esign', 'brain'],
    navHrefs: ['/portal/crm'],
  },
  {
    key: 'brain',
    slug: 'module-brain',
    stripeProductId: 'prod_UgUqs3KNQfEH6N',
    stripePriceId: 'price_1Th7szCVr9RJZQZPVQjvdKTH',
    name: 'Company Brain',
    tagline: 'Your company knowledge, searchable and AI-powered.',
    icon: 'psychology',
    monthlyPriceCents: 4_900,
    features: [
      'Knowledge base with AI search (RAG)',
      'Meetings, decisions, and playbooks',
      'People, org chart, and expertise map',
      'AI assistant connected to your data',
      '500k AI tokens included monthly',
    ],
    meters: [
      { ...AI_TOKENS_METER, includedPerMonth: 500_000, bundleIncludedPerMonth: 2_000_000 },
    ],
    includedAiCredits: 500_000,
    byokProviders: ['anthropic', 'openai'],
    promotesTo: ['crm', 'automations', 'pitch-decks'],
    navHrefs: ['/portal/brain', '/portal/branding'],
  },
  {
    key: 'email',
    slug: 'module-email',
    stripeProductId: 'prod_UgUrAZ5RszK5x3',
    stripePriceId: 'price_1Th7t5CVr9RJZQZPwEXxBPz4',
    name: 'Email Marketing',
    tagline: 'Campaigns, lists, segments, and analytics that close the loop.',
    icon: 'email',
    monthlyPriceCents: 1_900,
    features: [
      'Campaigns and templates',
      'Lists, segments, and subscriber management',
      'Open and click analytics',
      '10,000 sends included monthly',
    ],
    meters: [
      {
        resource: 'email_send',
        label: 'Email sends',
        unit: 'emails',
        includedPerMonth: 10_000,
        bundleIncludedPerMonth: 25_000,
        overageRateCents: 100, // $1.00 per 1k extra sends
        overageUnitSize: 1_000,
        waivedForByok: true,
      },
    ],
    includedAiCredits: 0,
    byokProviders: ['resend'],
    promotesTo: ['crm', 'automations', 'surveys'],
    navHrefs: ['/portal/email'],
  },
  {
    key: 'projects',
    slug: 'module-projects',
    stripeProductId: 'prod_UgUrn3zfznBau4',
    stripePriceId: 'price_1Th7tACVr9RJZQZPhlUUXRqi',
    name: 'Projects & Tickets',
    tagline: 'Kanban boards, tasks, and support tickets in one place.',
    icon: 'view_kanban',
    monthlyPriceCents: 1_500,
    features: [
      'Kanban projects with sprints',
      'My Tasks across every source',
      'Support ticket inbox',
      'Time logging and checklists',
    ],
    meters: [],
    includedAiCredits: 0,
    byokProviders: [],
    promotesTo: ['brain', 'automations'],
    navHrefs: ['/portal/projects', '/portal/my-tasks', '/portal/tickets'],
  },
  {
    key: 'surveys',
    slug: 'module-surveys',
    stripeProductId: 'prod_UgUrx6tpbS3czo',
    stripePriceId: 'price_1Th7tGCVr9RJZQZPd5NsGxsW',
    name: 'Surveys & Forms',
    tagline: 'Branded surveys with conditional logic and recommendations.',
    icon: 'poll',
    monthlyPriceCents: 1_200,
    features: [
      'Survey builder with conditional logic',
      'Pre-built templates',
      'Response analytics',
      'Approval workflows',
    ],
    meters: [],
    includedAiCredits: 0,
    byokProviders: [],
    promotesTo: ['email', 'crm'],
    navHrefs: ['/portal/surveys'],
  },
  {
    key: 'bookings',
    slug: 'module-bookings',
    stripeProductId: 'prod_UgUrhitHG1fgcH',
    stripePriceId: 'price_1Th7tMCVr9RJZQZPg4KtLZM4',
    name: 'Bookings & Scheduling',
    tagline: 'Booking pages your clients can self-schedule against.',
    icon: 'event_available',
    monthlyPriceCents: 1_500,
    features: [
      'Public booking pages',
      'Calendar sync',
      'Cancellation and reschedule flows',
    ],
    meters: [],
    includedAiCredits: 0,
    byokProviders: [],
    promotesTo: ['crm', 'email'],
    navHrefs: [],
  },
  {
    key: 'store',
    slug: 'module-store',
    stripeProductId: 'prod_UgUrV2etRzxQgH',
    stripePriceId: 'price_1Th7tSCVr9RJZQZPbHouVDCO',
    name: 'Storefront & Commerce',
    tagline: 'Sell products on your site — orders, discounts, fulfillment.',
    icon: 'shopping_cart',
    monthlyPriceCents: 2_900,
    features: [
      'Products, variants, and inventory',
      'Orders, discounts, and gift certificates',
      'Stripe Connect or bring your own Stripe',
      'Print-on-demand fulfillment',
    ],
    meters: [], // monetized via Stripe Connect platform fee, not a usage meter
    includedAiCredits: 0,
    byokProviders: [],
    promotesTo: ['websites', 'email'],
    navHrefs: [],
  },
  {
    key: 'esign',
    slug: 'module-esign',
    stripeProductId: 'prod_UgUrJfd9PT982L',
    stripePriceId: 'price_1Th7tXCVr9RJZQZPAjHE1EPH',
    name: 'E-Sign & Contracts',
    tagline: 'Send contracts for legally binding signature without leaving the portal.',
    icon: 'draw',
    monthlyPriceCents: 1_500,
    features: [
      'Contract sending and tracking',
      'Approval workflows',
      '20 envelopes included monthly',
    ],
    meters: [
      {
        resource: 'esign_envelopes',
        label: 'Envelopes',
        unit: 'envelopes',
        includedPerMonth: 20,
        bundleIncludedPerMonth: 50,
        overageRateCents: 150, // $1.50 per extra envelope
        overageUnitSize: 1,
        waivedForByok: true,
      },
    ],
    includedAiCredits: 0,
    byokProviders: ['dropbox_sign'],
    promotesTo: ['crm', 'projects'],
    navHrefs: [],
  },
  {
    key: 'pitch-decks',
    slug: 'module-pitch-decks',
    stripeProductId: 'prod_UgUrRnSBfrd82m',
    stripePriceId: 'price_1Th7tdCVr9RJZQZP6uUcusl1',
    name: 'Pitches & Proposals',
    tagline: 'AI-generated pitch decks and proposals that win work.',
    icon: 'slideshow',
    monthlyPriceCents: 1_900,
    features: [
      'AI deck generation',
      'Proposal builder',
      '100k AI tokens included monthly',
    ],
    meters: [
      { ...AI_TOKENS_METER, includedPerMonth: 100_000, bundleIncludedPerMonth: 0 /* pooled into bundle grant */ },
    ],
    includedAiCredits: 100_000,
    byokProviders: ['anthropic'],
    promotesTo: ['crm', 'brain'],
    navHrefs: ['/portal/tools/pitch-decks'],
  },
  {
    key: 'automations',
    slug: 'module-automations',
    stripeProductId: 'prod_UgUrXz3woZSM0N',
    stripePriceId: 'price_1Th7tiCVr9RJZQZPSrJJ0oZg',
    name: 'Automations',
    tagline: 'Triggers, schedules, and workflows that run your busywork.',
    icon: 'bolt',
    monthlyPriceCents: 1_900,
    features: [
      'Event and schedule triggers',
      'Run logs and previews',
      '1,000 runs included monthly',
    ],
    meters: [
      {
        resource: 'automation_runs',
        label: 'Automation runs',
        unit: 'runs',
        includedPerMonth: 1_000,
        bundleIncludedPerMonth: 5_000,
        overageRateCents: 1,
        overageUnitSize: 1,
        waivedForByok: false, // compute is ours in every mode
      },
    ],
    includedAiCredits: 0,
    byokProviders: [],
    promotesTo: ['brain', 'email'],
    navHrefs: ['/portal/automations'],
  },
  {
    key: 'publishing',
    slug: 'module-publishing',
    stripeProductId: 'prod_UgUsQZqCuMM1d1',
    stripePriceId: 'price_1Th7toCVr9RJZQZPofgLDdmH',
    name: 'Publishing Command Center',
    tagline: 'Plan, schedule, and publish content across every channel.',
    icon: 'rocket_launch',
    monthlyPriceCents: 1_500,
    features: [
      'Content calendar and board',
      'Multi-channel scheduling',
      'Campaign grouping and permissions',
    ],
    meters: [],
    includedAiCredits: 0,
    byokProviders: [],
    promotesTo: ['email', 'websites'],
    navHrefs: ['/portal/publishing'],
  },
];

// ── Bundle ────────────────────────────────────────────────────────────────────

export const BUNDLE_SLUG = 'module-bundle-complete';

export interface BundleDef {
  slug: string;
  name: string;
  tagline: string;
  icon: string;
  monthlyPriceCents: number;
  includedAiCredits: number;
  stripeProductId?: string;
  stripePriceId?: string;
}

/** Sum of every individual module's monthly price, in cents. */
export function sumOfModulePricesCents(): number {
  return FEATURE_DOMAINS.reduce((sum, d) => sum + d.monthlyPriceCents, 0);
}

export const BUNDLE: BundleDef = {
  slug: BUNDLE_SLUG,
  name: 'SimplerDev Complete',
  tagline: 'Every module, one subscription — about 40% off buying them separately.',
  icon: 'all_inclusive',
  monthlyPriceCents: 15_900, // vs $2.61 sum of parts
  includedAiCredits: 2_000_000,
  stripeProductId: 'prod_UgUsJfBtYuBJyu',
  stripePriceId: 'price_1Th7ttCVr9RJZQZP5SLpYwVJ',
};

// ── Plan tiers (the public 3-tier pricing — curated bundles over the modules) ──
//
// The self-serve pricing page sells THREE per-seat tiers; the 12 modules above
// remain the underlying machinery (and stay available for agency/custom deals).
// A tier is one `services` row (slug + category = tier.slug, e.g. 'plan-growth')
// that grants tier.domains. BYOK metering-waiver is honored ONLY on a
// byokEligible tier (Scale) — the "BYOK inversion": marked-up metered AI on the
// lower tiers is the profit center; BYOK (spend-at-cost) is a Scale unlock.
//
// Prices are illustrative seed/display defaults — live price = services.price.
// Stripe IDs are created per-environment by scripts/billing/sync-stripe-products.ts.

export type TierKey = 'starter' | 'growth' | 'scale';

export interface TierDef {
  key: TierKey;
  /** services.slug AND services.category for this tier's SKU */
  slug: string;
  name: string;
  tagline: string;
  /** per-seat monthly price (seed/display default; live = services.price) */
  monthlyPriceCents: number;
  /** domain keys granted; 'all' = every module */
  domains: string[] | 'all';
  /** AI tokens granted per cycle (services.includedAiCredits) */
  includedAiCredits: number;
  /** BYOK metering-waiver is honored only on a byokEligible tier */
  byokEligible: boolean;
  features: string[];
  stripeProductId?: string;
  stripePriceId?: string;
}

export const TIERS: TierDef[] = [
  {
    key: 'starter',
    slug: 'plan-starter',
    name: 'Starter',
    tagline: 'The essentials to run the basics.',
    monthlyPriceCents: 1_900,
    domains: ['websites', 'crm', 'projects'],
    includedAiCredits: 100_000,
    byokEligible: false,
    features: [
      'Websites & CMS, CRM, and Projects',
      '100k AI tokens/mo',
      'Bring your own AI key to use the agent (you pay your own tokens)',
    ],
  },
  {
    key: 'growth',
    slug: 'plan-growth',
    name: 'Growth',
    tagline: 'The AI agent that runs your business — just chat to get work done.',
    monthlyPriceCents: 5_900,
    domains: ['websites', 'crm', 'projects', 'brain', 'email', 'automations', 'surveys', 'bookings'],
    includedAiCredits: 1_000_000,
    byokEligible: false,
    features: [
      'Everything in Starter',
      'Company Brain + the in-app AI agent, included',
      'Email, Automations, Surveys, and Bookings',
      '1M AI tokens/mo included',
    ],
  },
  {
    key: 'scale',
    slug: 'plan-scale',
    name: 'Scale',
    tagline: 'Everything, plus bring-your-own-key and white-label.',
    monthlyPriceCents: 11_900,
    domains: 'all',
    includedAiCredits: 3_000_000,
    byokEligible: true,
    features: [
      'Every module',
      '3M AI tokens/mo included',
      'BYOK — spend tokens at cost (no markup)',
      'White-label, governance, and priority support',
    ],
  },
];

const TIER_BY_CATEGORY = new Map(TIERS.map((t) => [t.slug, t]));

/** The tier whose SKU category matches, if the category is a tier. */
export function getTierByCategory(category: string): TierDef | undefined {
  return TIER_BY_CATEGORY.get(category);
}

/** Resolve a tier's granted domain keys ('all' → every module). */
export function tierDomainKeys(tier: TierDef): string[] {
  return tier.domains === 'all' ? FEATURE_DOMAINS.map((d) => d.key) : tier.domains;
}

// ── Lookups ───────────────────────────────────────────────────────────────────

const BY_KEY = new Map(FEATURE_DOMAINS.map((d) => [d.key, d]));

export function getDomainByKey(key: string): FeatureDomain | undefined {
  return BY_KEY.get(key);
}

/** Domain whose navHrefs prefix-match the given portal pathname, if any. */
export function getDomainForPath(pathname: string): FeatureDomain | undefined {
  return FEATURE_DOMAINS.find((d) =>
    d.navHrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`)),
  );
}

/** All BYOK providers required across a set of subscribed domain keys. */
export function requiredByokProviders(domainKeys: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const key of domainKeys) {
    for (const p of BY_KEY.get(key)?.byokProviders ?? []) out.add(p);
  }
  return [...out];
}

/** Every BYOK provider any domain can require (used for the full checklist). */
export function allByokProviders(): string[] {
  return requiredByokProviders(FEATURE_DOMAINS.map((d) => d.key));
}

/** Human labels for client_api_keys.provider values. */
export const BYOK_PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  resend: 'Resend (email delivery)',
  dropbox_sign: 'Dropbox Sign (e-signatures)',
};
