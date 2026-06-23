/**
 * Per-domain MCP tool registrar contracts.
 *
 * Each lib/mcp/tools/<domain>.ts exports a register*Tools(server, ctx)
 * function that registers every tool belonging to that domain. This spec
 * builds a fake McpServer (just a `registerTool` spy), invokes each
 * registrar with a full-access context, and asserts the registrar's tool
 * count plus a handful of representative names.
 *
 * Goal: catch accidental loss of tools when a domain file is reorganised.
 * The exhaustive registered-set contract lives in
 * tests/unit/mcp-tool-registry-baseline.test.ts (also unit-layer, DB-mocked).
 */
import { describe, it, expect, vi } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import type { McpToolRegistrar } from '@/lib/mcp/types';

// Several modules pulled in by the registrar imports do top-level
// `process.env.X` reads (DATABASE_URL via @/lib/db, RESEND_API_KEY via
// @/lib/email, NEXT_PUBLIC_SITE_URL via the unsubscribe-link helper, etc.).
// Set safe placeholders before any registrar import so these chains evaluate.
process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.RESEND_API_KEY ??= 're_test_placeholder';
process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3000';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/brain/profiles', () => ({
  getOrCreateBrainProfile: vi.fn(async () => ({ id: 1, clientId: 1 })),
  getBrainProfile: vi.fn(async () => ({ id: 1, clientId: 1 })),
}));
// We never call any of these tools during this test (only count their
// registrations), so a stub `db` value is safe and keeps the test from
// trying to open a real Postgres connection.
vi.mock('@/lib/db', () => ({ db: {} }));
// @/lib/email evaluates `new Resend(RESEND_API_KEY)` at module load — the
// unit-test environment doesn't carry a key. Stub the surface used by the
// CMS / email registrars; nothing here is actually invoked.
vi.mock('@/lib/email', () => ({
  resend: {},
  renderBlocksToEmailHtml: vi.fn(),
  buildCampaignHtml: vi.fn(),
  buildUnsubscribeUrl: vi.fn(),
  generateUnsubscribeToken: vi.fn(() => 'token'),
}));
vi.mock('@/lib/email/campaign-send', () => ({
  executeCampaignSend: vi.fn(),
}));

import {
  registerProjectsTools,
  registerKanbanTools,
  registerSprintsTools,
  registerTicketsTools,
  registerCrmTools,
  registerCmsTools,
  registerEmailTools,
  registerPitchDecksTools,
  registerSurveysTools,
  registerBookingsTools,
  registerTeamTools,
  registerProfileTools,
  registerIntegrationsTools,
  registerBillingTools,
  registerServicesTools,
  registerAiTools,
  registerAutomationsTools,
  registerHostingTools,
  registerMetaTools,
  registerResourceDocs,
  registerBrandingTools,
  registerStorefrontTools,
  registerBrainTools,
  registerPostTypesTools,
  registerApprovalsTools,
} from '@/lib/mcp/tools';

function fakeServer() {
  const tools: string[] = [];
  const resources: string[] = [];
  const stub = {
    registerTool: vi.fn((name: string) => {
      tools.push(name);
      return { update: vi.fn(), enable: vi.fn(), disable: vi.fn() };
    }),
    registerResource: vi.fn((name: string) => {
      resources.push(name);
      return { update: vi.fn(), enable: vi.fn(), disable: vi.fn() };
    }),
  };
  // The McpServer surface is large; this stub only models the two methods the
  // registrars touch. Cast through `unknown` so the registrar's strict type
  // accepts the partial. Calling any other McpServer method on `stub` would
  // throw — we never do.
  return { stub: stub as unknown as Parameters<McpToolRegistrar>[0], tools, resources };
}

function fullCtx(): PortalMcpContext {
  return {
    userId: 1,
    keyId: 1,
    scopes: ['*'],
    client: { id: 1, company: 'Test Co' } as PortalMcpContext['client'],
  };
}

interface DomainCase {
  name: string;
  fn: McpToolRegistrar;
  /** Lower bound on the tool count this registrar registers. */
  minTools: number;
  /** Tool names that must appear. At least 3 names per the refactor spec. */
  expectedNames: string[];
}

const DOMAIN_CASES: DomainCase[] = [
  {
    name: 'projects',
    fn: registerProjectsTools,
    minTools: 4,
    expectedNames: ['projects_list', 'projects_create', 'projects_update', 'my_tasks_list'],
  },
  {
    name: 'kanban',
    fn: registerKanbanTools,
    minTools: 30,
    expectedNames: ['kanban_create_card', 'kanban_move_card', 'kanban_list_board'],
  },
  {
    name: 'sprints',
    fn: registerSprintsTools,
    minTools: 4,
    expectedNames: ['sprints_list', 'sprints_create', 'sprints_update', 'sprints_delete'],
  },
  {
    name: 'tickets',
    fn: registerTicketsTools,
    minTools: 6,
    expectedNames: ['tickets_list', 'tickets_create', 'tickets_reply'],
  },
  {
    name: 'crm',
    fn: registerCrmTools,
    minTools: 30,
    expectedNames: ['crm_contacts_search', 'crm_deals_list', 'crm_pipelines_list'],
  },
  {
    name: 'cms',
    fn: registerCmsTools,
    minTools: 25,
    expectedNames: ['posts_list', 'posts_create', 'sites_list'],
  },
  {
    name: 'email',
    fn: registerEmailTools,
    minTools: 15,
    expectedNames: ['email_lists', 'email_campaigns_create', 'email_subscribers_add'],
  },
  {
    name: 'pitch-decks',
    fn: registerPitchDecksTools,
    minTools: 8,
    expectedNames: ['decks_list', 'decks_create', 'decks_replace_slides'],
  },
  {
    name: 'surveys',
    fn: registerSurveysTools,
    minTools: 5,
    expectedNames: ['surveys_list', 'surveys_create', 'surveys_update'],
  },
  {
    name: 'bookings',
    fn: registerBookingsTools,
    minTools: 8,
    expectedNames: ['booking_pages_list', 'bookings_list', 'bookings_cancel'],
  },
  {
    name: 'team',
    fn: registerTeamTools,
    minTools: 6,
    expectedNames: ['team_list_members', 'team_invite', 'client_get'],
  },
  {
    name: 'profile',
    fn: registerProfileTools,
    minTools: 2,
    expectedNames: ['profile_get', 'profile_update'],
  },
  {
    name: 'integrations',
    fn: registerIntegrationsTools,
    minTools: 2,
    expectedNames: ['integrations_list', 'integrations_revoke'],
  },
  {
    name: 'billing',
    fn: registerBillingTools,
    minTools: 4,
    expectedNames: ['invoices_list', 'invoices_get', 'ai_credits_balance'],
  },
  {
    name: 'services',
    fn: registerServicesTools,
    minTools: 5,
    expectedNames: ['service_requests_list', 'service_catalog_list', 'suggested_projects_list'],
  },
  {
    name: 'ai',
    fn: registerAiTools,
    minTools: 2,
    expectedNames: ['ai_conversations_list', 'ai_conversations_get'],
  },
  {
    name: 'automations',
    fn: registerAutomationsTools,
    minTools: 5,
    expectedNames: ['automations_list', 'automations_create', 'automations_toggle'],
  },
  {
    name: 'hosting',
    fn: registerHostingTools,
    minTools: 2,
    expectedNames: ['hosting_list', 'hosting_get'],
  },
  {
    name: 'meta',
    fn: registerMetaTools,
    minTools: 1,
    expectedNames: ['whoami'],
  },
  {
    name: 'branding',
    fn: registerBrandingTools,
    minTools: 9,
    expectedNames: ['branding_list_profiles', 'branding_audit', 'branding_check_contrast'],
  },
  {
    name: 'storefront',
    fn: registerStorefrontTools,
    minTools: 25,
    expectedNames: ['store_products_list', 'store_orders_list', 'store_settings_get'],
  },
  {
    name: 'brain',
    fn: registerBrainTools,
    minTools: 30,
    expectedNames: ['brain_search', 'brain_dashboard_summary', 'brain_list_tasks'],
  },
  {
    name: 'post-types',
    fn: registerPostTypesTools,
    minTools: 13,
    expectedNames: ['post_types_list', 'post_types_create', 'post_types_get_template'],
  },
  {
    name: 'approvals',
    fn: registerApprovalsTools,
    minTools: 4,
    expectedNames: ['approvals_list', 'approvals_approve', 'approvals_reject'],
  },
];

describe.each(DOMAIN_CASES)('registers %s tools', ({ name, fn, minTools, expectedNames }) => {
  it(`${name}: registers at least ${minTools} tools and the canonical names`, () => {
    const { stub, tools } = fakeServer();
    fn(stub, fullCtx());
    expect(tools.length).toBeGreaterThanOrEqual(minTools);
    for (const expected of expectedNames) {
      expect(tools, `${name} should register ${expected}`).toContain(expected);
    }
  });
});

describe('resource registrar registers the blocks-schema resource', () => {
  it('exposes the visual editor block schema as a resource', () => {
    const { stub, resources } = fakeServer();
    registerResourceDocs(stub, fullCtx());
    expect(resources).toContain('blocks-schema');
  });
});
