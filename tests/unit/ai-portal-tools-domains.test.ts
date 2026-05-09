// @vitest-environment node
/**
 * Per-domain assertions for the split portal-tools modules. These complement
 * the registry-baseline test by verifying that each domain file owns the tools
 * we expect, and that the barrel reaggregates the full set without overlap.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/automation/event-bus', () => ({ emitEvent: vi.fn() }));
vi.mock('@/lib/crm/default-pipeline', () => ({ ensureDefaultPipeline: vi.fn() }));

import { dashboardTools, dashboardHandlers } from '@/lib/ai/portal-tools/dashboard';
import { projectTools, projectHandlers } from '@/lib/ai/portal-tools/projects';
import { billingTools, billingHandlers } from '@/lib/ai/portal-tools/billing';
import { supportTools, supportHandlers } from '@/lib/ai/portal-tools/support';
import { servicesTools, servicesHandlers } from '@/lib/ai/portal-tools/services';
import { cmsTools, cmsHandlers } from '@/lib/ai/portal-tools/cms';
import { emailTools, emailHandlers } from '@/lib/ai/portal-tools/email';
import { pitchDeckTools, pitchDeckHandlers } from '@/lib/ai/portal-tools/pitch-decks';
import { bookingTools, bookingHandlers } from '@/lib/ai/portal-tools/booking';
import { teamTools, teamHandlers } from '@/lib/ai/portal-tools/team';
import { navigationTools, navigationHandlers } from '@/lib/ai/portal-tools/navigation';
import { crmTools, crmHandlers } from '@/lib/ai/portal-tools/crm';
import { surveyTools, surveyHandlers } from '@/lib/ai/portal-tools/surveys';
import { automationTools, automationHandlers } from '@/lib/ai/portal-tools/automations';
import { PORTAL_TOOLS, executePortalTool } from '@/lib/ai/portal-tools';

const DOMAINS = [
  { name: 'dashboard', tools: dashboardTools, handlers: dashboardHandlers, expected: ['get_dashboard_summary'] },
  {
    name: 'projects',
    tools: projectTools,
    handlers: projectHandlers,
    expected: [
      'get_my_projects', 'pm_spawn_project_from_deal',
      'get_project_board', 'get_project_cards', 'get_sprint_progress',
      'get_project_files', 'add_card_comment', 'create_project_card', 'update_project_card',
      'move_project_card',
    ],
  },
  {
    name: 'billing',
    tools: billingTools,
    handlers: billingHandlers,
    expected: ['get_my_invoices', 'get_invoice_details', 'get_payment_methods', 'pay_invoice'],
  },
  {
    name: 'support',
    tools: supportTools,
    handlers: supportHandlers,
    expected: ['get_my_tickets', 'get_ticket_details', 'create_support_ticket', 'reply_to_ticket'],
  },
  {
    name: 'services',
    tools: servicesTools,
    handlers: servicesHandlers,
    expected: ['get_services_catalog', 'get_my_services', 'request_service'],
  },
  {
    name: 'cms',
    tools: cmsTools,
    handlers: cmsHandlers,
    expected: [
      'get_my_websites', 'get_website_pages', 'get_website_categories', 'get_website_tags',
      'get_website_media', 'get_my_hosted_sites', 'create_website_page', 'publish_page',
      'create_website_category', 'create_website_tag', 'get_page_content', 'update_page_blocks',
      'update_block_by_id', 'update_page_metadata',
    ],
  },
  {
    name: 'email',
    tools: emailTools,
    handlers: emailHandlers,
    expected: [
      'get_my_email_campaigns', 'get_my_email_lists', 'create_email_campaign', 'update_email_campaign',
      'get_email_campaign_details', 'add_email_subscriber', 'get_email_segments', 'create_email_segment',
    ],
  },
  {
    name: 'pitch-decks',
    tools: pitchDeckTools,
    handlers: pitchDeckHandlers,
    expected: ['get_my_pitch_decks', 'create_pitch_deck', 'get_pitch_deck_slides', 'update_pitch_deck_slide'],
  },
  {
    name: 'booking',
    tools: bookingTools,
    handlers: bookingHandlers,
    expected: ['get_my_booking_pages', 'get_bookings_for_page', 'create_booking_page', 'update_booking_page'],
  },
  {
    name: 'team',
    tools: teamTools,
    handlers: teamHandlers,
    expected: [
      'get_suggested_projects', 'get_my_team', 'get_my_profile',
      'request_suggested_project', 'update_profile', 'invite_team_member',
    ],
  },
  { name: 'navigation', tools: navigationTools, handlers: navigationHandlers, expected: ['navigate_to'] },
  {
    name: 'crm',
    tools: crmTools,
    handlers: crmHandlers,
    expected: [
      'get_crm_contacts', 'get_crm_contact_detail', 'get_crm_companies', 'get_crm_deals',
      'get_crm_pipelines', 'get_crm_activities', 'create_crm_contact', 'update_crm_contact',
      'create_crm_company', 'create_crm_deal', 'update_crm_deal', 'log_crm_activity',
      'get_crm_proposals', 'create_crm_proposal', 'send_crm_proposal',
    ],
  },
  {
    name: 'surveys',
    tools: surveyTools,
    handlers: surveyHandlers,
    expected: ['get_my_surveys', 'get_survey_details', 'create_survey', 'update_survey'],
  },
  {
    name: 'automations',
    tools: automationTools,
    handlers: automationHandlers,
    expected: ['get_my_automations', 'create_automation', 'toggle_automation'],
  },
] as const;

describe('per-domain portal-tools modules', () => {
  for (const d of DOMAINS) {
    it(`[${d.name}] tools array exposes the expected names`, () => {
      const names = d.tools.map(t => t.name).sort();
      expect(names).toEqual([...d.expected].sort());
    });

    it(`[${d.name}] handlers map covers every tool name`, () => {
      const handlerNames = Object.keys(d.handlers).sort();
      expect(handlerNames).toEqual([...d.expected].sort());
    });

    it(`[${d.name}] every handler is an async function with arity 3`, () => {
      for (const name of d.expected) {
        const fn = d.handlers[name];
        expect(typeof fn, `${d.name}.${name} handler`).toBe('function');
        expect(fn.length, `${d.name}.${name} arity`).toBe(3);
      }
    });
  }
});

describe('barrel aggregation', () => {
  it('PORTAL_TOOLS is the union of all domain tools (no missing, no duplicates)', () => {
    const fromDomains = DOMAINS.flatMap(d => d.tools.map(t => t.name)).sort();
    const fromBarrel = PORTAL_TOOLS.map(t => t.name).sort();
    expect(fromBarrel).toEqual(fromDomains);

    const dedup = new Set(fromBarrel);
    expect(dedup.size).toBe(fromBarrel.length);
  });

  it('executePortalTool returns the unknown-tool envelope for an unmapped name', async () => {
    const result = await executePortalTool('this_tool_does_not_exist', {}, 1, 1);
    expect(result).toEqual({ error: 'Unknown tool: this_tool_does_not_exist' });
  });
});

describe('navigation handler is fully pure (no DB)', () => {
  it('navigate_to returns the navigate envelope passing through path/section/message', async () => {
    const result = await navigationHandlers.navigate_to(
      { path: '/portal/dashboard', section: 'overview', message: 'Take a look.' },
      1, 1,
    );
    expect(result).toEqual({
      action: 'navigate',
      path: '/portal/dashboard',
      section: 'overview',
      message: 'Take a look.',
    });
  });

  it('navigate_to defaults section/message to null when omitted', async () => {
    const result = await navigationHandlers.navigate_to({ path: '/portal/billing' }, 1, 1);
    expect(result).toEqual({
      action: 'navigate',
      path: '/portal/billing',
      section: null,
      message: null,
    });
  });
});
