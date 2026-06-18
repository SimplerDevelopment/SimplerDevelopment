// @vitest-environment node
/**
 * Public-API baseline for `@/lib/ai/portal-tools`.
 *
 * Locks down the exact set of exported symbols, their arity, and the shape of the
 * `PORTAL_TOOLS` Anthropic tool registry (names, required-arg lists, top-level
 * input_schema property keys). Any drift here — pre- or post-refactor — fails
 * loudly so we can catch silent breaks to the AI tool surface.
 */
import { describe, it, expect, vi } from 'vitest';

// `@/lib/db` throws at module load without DATABASE_URL. Stub it so we can
// import the pure tool definitions/dispatcher signature in isolation.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/automation/event-bus', () => ({ emitEvent: vi.fn() }));
vi.mock('@/lib/crm/default-pipeline', () => ({ ensureDefaultPipeline: vi.fn() }));

import * as portalTools from '@/lib/ai/portal-tools';

const EXPECTED_EXPORTS = ['PORTAL_TOOLS', 'executePortalTool', 'HANDLERS'] as const;

// The full, locked-in tool registry. Every name → list of `required` keys and
// the full set of input_schema property keys (in declaration order is fine, we
// compare as sorted sets). Refactors must preserve this shape exactly.
const EXPECTED_TOOL_REGISTRY: Record<string, { required: string[]; properties: string[] }> = {
  // Dashboard
  get_dashboard_summary: { required: [], properties: [] },

  // Projects / Sprints / Files / Cards
  get_my_projects: { required: [], properties: [] },
  pm_spawn_project_from_deal: { required: ['deal_id'], properties: ['deal_id', 'template_project_id', 'name_prefix'] },
  get_project_board: { required: ['project_id'], properties: ['project_id'] },
  get_project_cards: { required: ['project_id'], properties: ['project_id'] },
  get_sprint_progress: { required: ['project_id'], properties: ['project_id'] },
  get_project_files: { required: ['project_id'], properties: ['project_id'] },
  create_project_card: {
    required: ['column_id', 'title'],
    properties: ['column_id', 'title', 'description', 'priority', 'due_date'],
  },
  update_project_card: {
    required: ['card_id'],
    properties: ['card_id', 'title', 'description', 'priority', 'due_date'],
  },
  move_project_card: { required: ['card_id', 'column_id'], properties: ['card_id', 'column_id'] },
  add_card_comment: { required: ['card_id', 'body'], properties: ['card_id', 'body'] },

  // Billing & Invoices
  get_my_invoices: { required: [], properties: [] },
  get_invoice_details: { required: ['invoice_id'], properties: ['invoice_id'] },
  get_payment_methods: { required: [], properties: [] },
  pay_invoice: { required: ['invoice_id'], properties: ['invoice_id'] },

  // Support Tickets
  get_my_tickets: { required: [], properties: [] },
  get_ticket_details: { required: ['ticket_id'], properties: ['ticket_id'] },
  create_support_ticket: {
    required: ['subject', 'body', 'priority', 'category'],
    properties: ['subject', 'body', 'priority', 'category'],
  },
  reply_to_ticket: { required: ['ticket_id', 'body'], properties: ['ticket_id', 'body'] },

  // Services
  get_services_catalog: { required: [], properties: [] },
  get_my_services: { required: [], properties: [] },
  request_service: { required: ['service_id'], properties: ['service_id', 'message'] },

  // Websites / CMS
  get_my_websites: { required: [], properties: [] },
  get_website_pages: { required: ['website_id'], properties: ['website_id'] },
  get_website_categories: { required: ['website_id'], properties: ['website_id'] },
  get_website_tags: { required: ['website_id'], properties: ['website_id'] },
  get_website_media: { required: ['website_id'], properties: ['website_id'] },
  get_my_hosted_sites: { required: [], properties: [] },
  create_website_page: {
    required: ['website_id', 'title', 'slug', 'post_type'],
    properties: ['website_id', 'title', 'slug', 'post_type', 'excerpt', 'published', 'blocks'],
  },
  publish_page: { required: ['post_id', 'published'], properties: ['post_id', 'published'] },
  create_website_category: {
    required: ['website_id', 'name', 'slug'],
    properties: ['website_id', 'name', 'slug', 'description'],
  },
  create_website_tag: {
    required: ['website_id', 'name', 'slug'],
    properties: ['website_id', 'name', 'slug'],
  },
  get_page_content: { required: ['post_id'], properties: ['post_id'] },
  update_page_blocks: { required: ['post_id', 'blocks'], properties: ['post_id', 'blocks'] },
  update_block_by_id: {
    required: ['post_id', 'block_id', 'updates'],
    properties: ['post_id', 'block_id', 'updates'],
  },
  update_page_metadata: {
    required: ['post_id'],
    properties: ['post_id', 'title', 'slug', 'excerpt', 'post_type'],
  },

  // Email Marketing
  get_my_email_campaigns: { required: [], properties: [] },
  get_my_email_lists: { required: [], properties: [] },
  create_email_campaign: {
    required: ['name', 'subject', 'from_name', 'from_email', 'list_id', 'html_content'],
    properties: ['name', 'subject', 'preview_text', 'from_name', 'from_email', 'list_id', 'html_content'],
  },
  update_email_campaign: {
    required: ['campaign_id'],
    properties: ['campaign_id', 'name', 'subject', 'preview_text', 'from_name', 'from_email', 'html_content'],
  },
  get_email_campaign_details: { required: ['campaign_id'], properties: ['campaign_id'] },
  add_email_subscriber: {
    required: ['list_id', 'email'],
    properties: ['list_id', 'email', 'name'],
  },
  get_email_segments: { required: [], properties: [] },
  create_email_segment: {
    required: ['name'],
    properties: ['name', 'description', 'rules', 'match_type'],
  },

  // Pitch Decks
  get_my_pitch_decks: { required: [], properties: [] },
  create_pitch_deck: { required: ['title'], properties: ['title', 'description'] },
  get_pitch_deck_slides: { required: ['deck_id'], properties: ['deck_id'] },
  update_pitch_deck_slide: {
    required: ['deck_id', 'slide_index', 'updates'],
    properties: ['deck_id', 'slide_index', 'updates'],
  },

  // Booking Pages
  get_my_booking_pages: { required: [], properties: [] },
  get_bookings_for_page: { required: ['booking_page_id'], properties: ['booking_page_id'] },
  create_booking_page: {
    required: ['title', 'slug'],
    properties: ['title', 'slug', 'description', 'duration'],
  },
  update_booking_page: {
    required: ['booking_page_id'],
    properties: ['booking_page_id', 'title', 'description', 'duration', 'active'],
  },

  // Suggested Projects / Service Requests
  get_suggested_projects: { required: [], properties: [] },
  request_suggested_project: {
    required: ['suggested_project_id'],
    properties: ['suggested_project_id', 'message'],
  },

  // Team & Profile
  get_my_team: { required: [], properties: [] },
  invite_team_member: { required: ['name', 'email', 'role'], properties: ['name', 'email', 'role'] },
  get_my_profile: { required: [], properties: [] },
  update_profile: {
    required: [],
    properties: ['name', 'company', 'phone', 'website', 'address'],
  },

  // Navigation
  navigate_to: { required: ['path'], properties: ['path', 'section', 'message'] },

  // CRM Contacts/Companies/Deals/Activities/Pipelines
  get_crm_contacts: { required: [], properties: ['search', 'status', 'limit'] },
  get_crm_contact_detail: { required: ['contact_id'], properties: ['contact_id'] },
  get_crm_companies: { required: [], properties: ['search'] },
  get_crm_deals: { required: [], properties: ['status', 'pipeline_id'] },
  get_crm_pipelines: { required: [], properties: [] },
  get_crm_activities: {
    required: [],
    properties: ['contact_id', 'deal_id', 'limit'],
  },
  create_crm_contact: {
    required: ['first_name'],
    properties: ['first_name', 'last_name', 'email', 'phone', 'title', 'company_id', 'source', 'status', 'notes'],
  },
  update_crm_contact: {
    required: ['contact_id'],
    properties: ['contact_id', 'first_name', 'last_name', 'email', 'phone', 'title', 'company_id', 'status', 'notes'],
  },
  create_crm_company: {
    required: ['name'],
    properties: ['name', 'domain', 'industry', 'size', 'phone', 'notes'],
  },
  create_crm_deal: {
    required: ['title'],
    properties: ['title', 'value', 'pipeline_id', 'stage_id', 'contact_id', 'company_id', 'priority', 'expected_close_date', 'notes'],
  },
  update_crm_deal: {
    required: ['deal_id'],
    properties: ['deal_id', 'title', 'value', 'stage_id', 'status', 'priority', 'expected_close_date', 'notes'],
  },
  log_crm_activity: {
    required: ['type', 'title'],
    properties: ['type', 'title', 'description', 'contact_id', 'deal_id'],
  },

  // Surveys
  get_my_surveys: { required: [], properties: [] },
  get_survey_details: { required: ['survey_id'], properties: ['survey_id'] },
  create_survey: { required: ['title'], properties: ['title', 'description', 'fields'] },
  update_survey: {
    required: ['survey_id'],
    properties: ['survey_id', 'title', 'description', 'status', 'fields'],
  },

  // CRM Proposals
  get_crm_proposals: { required: [], properties: ['status', 'deal_id'] },
  create_crm_proposal: {
    required: ['title'],
    properties: ['title', 'contact_id', 'company_id', 'deal_id', 'summary', 'line_items', 'valid_until'],
  },
  send_crm_proposal: { required: ['proposal_id'], properties: ['proposal_id'] },

  // Automations
  get_my_automations: { required: [], properties: [] },
  create_automation: {
    required: ['name', 'trigger', 'actions'],
    properties: ['name', 'description', 'trigger', 'conditions', 'actions'],
  },
  toggle_automation: { required: ['rule_id', 'enabled'], properties: ['rule_id', 'enabled'] },
};

describe('@/lib/ai/portal-tools — public API surface', () => {
  it('exports exactly the expected symbols (no surprise additions/removals)', () => {
    const actual = Object.keys(portalTools).sort();
    const expected = [...EXPECTED_EXPORTS].sort();
    expect(actual).toEqual(expected);
  });

  it('PORTAL_TOOLS is a non-empty array of Anthropic.Tool entries', () => {
    expect(Array.isArray(portalTools.PORTAL_TOOLS)).toBe(true);
    expect(portalTools.PORTAL_TOOLS.length).toBeGreaterThan(0);
    for (const tool of portalTools.PORTAL_TOOLS) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.input_schema).toBeTruthy();
    }
  });

  it('executePortalTool has arity 5 (name, input, clientId, userId, ctx?)', () => {
    expect(typeof portalTools.executePortalTool).toBe('function');
    // 5th param `ctx?` (audit/scope context: source + ruleId) is optional but
    // still counts toward Function.length since it carries no default value.
    expect(portalTools.executePortalTool.length).toBe(5);
  });

  it('PORTAL_TOOLS entries have unique tool names', () => {
    const names = portalTools.PORTAL_TOOLS.map(t => t.name);
    const dedup = new Set(names);
    expect(dedup.size).toBe(names.length);
  });

  it('PORTAL_TOOLS exposes exactly the tool names locked in EXPECTED_TOOL_REGISTRY', () => {
    const actualNames = portalTools.PORTAL_TOOLS.map(t => t.name).sort();
    const expectedNames = Object.keys(EXPECTED_TOOL_REGISTRY).sort();
    expect(actualNames).toEqual(expectedNames);
  });
});

describe('@/lib/ai/portal-tools — tool input_schema parity', () => {
  const toolByName = new Map<string, (typeof portalTools.PORTAL_TOOLS)[number]>();
  for (const t of portalTools.PORTAL_TOOLS) toolByName.set(t.name, t);

  for (const [name, expected] of Object.entries(EXPECTED_TOOL_REGISTRY)) {
    it(`${name} matches the locked schema shape`, () => {
      const tool = toolByName.get(name);
      expect(tool, `tool "${name}" missing from PORTAL_TOOLS`).toBeDefined();

      const schema = tool!.input_schema as { type?: string; properties?: Record<string, unknown>; required?: string[] };
      expect(schema.type).toBe('object');

      const props = schema.properties ? Object.keys(schema.properties) : [];
      expect(props.sort(), `${name}.properties keys`).toEqual([...expected.properties].sort());

      const required = schema.required ?? [];
      expect([...required].sort(), `${name}.required`).toEqual([...expected.required].sort());
    });
  }
});
