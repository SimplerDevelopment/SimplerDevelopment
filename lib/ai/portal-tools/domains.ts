/**
 * Portal intent-router domain map.
 *
 * Every portal tool belongs to exactly one router domain. The intent router
 * (folded into the Haiku classifier) returns a set of relevant domains per
 * request; `toolsForDomains` then narrows the tool surface handed to the loop
 * to just those domains (+ a always-on baseline).
 *
 * `TOOL_DOMAIN` is the single source of truth. `tests/unit/portal-tool-domains.test.ts`
 * asserts it stays in exact set-equality with `PORTAL_TOOLS`, so adding a tool
 * without classifying it fails CI (mirrors the MCP registry baseline test).
 */

import type Anthropic from '@anthropic-ai/sdk';

// Router-facing domains. `navigation` is intentionally NOT here — `navigate_to`
// is cross-cutting and always loaded (see BASELINE_TOOL_NAMES), so the router
// never has to pick it.
export const PORTAL_DOMAINS = [
  'dashboard',
  'projects',
  'billing',
  'support',
  'services',
  'cms',
  'email',
  'pitch_decks',
  'booking',
  'team',
  'crm',
  'surveys',
  'automations',
] as const;

export type PortalDomain = (typeof PORTAL_DOMAINS)[number];

// Tools that are loaded regardless of which domains the router selects:
//  - navigate_to  — cross-cutting routing to any portal page
//  - get_dashboard_summary — cheap, common landing/overview lookup
export const BASELINE_TOOL_NAMES = new Set<string>([
  'navigate_to',
  'get_dashboard_summary',
]);

/**
 * Every portal tool name → its router domain. Transcribed from the per-domain
 * modules under `lib/ai/portal-tools/`. Kept honest by the completeness test.
 * `navigate_to` is mapped to 'navigation' (not a PortalDomain) because it is a
 * baseline tool, never router-selected.
 */
export const TOOL_DOMAIN: Record<string, PortalDomain | 'navigation'> = {
  // dashboard
  get_dashboard_summary: 'dashboard',

  // projects
  get_my_projects: 'projects',
  pm_spawn_project_from_deal: 'projects',
  get_project_board: 'projects',
  get_project_cards: 'projects',
  get_sprint_progress: 'projects',
  get_project_files: 'projects',
  add_card_comment: 'projects',
  create_project_card: 'projects',
  update_project_card: 'projects',
  move_project_card: 'projects',

  // billing
  get_my_invoices: 'billing',
  get_invoice_details: 'billing',
  get_payment_methods: 'billing',
  pay_invoice: 'billing',

  // support
  get_my_tickets: 'support',
  get_ticket_details: 'support',
  create_support_ticket: 'support',
  reply_to_ticket: 'support',

  // services
  get_services_catalog: 'services',
  get_my_services: 'services',
  request_service: 'services',

  // cms / websites
  get_my_websites: 'cms',
  get_website_pages: 'cms',
  get_website_categories: 'cms',
  get_website_tags: 'cms',
  get_website_media: 'cms',
  get_my_hosted_sites: 'cms',
  create_website_page: 'cms',
  publish_page: 'cms',
  create_website_category: 'cms',
  create_website_tag: 'cms',
  get_page_content: 'cms',
  update_page_blocks: 'cms',
  update_block_by_id: 'cms',
  update_page_metadata: 'cms',

  // email
  get_my_email_campaigns: 'email',
  get_my_email_lists: 'email',
  create_email_campaign: 'email',
  update_email_campaign: 'email',
  get_email_campaign_details: 'email',
  add_email_subscriber: 'email',
  get_email_segments: 'email',
  create_email_segment: 'email',

  // pitch decks
  get_my_pitch_decks: 'pitch_decks',
  create_pitch_deck: 'pitch_decks',
  get_pitch_deck_slides: 'pitch_decks',
  update_pitch_deck_slide: 'pitch_decks',

  // booking
  get_my_booking_pages: 'booking',
  get_bookings_for_page: 'booking',
  create_booking_page: 'booking',
  update_booking_page: 'booking',

  // team / profile
  get_suggested_projects: 'team',
  get_my_team: 'team',
  get_my_profile: 'team',
  request_suggested_project: 'team',
  update_profile: 'team',
  invite_team_member: 'team',

  // navigation (baseline, never router-selected)
  navigate_to: 'navigation',

  // crm
  get_crm_contacts: 'crm',
  get_crm_contact_detail: 'crm',
  get_crm_companies: 'crm',
  get_crm_deals: 'crm',
  get_crm_pipelines: 'crm',
  get_crm_activities: 'crm',
  create_crm_contact: 'crm',
  update_crm_contact: 'crm',
  create_crm_company: 'crm',
  create_crm_deal: 'crm',
  update_crm_deal: 'crm',
  log_crm_activity: 'crm',
  get_crm_proposals: 'crm',
  create_crm_proposal: 'crm',
  send_crm_proposal: 'crm',

  // surveys
  get_my_surveys: 'surveys',
  get_survey_details: 'surveys',
  create_survey: 'surveys',
  update_survey: 'surveys',

  // automations
  get_my_automations: 'automations',
  create_automation: 'automations',
  toggle_automation: 'automations',
};

/** Reverse lookup used to score router accuracy. Unknown tools map to null. */
export function domainOfTool(name: string): PortalDomain | 'navigation' | null {
  return TOOL_DOMAIN[name] ?? null;
}

/**
 * Narrow a tool list to the selected domains plus the always-on baseline.
 * Order is preserved from the input `allTools` (the route's intentional
 * read/write ordering). If `selected` is empty, returns `allTools` unchanged —
 * the fail-open path (router gave us nothing → load everything).
 */
export function toolsForDomains(
  selected: readonly PortalDomain[],
  allTools: Anthropic.Tool[],
): Anthropic.Tool[] {
  if (selected.length === 0) return allTools;
  const want = new Set<string>(selected);
  return allTools.filter(
    (t) => BASELINE_TOOL_NAMES.has(t.name) || want.has(TOOL_DOMAIN[t.name] ?? ''),
  );
}

/** The set of domains a list of executed tool calls actually touched. */
export function domainsOfToolCalls(
  toolCalls: { name: string }[],
): PortalDomain[] {
  const hit = new Set<PortalDomain>();
  for (const tc of toolCalls) {
    const d = TOOL_DOMAIN[tc.name];
    if (d && d !== 'navigation') hit.add(d);
  }
  return [...hit];
}
