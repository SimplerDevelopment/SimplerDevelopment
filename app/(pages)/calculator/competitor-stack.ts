/**
 * The point-tool stack a SimplerDevelopment module replaces — one named
 * competitor per feature domain, at that vendor's published list price.
 *
 * WHY THIS FILE EXISTS SEPARATELY: the /compare page deliberately argues
 * against the GENERIC pattern of stitched point tools and names nobody. A cost
 * calculator can't do that — a dollar figure with no vendor behind it is a
 * number we made up. So this page names vendors, and every row carries the URL
 * it came from plus the date it was read. That citation is the thing that makes
 * the page defensible; a row without one does not belong here.
 *
 * MAINTENANCE: these are list prices and they rot. `PRICES_CHECKED_ON` is
 * rendered on the page, so a stale table is visibly stale rather than quietly
 * wrong. A guard test (tests/unit/calculator-competitor-stack.test.ts) fails if
 * a new module lands in FEATURE_DOMAINS without a row here — the drift that
 * would otherwise silently under-count the competitor side.
 *
 * DELIBERATELY CONSERVATIVE — every judgement call understates our own case:
 *  - Month-to-month rates on both sides where the vendor publishes one, because
 *    the SD module prices are month-to-month. Where a vendor publishes ONLY an
 *    annual-commitment rate (Calendly, DocuSign), we use that lower number.
 *  - One-time onboarding fees are excluded (HubSpot's is $1,500).
 *  - Usage overages, transaction fees (Shopify takes 2% on Basic), and AI
 *    credit top-ups are excluded on BOTH sides.
 *  - Per-channel/per-contact tools are counted at their smallest unit.
 */

import { FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';

/** The date every price below was read off the vendor's page. Shown on the page. */
export const PRICES_CHECKED_ON = 'August 11, 2026';

export interface CompetitorRow {
  /** FEATURE_DOMAINS.key this stands in for */
  key: string;
  vendor: string;
  plan: string;
  /** list price in cents, in the unit `basis` describes */
  monthlyCents: number;
  /**
   * 'seat' multiplies by the team size; 'flat' does not. This is the whole
   * reason a 3-person team's bill and a 10-person team's bill diverge so hard.
   */
  basis: 'seat' | 'flat';
  /** vendor-enforced seat floor — you pay for these whether you use them or not */
  minSeats?: number;
  /** the honest caveat for this row, rendered under it */
  note: string;
  url: string;
  /**
   * 'vendor' — read directly off the vendor's own pricing page.
   * 'press'  — that page blocks automated reads; figure corroborated from
   *            published 2026 pricing write-ups. Footnoted on the page.
   */
  source: 'vendor' | 'press';
}

export const COMPETITORS: CompetitorRow[] = [
  {
    key: 'websites',
    vendor: 'Webflow',
    plan: 'Premium site plan',
    monthlyCents: 3_900,
    basis: 'flat',
    note: 'Per site, month-to-month ($25/mo billed yearly). Webflow charges Workspace seats on top of this for collaborators.',
    url: 'https://webflow.com/pricing',
    source: 'press',
  },
  {
    key: 'crm',
    vendor: 'HubSpot',
    plan: 'Sales Hub Professional',
    monthlyCents: 10_000,
    basis: 'seat',
    minSeats: 5,
    note: 'Month-to-month; $90/seat billed annually. The 5-seat minimum is the important part — a 3-person team still pays for 5. Excludes the one-time $1,500 onboarding fee.',
    url: 'https://www.hubspot.com/pricing/sales',
    source: 'press',
  },
  {
    key: 'brain',
    vendor: 'Notion',
    plan: 'Business',
    monthlyCents: 2_000,
    basis: 'seat',
    note: 'AI is included at this tier, but Custom Agents run on credits at $10 per 1,000/mo on top.',
    url: 'https://www.notion.com/pricing',
    source: 'vendor',
  },
  {
    key: 'email',
    vendor: 'Mailchimp',
    plan: 'Standard',
    monthlyCents: 2_000,
    basis: 'flat',
    note: 'Priced at the 500-contact tier with 6,000 sends. Climbs steeply with list size — this is the floor, not a typical bill.',
    url: 'https://mailchimp.com/pricing/marketing/',
    source: 'vendor',
  },
  {
    key: 'projects',
    vendor: 'Asana',
    plan: 'Starter',
    monthlyCents: 1_349,
    basis: 'seat',
    note: 'Month-to-month; $10.99/user billed annually. Support ticketing is a separate product entirely.',
    url: 'https://asana.com/pricing',
    source: 'vendor',
  },
  {
    key: 'surveys',
    vendor: 'Typeform',
    plan: 'Basic',
    monthlyCents: 3_900,
    basis: 'flat',
    note: 'Month-to-month; $28/mo billed annually. Includes 1 seat and 100 responses/mo — the next tier up is $79/mo.',
    url: 'https://www.typeform.com/pricing/',
    source: 'vendor',
  },
  {
    key: 'bookings',
    vendor: 'Calendly',
    plan: 'Standard',
    monthlyCents: 1_000,
    basis: 'seat',
    note: 'Annual-billing rate — Calendly does not publish a month-to-month figure on its pricing page, so this is the lower of the two.',
    url: 'https://calendly.com/pricing',
    source: 'vendor',
  },
  {
    key: 'store',
    vendor: 'Shopify',
    plan: 'Basic',
    monthlyCents: 3_900,
    basis: 'flat',
    note: 'Month-to-month; $29/mo billed yearly. Basic includes 0 staff accounts and Shopify still takes 2% per transaction on top.',
    url: 'https://www.shopify.com/pricing',
    source: 'vendor',
  },
  {
    key: 'esign',
    vendor: 'DocuSign',
    plan: 'Standard',
    monthlyCents: 3_000,
    basis: 'seat',
    note: 'Annual commitment billed monthly — DocuSign publishes no month-to-month rate. Capped at 100 envelopes per user per year, then overages.',
    url: 'https://ecom.docusign.com/plans-and-pricing/esignature',
    source: 'vendor',
  },
  {
    key: 'pitch-decks',
    vendor: 'Gamma',
    plan: 'Pro',
    monthlyCents: 2_000,
    basis: 'seat',
    note: 'Month-to-month; $15/user billed annually.',
    url: 'https://gamma.app/pricing',
    source: 'press',
  },
  {
    key: 'automations',
    vendor: 'Zapier',
    plan: 'Professional',
    monthlyCents: 2_999,
    basis: 'flat',
    note: 'Month-to-month at the smallest tier — 750 tasks/mo, 1 seat. 10,000 tasks/mo is $129/mo billed annually.',
    url: 'https://zapier.com/pricing',
    source: 'vendor',
  },
  {
    key: 'publishing',
    vendor: 'Buffer',
    plan: 'Team',
    monthlyCents: 1_000,
    basis: 'flat',
    note: 'Priced per social channel — this is ONE channel. A business posting to four channels pays about $40/mo.',
    url: 'https://buffer.com/pricing',
    source: 'vendor',
  },
];

const BY_KEY = new Map(COMPETITORS.map((c) => [c.key, c]));

export function competitorFor(key: string): CompetitorRow | undefined {
  return BY_KEY.get(key);
}

/**
 * What one competitor row costs at a given team size. Seat-based rows are
 * floored at the vendor's seat minimum — you cannot buy 3 seats of a product
 * that sells 5, and pretending otherwise would understate the real invoice.
 */
export function competitorMonthlyCents(row: CompetitorRow, seats: number): number {
  if (row.basis === 'flat') return row.monthlyCents;
  return row.monthlyCents * Math.max(seats, row.minSeats ?? 1);
}

/** The whole point-tool bill for a set of module keys at a given team size. */
export function stackMonthlyCents(keys: readonly string[], seats: number): number {
  return keys.reduce((sum, key) => {
    const row = BY_KEY.get(key);
    return row ? sum + competitorMonthlyCents(row, seats) : sum;
  }, 0);
}

/** Module keys in catalog order — the display order for both sides. */
export const MODULE_KEYS = FEATURE_DOMAINS.map((d) => d.key);

/** Sensible opening state: the five modules almost every operator already pays for. */
export const DEFAULT_SELECTION = ['websites', 'crm', 'email', 'projects', 'bookings'];
export const DEFAULT_SEATS = 3;
