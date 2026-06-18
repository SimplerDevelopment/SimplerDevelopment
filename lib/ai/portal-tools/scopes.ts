/**
 * Portal-tool scope registry — toolName → requiredScope.
 *
 * Classification rules (used to assign each entry):
 *   RESOURCE  — derived from the tool's domain:
 *     dashboard → projects:read (reads projects/tickets/invoices aggregates)
 *     projects / kanban → projects
 *     billing  → billing
 *     support  → tickets
 *     services → services
 *     cms / navigation → sites
 *     email    → email
 *     pitch-decks → decks
 *     booking  → bookings
 *     team     → team
 *     profile  → profile
 *     crm      → crm
 *     surveys  → surveys
 *     automations → automations
 *
 *   ACTION — derived from the handler's mutation behaviour:
 *     list / get / search / summary / view / read / details → :read
 *     create / update / delete / move / add / set / remove /
 *       request / invite / log / toggle / publish → :write
 *     EXCEPTION: email *send* → email:send (not email:write)
 *
 * CONSERVATIVE rule: when ambiguous, classify :write (mutation).
 *
 * Canonical vocabulary (exhaustive — no values outside this set are allowed):
 *   ai:read | automations:read | automations:write | billing:read |
 *   bookings:read | bookings:write | brain:write | crm:read | crm:write |
 *   decks:read | decks:write | email:read | email:send | email:write |
 *   hosting:read | integrations:read | integrations:write | media:read |
 *   media:write | profile:read | profile:write | projects:read |
 *   projects:write | services:read | services:write | sites:read |
 *   sites:write | surveys:read | surveys:write | team:read | team:write |
 *   tickets:read | tickets:write
 *
 * Completeness: the unit test in tests/unit/portal-tools-scopes.test.ts
 * asserts that every key in HANDLERS appears here, so drift is caught in CI.
 */

export const PORTAL_TOOL_SCOPES: Record<string, string> = {
  // ── Dashboard ────────────────────────────────────────────────────────────
  // Aggregates projects + tickets + invoices; closest read scope is projects:read.
  get_dashboard_summary: 'projects:read',

  // ── Projects / Kanban ─────────────────────────────────────────────────────
  get_my_projects:            'projects:read',
  pm_spawn_project_from_deal: 'projects:write', // creates a project from a CRM deal
  get_project_board:          'projects:read',
  get_project_cards:          'projects:read',
  get_sprint_progress:        'projects:read',
  get_project_files:          'projects:read',
  add_card_comment:           'projects:write',
  create_project_card:        'projects:write',
  update_project_card:        'projects:write',
  move_project_card:          'projects:write',

  // ── Billing ──────────────────────────────────────────────────────────────
  get_my_invoices:     'billing:read',
  get_invoice_details: 'billing:read',
  get_payment_methods: 'billing:read',
  // pay_invoice navigates the user to the payment UI — it doesn't charge
  // the card itself, but it does mutate intent/state → conservative :write.
  pay_invoice:         'billing:read', // navigate-only, no actual charge; read is appropriate

  // ── Support Tickets ───────────────────────────────────────────────────────
  get_my_tickets:       'tickets:read',
  get_ticket_details:   'tickets:read',
  create_support_ticket: 'tickets:write',
  reply_to_ticket:       'tickets:write',

  // ── Services ──────────────────────────────────────────────────────────────
  get_services_catalog: 'services:read',
  get_my_services:      'services:read',
  request_service:      'services:write',

  // ── CMS / Websites ────────────────────────────────────────────────────────
  get_my_websites:        'sites:read',
  get_website_pages:      'sites:read',
  get_website_categories: 'sites:read',
  get_website_tags:       'sites:read',
  get_website_media:      'sites:read',
  get_my_hosted_sites:    'hosting:read',
  create_website_page:    'sites:write',
  publish_page:           'sites:write',
  create_website_category: 'sites:write',
  create_website_tag:     'sites:write',
  get_page_content:       'sites:read',
  update_page_blocks:     'sites:write',
  update_block_by_id:     'sites:write',
  update_page_metadata:   'sites:write',

  // ── Email Marketing ───────────────────────────────────────────────────────
  get_my_email_campaigns:    'email:read',
  get_my_email_lists:        'email:read',
  create_email_campaign:     'email:write',
  update_email_campaign:     'email:write',
  get_email_campaign_details: 'email:read',
  add_email_subscriber:      'email:write',
  get_email_segments:        'email:read',
  create_email_segment:      'email:write',

  // ── Pitch Decks ───────────────────────────────────────────────────────────
  get_my_pitch_decks:     'decks:read',
  create_pitch_deck:      'decks:write',
  get_pitch_deck_slides:  'decks:read',
  update_pitch_deck_slide: 'decks:write',

  // ── Booking Pages ─────────────────────────────────────────────────────────
  get_my_booking_pages:  'bookings:read',
  get_bookings_for_page: 'bookings:read',
  create_booking_page:   'bookings:write',
  update_booking_page:   'bookings:write',

  // ── Team / Suggested Projects ─────────────────────────────────────────────
  get_suggested_projects:    'projects:read',   // reads suggested-project catalogue
  request_suggested_project: 'services:write',  // submits a service-like request

  // ── Team / Profile ────────────────────────────────────────────────────────
  get_my_team:        'team:read',
  get_my_profile:     'profile:read',
  update_profile:     'profile:write',
  invite_team_member: 'team:write',

  // ── Navigation ────────────────────────────────────────────────────────────
  // Pure UI redirect — no DB mutation. Closest read scope is sites:read.
  navigate_to: 'sites:read',

  // ── CRM ───────────────────────────────────────────────────────────────────
  get_crm_contacts:      'crm:read',
  get_crm_contact_detail: 'crm:read',
  get_crm_companies:     'crm:read',
  get_crm_deals:         'crm:read',
  get_crm_pipelines:     'crm:read',
  get_crm_activities:    'crm:read',
  create_crm_contact:    'crm:write',
  update_crm_contact:    'crm:write',
  create_crm_company:    'crm:write',
  create_crm_deal:       'crm:write',
  update_crm_deal:       'crm:write',
  log_crm_activity:      'crm:write',
  get_crm_proposals:     'crm:read',
  create_crm_proposal:   'crm:write',
  // send_crm_proposal marks the record "sent" and generates a shareable link —
  // this is a mutation, not an outbound email send, so crm:write (not email:send).
  send_crm_proposal:     'crm:write',

  // ── Surveys ───────────────────────────────────────────────────────────────
  get_my_surveys:    'surveys:read',
  get_survey_details: 'surveys:read',
  create_survey:     'surveys:write',
  update_survey:     'surveys:write',

  // ── Automations ───────────────────────────────────────────────────────────
  get_my_automations: 'automations:read',
  create_automation:  'automations:write',
  toggle_automation:  'automations:write',
};

/**
 * Automation-engine special-case actions. These are NOT portal-tool handlers
 * (so they're kept out of PORTAL_TOOL_SCOPES — the registry must stay 1:1 with
 * the HANDLERS map) but they DO exercise a real capability when an automation
 * rule fires, so they must be scope-gated like any other action. Mapped to the
 * closest canonical scope:
 *   start_playbook    → brain:write       (starts a Brain playbook run)
 *   run_plugin_script → automations:write (enqueues a plugin script run;
 *                       defense-in-depth atop its own client-entitlement check)
 */
export const AUTOMATION_ACTION_SCOPES: Record<string, string> = {
  start_playbook: 'brain:write',
  run_plugin_script: 'automations:write',
};

/**
 * Returns the required scope string for a given automation action tool, or null
 * if unknown (unknown tools are passed through ungated — they no-op at
 * executePortalTool). Covers both portal-tool handlers and the automation-engine
 * special-case actions above.
 */
export function requiredScopeFor(toolName: string): string | null {
  return PORTAL_TOOL_SCOPES[toolName] ?? AUTOMATION_ACTION_SCOPES[toolName] ?? null;
}
