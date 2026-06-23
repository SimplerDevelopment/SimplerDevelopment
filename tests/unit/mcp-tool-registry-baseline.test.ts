/**
 * MCP tool-registry baseline.
 *
 * Locks in the exact set of tool names that buildMcpServer() registers when a
 * full-access ('*') key is presented, plus the scope-filter behaviour for
 * narrowly-scoped keys. This is the safety harness for the lib/mcp/server.ts
 * refactor — every tool name, scope guard, and minimum config field must
 * survive the move from the monolith into per-domain tool modules.
 *
 * Unit-layer on purpose: the registry assertion only builds the server and reads
 * tool NAMES (handlers never run), so it needs no DB — `@/lib/db` is mocked to
 * dodge its import-time DATABASE_URL throw. Living in tests/unit/ means it runs
 * in the DEFAULT gate, so tool drift fails on every commit (it previously sat in
 * the integration layer, out of the default gate, and drifted red unseen — 131 tools).
 *
 * @critical
 */
import { describe, it, expect, vi } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// Mock @/lib/auth before the @/lib/mcp/server import chain reaches it via
// portal-auth → @/lib/auth → next-auth. We never call any of these tools so
// the auth module's actual behaviour is irrelevant for the registry assertion.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
// brain adapter eagerly fires getOrCreateBrainProfile() at registration time;
// the per-worker test schema does not migrate brain_profiles, which would
// raise an unhandled rejection. The promise is fire-and-forget so a no-op
// stub keeps the registry assertion clean without changing what gets
// registered.
vi.mock('@/lib/brain/profiles', () => ({
  getOrCreateBrainProfile: vi.fn(async () => ({ id: 1, clientId: 1 })),
  getBrainProfile: vi.fn(async () => ({ id: 1, clientId: 1 })),
}));
// `@/lib/db` throws at import if DATABASE_URL is unset (lib/db/index.ts). Tool
// handlers reference `db` but never execute here (we only read registered NAMES),
// so a no-op stub lets this run DB-free in the unit gate.
vi.mock('@/lib/db', () => ({ db: {} }));

import { buildMcpServer } from '@/lib/mcp/server';

// Stable list of every tool that should register under '*' scope. Built from
// the baseline state of lib/mcp/server.ts + the per-feature MCP adapters
// (branding, storefront, brain, post-types, approvals). Ordering does not
// matter — the assertion is on set membership.
const EXPECTED_TOOLS: readonly string[] = [
  // ── ai ──
  'ai_conversations_get',
  'ai_conversations_list',
  'ai_credits_balance',
  'ai_credits_ledger',
  // ── approvals ──
  'approvals_approve',
  'approvals_get',
  'approvals_list',
  'approvals_reject',
  // ── automations ──
  'automations_create',
  'automations_delete',
  'automations_list',
  'automations_toggle',
  'automations_update',
  // ── block ──
  'block_templates_create',
  'block_templates_delete',
  'block_templates_fork',
  'block_templates_get',
  'block_templates_list',
  'block_templates_publish',
  'block_templates_update',
  // ── booking ──
  'booking_pages_create',
  'booking_pages_get',
  'booking_pages_list',
  'booking_pages_update',
  // ── bookings ──
  'bookings_cancel',
  'bookings_get',
  'bookings_list',
  'bookings_update',
  // ── brain ──
  'brain_apply_classifications',
  'brain_approve_review_item',
  'brain_bulk_update_notes',
  'brain_classify_notes',
  'brain_create_meeting',
  'brain_create_note',
  'brain_create_note_from_template',
  'brain_create_note_template',
  'brain_create_relationship',
  'brain_create_saved_search',
  'brain_create_task',
  'brain_dashboard_summary',
  'brain_decisions_create',
  'brain_decisions_get',
  'brain_decisions_list',
  'brain_decisions_reject',
  'brain_decisions_supersede',
  'brain_decisions_update',
  'brain_delete_note',
  'brain_delete_note_template',
  'brain_delete_saved_search',
  'brain_document_acknowledgments_list_for_document',
  'brain_document_acknowledgments_list_for_person',
  'brain_document_compliance_report',
  'brain_document_required_reads_assign',
  'brain_document_required_reads_list_for_document',
  'brain_document_required_reads_list_for_person',
  'brain_document_required_reads_remove',
  'brain_document_versions_edit_draft',
  'brain_document_versions_get',
  'brain_document_versions_list',
  'brain_documents_acknowledge',
  'brain_documents_archive',
  'brain_documents_create',
  'brain_documents_delete',
  'brain_documents_get',
  'brain_documents_link',
  'brain_documents_list',
  'brain_documents_promote_from_note',
  'brain_documents_publish',
  'brain_documents_unarchive',
  'brain_documents_unlink',
  'brain_documents_update',
  'brain_expertise_tags_create',
  'brain_expertise_tags_delete',
  'brain_expertise_tags_list',
  'brain_expertise_tags_merge',
  'brain_expertise_tags_update',
  'brain_get_company',
  'brain_get_contact',
  'brain_get_deal',
  'brain_get_meeting',
  'brain_get_note',
  'brain_get_note_template',
  'brain_get_post',
  'brain_get_relationship',
  'brain_get_review_item',
  'brain_get_saved_search',
  'brain_get_task',
  'brain_glossary_bulk_import',
  'brain_glossary_create',
  'brain_glossary_delete',
  'brain_glossary_get',
  'brain_glossary_list',
  'brain_glossary_lookup',
  'brain_glossary_update',
  'brain_goals_checkin',
  'brain_goals_create',
  'brain_goals_delete',
  'brain_goals_get',
  'brain_goals_list',
  'brain_goals_update',
  'brain_initiatives_close',
  'brain_initiatives_create',
  'brain_initiatives_get',
  'brain_initiatives_link',
  'brain_initiatives_links',
  'brain_initiatives_list',
  'brain_initiatives_reopen',
  'brain_initiatives_unlink',
  'brain_initiatives_update',
  'brain_link_meeting',
  'brain_list_companies',
  'brain_list_contacts',
  'brain_list_deals',
  'brain_list_meetings',
  'brain_list_note_history',
  'brain_list_note_templates',
  'brain_list_notes',
  'brain_list_posts',
  'brain_list_relationships',
  'brain_list_review_items',
  'brain_list_saved_searches',
  'brain_list_tasks',
  'brain_org_units_add_member',
  'brain_org_units_create',
  'brain_org_units_delete',
  'brain_org_units_get',
  'brain_org_units_list',
  'brain_org_units_merge',
  'brain_org_units_move',
  'brain_org_units_remove_member',
  'brain_org_units_set_primary',
  'brain_org_units_tree',
  'brain_org_units_update',
  'brain_people_attach_expertise',
  'brain_people_create',
  'brain_people_delete',
  'brain_people_detach_expertise',
  'brain_people_get',
  'brain_people_list',
  'brain_people_update',
  'brain_playbook_run_steps_complete',
  'brain_playbook_run_steps_skip',
  'brain_playbook_runs_abort',
  'brain_playbook_runs_active_for_entity',
  'brain_playbook_runs_advance',
  'brain_playbook_runs_get',
  'brain_playbook_runs_list',
  'brain_playbook_runs_start',
  'brain_playbooks_activate',
  'brain_playbooks_add_step',
  'brain_playbooks_archive',
  'brain_playbooks_create',
  'brain_playbooks_delete',
  'brain_playbooks_get',
  'brain_playbooks_list',
  'brain_playbooks_remove_step',
  'brain_playbooks_reorder_steps',
  'brain_playbooks_update',
  'brain_playbooks_update_step',
  'brain_propose_task',
  'brain_reject_review_item',
  'brain_restore_note',
  'brain_review_items_list_for_reviewer',
  'brain_review_items_suggest_reviewer',
  'brain_search',
  'brain_topics_attach',
  'brain_topics_create',
  'brain_topics_delete',
  'brain_topics_detach',
  'brain_topics_entities',
  'brain_topics_get',
  'brain_topics_import_from_tags',
  'brain_topics_list',
  'brain_topics_merge',
  'brain_topics_move',
  'brain_topics_tree',
  'brain_topics_update',
  'brain_update_note',
  'brain_update_note_template',
  'brain_update_relationship',
  'brain_update_saved_search',
  'brain_update_task',
  'brain_upsert_note_by_url',
  'brain_who_knows',
  // ── branding ──
  'branding_audit',
  'branding_check_contrast',
  'branding_create_profile',
  'branding_delete_profile',
  'branding_get_messaging',
  'branding_get_profile',
  'branding_list_profiles',
  'branding_update_messaging',
  'branding_update_profile',
  // ── chat ──
  'chat_conversations_get',
  'chat_conversations_list',
  'chat_conversation_reply',
  'chat_conversation_update',
  'chat_widgets_list',
  // ── client ──
  'client_get',
  'client_update',
  // ── contracts ──
  'contracts_create',
  'contracts_get',
  'contracts_list',
  'contracts_void',
  // ── crm ──
  'crm_activities_create',
  'crm_activities_list',
  'crm_companies_create',
  'crm_companies_search',
  'crm_companies_update',
  'crm_contacts_create',
  'crm_contacts_search',
  'crm_contacts_update',
  'crm_custom_field_values_get',
  'crm_custom_field_values_set',
  'crm_custom_fields_create',
  'crm_custom_fields_delete',
  'crm_custom_fields_list',
  'crm_custom_fields_update',
  'crm_deal_artifact_link',
  'crm_deal_artifact_toggle_pin',
  'crm_deal_artifact_unlink',
  'crm_deal_artifacts_list',
  'crm_deal_comments_create',
  'crm_deal_comments_delete',
  'crm_deal_comments_list',
  'crm_deals_create',
  'crm_deals_delete',
  'crm_deals_get',
  'crm_deals_list',
  'crm_deals_move_stage',
  'crm_deals_update',
  'crm_pipelines_add_stage',
  'crm_pipelines_create',
  'crm_pipelines_list',
  'crm_pipelines_update',
  'crm_pipelines_update_stage',
  'crm_saved_views_list',
  'crm_scoring_rules_list',
  // ── decks ──
  'decks_add_slide',
  'decks_create',
  'decks_delete',
  'decks_fork',
  'decks_get',
  'decks_list',
  'decks_publish_all',
  'decks_publish_slide',
  'decks_replace_slides',
  'decks_update',
  'decks_upload_html',
  'decks_upload_html_zip',
  // ── email ──
  'email_campaigns_create',
  'email_campaigns_delete',
  'email_campaigns_fork',
  'email_campaigns_list',
  'email_campaigns_schedule',
  'email_campaigns_send',
  'email_campaigns_update',
  'email_lists',
  'email_lists_create',
  'email_lists_delete',
  'email_lists_update',
  'email_segments_create',
  'email_segments_list',
  'email_subscribers_add',
  'email_subscribers_list',
  'email_subscribers_remove',
  'email_subscribers_update',
  'email_templates_create',
  'email_templates_list',
  // ── gift ──
  'gift_certificates_issue',
  'gift_certificates_list',
  // ── hosting ──
  'hosting_get',
  'hosting_list',
  // ── integrations ──
  'integrations_list',
  'integrations_revoke',
  // ── invoices ──
  'invoices_get',
  'invoices_list',
  // ── usage ──
  'usage_get',
  // ── kanban ──
  'kanban_card_add_blocker',
  'kanban_card_add_comment',
  'kanban_card_artifact_link',
  'kanban_card_artifact_toggle_pin',
  'kanban_card_artifact_unlink',
  'kanban_card_artifacts_list',
  'kanban_card_assign',
  'kanban_card_assignees_list',
  'kanban_card_attach_file_from_url',
  'kanban_card_attach_label',
  'kanban_card_dependencies_list',
  'kanban_card_detach_label',
  'kanban_card_list_comments',
  'kanban_card_log_time',
  'kanban_card_remove_blocker',
  'kanban_card_templates_create',
  'kanban_card_templates_delete',
  'kanban_card_templates_list',
  'kanban_card_unassign',
  'kanban_checklist_add',
  'kanban_checklist_delete',
  'kanban_checklist_list',
  'kanban_checklist_update',
  'kanban_create_card',
  'kanban_create_column',
  'kanban_delete_card',
  'kanban_delete_column',
  'kanban_labels_create',
  'kanban_labels_delete',
  'kanban_labels_list',
  'kanban_labels_update',
  'kanban_list_board',
  'kanban_move_card',
  'kanban_propose_sprint',
  'kanban_recurrences_create',
  'kanban_recurrences_delete',
  'kanban_recurrences_list',
  'kanban_update_card',
  'kanban_update_column',
  // ── media ──
  'media_delete',
  'media_list',
  'media_register',
  'media_upload_from_url',
  'media_upload_presign',
  // ── my ──
  'my_tasks_list',
  // ── nav ──
  'nav_create',
  'nav_delete',
  'nav_list',
  'nav_publish',
  'nav_publish_all',
  'nav_update',
  // ── notifications ──
  'notifications_list',
  'notifications_mark_read',
  // ── post ──
  'post_types_create',
  'post_types_delete',
  'post_types_fields_create',
  'post_types_fields_delete',
  'post_types_fields_list',
  'post_types_fields_update',
  'post_types_get',
  'post_types_get_code',
  'post_types_get_template',
  'post_types_list',
  'post_types_update',
  'post_types_update_code',
  'post_types_update_template',
  // ── posts ──
  'posts_create',
  'posts_delete',
  'posts_fork',
  'posts_get',
  'posts_list',
  'posts_list_revisions',
  'posts_set_taxonomies',
  'posts_update',
  'posts_upload_html',
  'posts_upload_html_zip',
  // ── profile ──
  'profile_get',
  'profile_update',
  // ── project ──
  'project_members_list',
  'project_members_remove',
  'project_members_set',
  // ── projects ──
  'projects_artifact_link',
  'projects_artifact_toggle_pin',
  'projects_artifact_unlink',
  'projects_artifacts_list',
  'projects_create',
  'projects_list',
  'projects_propose_artifact_link',
  'projects_update',
  // ── proposals ──
  'proposals_create',
  'proposals_get',
  'proposals_list',
  'proposals_send',
  'proposals_update',
  // ── service ──
  'service_catalog_list',
  'service_requests_create',
  'service_requests_list',
  // ── sites ──
  'sites_get_custom_code',
  'sites_list',
  'sites_publish_custom_code',
  'sites_update',
  'sites_update_custom_code',
  // ── sprints ──
  'sprints_create',
  'sprints_delete',
  'sprints_list',
  'sprints_update',
  // ── store ──
  'store_categories_create',
  'store_categories_list',
  'store_customer_messages_list',
  'store_customer_messages_reply',
  'store_customers_get',
  'store_customers_list',
  'store_discounts_create',
  'store_discounts_delete',
  'store_discounts_list',
  'store_discounts_toggle',
  'store_orders_add_note',
  'store_orders_get',
  'store_orders_list',
  'store_orders_update_status',
  'store_product_option_values_create',
  'store_product_options_create',
  'store_product_variants_create',
  'store_product_variants_update',
  'store_products_adjust_inventory',
  'store_products_create',
  'store_products_delete',
  'store_products_get',
  'store_products_list',
  'store_products_update',
  'store_reviews_list',
  'store_reviews_moderate',
  'store_settings_get',
  // ── suggested ──
  'suggested_project_requests_create',
  'suggested_projects_list',
  // ── surveys ──
  'surveys_create',
  'surveys_fork',
  'surveys_get',
  'surveys_list',
  'surveys_list_responses',
  'surveys_submit_response',
  'surveys_update',
  // ── taxonomies ──
  'taxonomies_create_category',
  'taxonomies_create_tag',
  'taxonomies_list',
  // ── team ──
  'team_invite',
  'team_list_members',
  'team_remove_member',
  'team_update_role',
  // ── tickets ──
  'tickets_attach_file_from_url',
  'tickets_create',
  'tickets_get',
  'tickets_list',
  'tickets_reply',
  'tickets_update',
  // ── website ──
  'website_domains_add',
  'website_domains_list',
  'website_domains_remove',
  'website_env_vars_delete',
  'website_env_vars_list',
  'website_env_vars_set',
  // ── whoami ──
  'whoami',
  // ── workflow guides (unscoped — static guided-content, no tenant data) ──
  'list_workflows',
  'get_workflow',
];

/**
 * Stable list of every resource URI buildMcpServer() registers under '*'.
 * Resources are read-only context docs (see lib/mcp/tools/resources.ts) and
 * drift the same way tools do — lock the URI set here too.
 *   - blocks://schema, portal://capabilities — unscoped, always registered
 *   - brand://default — gated on branding:read
 *   - catalog://services — gated on services:read
 */
const EXPECTED_RESOURCES: readonly string[] = [
  'blocks://schema',
  'brand://default',
  'catalog://services',
  'portal://capabilities',
];

/**
 * Stable list of every prompt name buildMcpServer() registers under '*'.
 * Prompts are user-triggered guided workflows (see lib/mcp/tools/prompts.ts),
 * each gated on a representative scope. Lock the name set so drift fails red.
 *   - draft-page     — gated on sites:write
 *   - triage-tickets — gated on tickets:read
 *   - weekly-digest  — gated on projects:read
 */
const EXPECTED_PROMPTS: readonly string[] = [
  'draft-page',
  'triage-tickets',
  'weekly-digest',
];

/** Build a fake context with a chosen scope set. Doesn't hit the DB. */
function makeCtx(scopes: string[]): PortalMcpContext {
  return {
    userId: 1,
    keyId: 1,
    scopes,
    // Minimal client shape that the constructor's `instructions` template uses.
    // Real DB queries from tool handlers are never invoked in this spec — we
    // only introspect the registered tool registry.
    client: {
      id: 1,
      company: 'Baseline Test Co',
    } as PortalMcpContext['client'],
  };
}

/**
 * Reach into McpServer's private `_registeredTools` to introspect what was
 * registered without invoking transport. The shape is `Record<string,
 * RegisteredTool>` where each value carries `description`, `inputSchema`,
 * `callback`, etc. Documented in node_modules/@modelcontextprotocol/sdk
 * but not part of the public API — the assertion is therefore stricter than
 * a tools/list round-trip and catches drift even before the transport is
 * stood up.
 */
function getRegisteredTools(server: unknown): Record<string, {
  description?: string;
  title?: string;
  inputSchema?: unknown;
  handler: (...args: unknown[]) => unknown;
}> {
  return (server as { _registeredTools: Record<string, {
    description?: string;
    title?: string;
    inputSchema?: unknown;
    handler: (...args: unknown[]) => unknown;
  }> })._registeredTools;
}

/**
 * Reach into McpServer's private `_registeredResources` — a `Record<uri,
 * RegisteredResource>` where each value carries `name`, `metadata` (the
 * config), and `readCallback`. Same introspection approach as the tool
 * registry: stricter than a resources/list round-trip and catches drift before
 * the transport is stood up.
 */
function getRegisteredResources(server: unknown): Record<string, {
  name?: string;
  title?: string;
  metadata?: { title?: string; description?: string };
  readCallback: (...args: unknown[]) => unknown;
}> {
  return (server as { _registeredResources: Record<string, {
    name?: string;
    title?: string;
    metadata?: { title?: string; description?: string };
    readCallback: (...args: unknown[]) => unknown;
  }> })._registeredResources;
}

/**
 * Reach into McpServer's private `_registeredPrompts` — a `Record<name,
 * RegisteredPrompt>` carrying `title`, `description`, `argsSchema`, `callback`.
 */
function getRegisteredPrompts(server: unknown): Record<string, {
  title?: string;
  description?: string;
  callback: (...args: unknown[]) => unknown;
}> {
  return (server as { _registeredPrompts: Record<string, {
    title?: string;
    description?: string;
    callback: (...args: unknown[]) => unknown;
  }> })._registeredPrompts;
}

describe('MCP tool registry — baseline @critical', () => {
  it('registers exactly the expected tool surface for full-access keys', () => {
    const server = buildMcpServer(makeCtx(['*']));
    const registry = getRegisteredTools(server);
    const actual = new Set(Object.keys(registry));
    const expected = new Set(EXPECTED_TOOLS);

    // Every expected tool must be present.
    const missing: string[] = [];
    for (const name of expected) if (!actual.has(name)) missing.push(name);

    // No surprise tools should appear.
    const extra: string[] = [];
    for (const name of actual) if (!expected.has(name)) extra.push(name);

    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
    // Sanity: the set is non-trivial.
    expect(actual.size).toBeGreaterThanOrEqual(EXPECTED_TOOLS.length);
  });

  it('every registered tool has a callable handler and a config object', () => {
    const server = buildMcpServer(makeCtx(['*']));
    const registry = getRegisteredTools(server);
    for (const [name, tool] of Object.entries(registry)) {
      expect(typeof tool.handler, `tool ${name} missing handler`).toBe('function');
      // description and/or title is set on every tool we register.
      expect(
        typeof tool.description === 'string' || typeof tool.title === 'string',
        `tool ${name} missing description/title`,
      ).toBe(true);
    }
  });

  it('crm:read-only key sees crm reads but not crm writes nor off-domain tools', () => {
    const server = buildMcpServer(makeCtx(['crm:read']));
    const registry = getRegisteredTools(server);
    const names = new Set(Object.keys(registry));

    // crm reads visible
    expect(names.has('crm_contacts_search')).toBe(true);
    expect(names.has('crm_deals_list')).toBe(true);
    expect(names.has('crm_pipelines_list')).toBe(true);
    // crm writes hidden
    expect(names.has('crm_contacts_create')).toBe(false);
    expect(names.has('crm_deals_create')).toBe(false);
    // off-domain tools hidden
    expect(names.has('projects_create')).toBe(false);
    expect(names.has('posts_create')).toBe(false);
    expect(names.has('approvals_approve')).toBe(false);
    // whoami is unscoped — always visible
    expect(names.has('whoami')).toBe(true);
  });

  it('approvals:manage key sees the approvals surface; an unrelated key does not', () => {
    const withApprovals = getRegisteredTools(
      buildMcpServer(makeCtx(['approvals:read', 'approvals:manage'])),
    );
    const withoutApprovals = getRegisteredTools(buildMcpServer(makeCtx(['crm:read'])));

    expect(Object.keys(withApprovals)).toContain('approvals_list');
    expect(Object.keys(withApprovals)).toContain('approvals_approve');
    expect(Object.keys(withoutApprovals)).not.toContain('approvals_list');
    expect(Object.keys(withoutApprovals)).not.toContain('approvals_approve');
  });

  it('an empty-scope key sees only the unscoped meta + workflow-guide tools', () => {
    const server = buildMcpServer(makeCtx([]));
    const names = Object.keys(getRegisteredTools(server));
    // whoami + the workflow guides (list_workflows / get_workflow) are the only
    // unscoped tools — they carry no tenant data (static guided-content). Every
    // other registration is gated behind a `hasScope(ctx.scopes, ...)` guard.
    expect(names.sort()).toEqual(['get_workflow', 'list_workflows', 'whoami']);
  });

  it('narrower scope strictly trims the catalog (no new tool names)', () => {
    const fullNames = new Set(Object.keys(getRegisteredTools(buildMcpServer(makeCtx(['*'])))));
    const narrowNames = new Set(
      Object.keys(getRegisteredTools(buildMcpServer(makeCtx(['crm:read'])))),
    );
    expect(narrowNames.size).toBeLessThan(fullNames.size);
    // Every name visible to the narrow caller must also be visible to '*'.
    for (const n of narrowNames) {
      expect(fullNames.has(n), `narrow tool ${n} missing from full`).toBe(true);
    }
  });
});

describe('MCP resource registry — baseline @critical', () => {
  it('registers exactly the expected resource URIs for full-access keys', () => {
    const server = buildMcpServer(makeCtx(['*']));
    const actual = new Set(Object.keys(getRegisteredResources(server)));
    const expected = new Set(EXPECTED_RESOURCES);

    const missing = [...expected].filter((u) => !actual.has(u));
    const extra = [...actual].filter((u) => !expected.has(u));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('every registered resource has a read callback and a title/description', () => {
    const registry = getRegisteredResources(buildMcpServer(makeCtx(['*'])));
    for (const [uri, res] of Object.entries(registry)) {
      expect(typeof res.readCallback, `resource ${uri} missing readCallback`).toBe('function');
      const hasMeta = typeof res.metadata?.title === 'string' || typeof res.metadata?.description === 'string';
      expect(hasMeta, `resource ${uri} missing title/description`).toBe(true);
    }
  });

  it('an empty-scope key sees only the unscoped resources', () => {
    const uris = Object.keys(getRegisteredResources(buildMcpServer(makeCtx([])))).sort();
    // blocks://schema (static) and portal://capabilities (echoes own grant)
    // carry no tenant data and so register without a scope guard.
    expect(uris).toEqual(['blocks://schema', 'portal://capabilities']);
  });

  it('tenant-scoped resources appear only with their gating scope', () => {
    const branding = new Set(Object.keys(getRegisteredResources(buildMcpServer(makeCtx(['branding:read'])))));
    expect(branding.has('brand://default')).toBe(true);
    expect(branding.has('catalog://services')).toBe(false);

    const servicesScope = new Set(Object.keys(getRegisteredResources(buildMcpServer(makeCtx(['services:read'])))));
    expect(servicesScope.has('catalog://services')).toBe(true);
    expect(servicesScope.has('brand://default')).toBe(false);
  });
});

describe('MCP prompt registry — baseline @critical', () => {
  it('registers exactly the expected prompt names for full-access keys', () => {
    const actual = new Set(Object.keys(getRegisteredPrompts(buildMcpServer(makeCtx(['*'])))));
    const expected = new Set(EXPECTED_PROMPTS);

    const missing = [...expected].filter((n) => !actual.has(n));
    const extra = [...actual].filter((n) => !expected.has(n));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('every registered prompt has a callback and a title/description', () => {
    const registry = getRegisteredPrompts(buildMcpServer(makeCtx(['*'])));
    for (const [name, p] of Object.entries(registry)) {
      expect(typeof p.callback, `prompt ${name} missing callback`).toBe('function');
      const hasMeta = typeof p.title === 'string' || typeof p.description === 'string';
      expect(hasMeta, `prompt ${name} missing title/description`).toBe(true);
    }
  });

  it('an empty-scope key sees no prompts', () => {
    expect(Object.keys(getRegisteredPrompts(buildMcpServer(makeCtx([]))))).toEqual([]);
  });

  it('each prompt appears only with its gating scope', () => {
    const tickets = new Set(Object.keys(getRegisteredPrompts(buildMcpServer(makeCtx(['tickets:read'])))));
    expect(tickets.has('triage-tickets')).toBe(true);
    expect(tickets.has('draft-page')).toBe(false);
    expect(tickets.has('weekly-digest')).toBe(false);

    const sites = new Set(Object.keys(getRegisteredPrompts(buildMcpServer(makeCtx(['sites:write'])))));
    expect(sites.has('draft-page')).toBe(true);
    expect(sites.has('triage-tickets')).toBe(false);
  });
});
