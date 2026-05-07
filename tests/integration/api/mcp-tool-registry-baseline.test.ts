/**
 * MCP tool-registry baseline.
 *
 * Locks in the exact set of tool names that buildMcpServer() registers when a
 * full-access ('*') key is presented, plus the scope-filter behaviour for
 * narrowly-scoped keys. This is the safety harness for the lib/mcp/server.ts
 * refactor — every tool name, scope guard, and minimum config field must
 * survive the move from the monolith into per-domain tool modules.
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

import { buildMcpServer } from '@/lib/mcp/server';

// Stable list of every tool that should register under '*' scope. Built from
// the baseline state of lib/mcp/server.ts + the per-feature MCP adapters
// (branding, storefront, brain, post-types, approvals). Ordering does not
// matter — the assertion is on set membership.
const EXPECTED_TOOLS: readonly string[] = [
  // ── ai ──────────────────────────────────────────────────────────────
  'ai_conversations_get',
  'ai_conversations_list',
  // ── billing ─────────────────────────────────────────────────────────
  'ai_credits_balance',
  'ai_credits_ledger',
  'invoices_get',
  'invoices_list',
  // ── approvals ───────────────────────────────────────────────────────
  'approvals_approve',
  'approvals_get',
  'approvals_list',
  'approvals_reject',
  // ── automations ─────────────────────────────────────────────────────
  'automations_create',
  'automations_delete',
  'automations_list',
  'automations_toggle',
  'automations_update',
  // ── block templates ─────────────────────────────────────────────────
  'block_templates_create',
  'block_templates_delete',
  'block_templates_get',
  'block_templates_list',
  'block_templates_update',
  // ── bookings ────────────────────────────────────────────────────────
  'booking_pages_get',
  'booking_pages_list',
  'bookings_cancel',
  'bookings_get',
  'bookings_list',
  'bookings_update',
  'gift_certificates_issue',
  'gift_certificates_list',
  // ── brain ───────────────────────────────────────────────────────────
  'brain_approve_review_item',
  'brain_bulk_update_notes',
  'brain_create_meeting',
  'brain_create_note',
  'brain_create_note_from_template',
  'brain_create_note_template',
  'brain_create_relationship',
  'brain_create_saved_search',
  'brain_create_task',
  'brain_dashboard_summary',
  'brain_delete_note',
  'brain_delete_note_template',
  'brain_delete_saved_search',
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
  'brain_propose_task',
  'brain_reject_review_item',
  'brain_restore_note',
  'brain_search',
  'brain_update_note',
  'brain_update_note_template',
  'brain_update_relationship',
  'brain_update_saved_search',
  'brain_update_task',
  'brain_upsert_note_by_url',
  // ── branding ────────────────────────────────────────────────────────
  'branding_audit',
  'branding_check_contrast',
  'branding_create_profile',
  'branding_delete_profile',
  'branding_get_messaging',
  'branding_get_profile',
  'branding_list_profiles',
  'branding_update_messaging',
  'branding_update_profile',
  // ── client ──────────────────────────────────────────────────────────
  'client_get',
  'client_update',
  // ── crm contracts / proposals ───────────────────────────────────────
  'contracts_create',
  'contracts_get',
  'contracts_list',
  'contracts_void',
  'proposals_create',
  'proposals_get',
  'proposals_list',
  'proposals_send',
  'proposals_update',
  // ── crm ─────────────────────────────────────────────────────────────
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
  // ── decks ───────────────────────────────────────────────────────────
  'decks_add_slide',
  'decks_create',
  'decks_delete',
  'decks_get',
  'decks_list',
  'decks_replace_slides',
  'decks_update',
  'decks_upload_html',
  // ── email ───────────────────────────────────────────────────────────
  'email_campaigns_create',
  'email_campaigns_delete',
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
  // ── hosting ─────────────────────────────────────────────────────────
  'hosting_get',
  'hosting_list',
  // ── integrations ────────────────────────────────────────────────────
  'integrations_list',
  'integrations_revoke',
  // ── kanban ──────────────────────────────────────────────────────────
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
  'kanban_update_card',
  'kanban_update_column',
  // ── media ───────────────────────────────────────────────────────────
  'media_delete',
  'media_list',
  'media_upload_from_url',
  // ── my tasks / projects ─────────────────────────────────────────────
  'my_tasks_list',
  'projects_create',
  'projects_list',
  'projects_update',
  // ── nav ─────────────────────────────────────────────────────────────
  'nav_create',
  'nav_delete',
  'nav_list',
  // ── post types ──────────────────────────────────────────────────────
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
  // ── posts / sites ───────────────────────────────────────────────────
  'posts_create',
  'posts_delete',
  'posts_get',
  'posts_list',
  'posts_list_revisions',
  'posts_set_taxonomies',
  'posts_update',
  'posts_upload_html',
  'profile_get',
  'profile_update',
  'service_catalog_list',
  'service_requests_create',
  'service_requests_list',
  'sites_get_custom_code',
  'sites_list',
  'sites_update',
  'sites_update_custom_code',
  // ── sprints ─────────────────────────────────────────────────────────
  'sprints_create',
  'sprints_delete',
  'sprints_list',
  'sprints_update',
  // ── storefront ──────────────────────────────────────────────────────
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
  // ── suggested projects / surveys ────────────────────────────────────
  'suggested_project_requests_create',
  'suggested_projects_list',
  'surveys_create',
  'surveys_get',
  'surveys_list',
  'surveys_list_responses',
  'surveys_update',
  // ── taxonomies ──────────────────────────────────────────────────────
  'taxonomies_create_category',
  'taxonomies_create_tag',
  'taxonomies_list',
  // ── team ────────────────────────────────────────────────────────────
  'team_invite',
  'team_list_members',
  'team_remove_member',
  'team_update_role',
  // ── tickets ─────────────────────────────────────────────────────────
  'tickets_attach_file_from_url',
  'tickets_create',
  'tickets_get',
  'tickets_list',
  'tickets_reply',
  'tickets_update',
  // ── website domains / env vars ──────────────────────────────────────
  'website_domains_add',
  'website_domains_list',
  'website_domains_remove',
  'website_env_vars_delete',
  'website_env_vars_list',
  'website_env_vars_set',
  // ── meta ────────────────────────────────────────────────────────────
  'whoami',
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

  it('an empty-scope key sees only the unscoped meta tool (whoami)', () => {
    const server = buildMcpServer(makeCtx([]));
    const names = Object.keys(getRegisteredTools(server));
    // whoami is the only unscoped tool — every other registration is gated
    // behind a `hasScope(ctx.scopes, ...)` guard.
    expect(names).toEqual(['whoami']);
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
