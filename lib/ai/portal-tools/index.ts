/**
 * Barrel for `@/lib/ai/portal-tools`. Re-exports the union of every domain
 * module's tool definitions and dispatches `executePortalTool` calls to the
 * matching domain handler. Public API (`PORTAL_TOOLS`, `executePortalTool`)
 * is preserved exactly — every existing import continues to resolve.
 */
import type Anthropic from '@anthropic-ai/sdk';

import { dashboardTools, dashboardHandlers } from './dashboard';
import { projectTools, projectHandlers } from './projects';
import { billingTools, billingHandlers } from './billing';
import { supportTools, supportHandlers } from './support';
import { servicesTools, servicesHandlers } from './services';
import { cmsTools, cmsHandlers } from './cms';
import { emailTools, emailHandlers } from './email';
import { pitchDeckTools, pitchDeckHandlers } from './pitch-decks';
import { bookingTools, bookingHandlers } from './booking';
import { teamTools, teamHandlers } from './team';
import { navigationTools, navigationHandlers } from './navigation';
import { crmTools, crmHandlers } from './crm';
import { surveyTools, surveyHandlers } from './surveys';
import { automationTools, automationHandlers } from './automations';

type Handler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

// Tool definitions, in the same domain order as the original monolith so that
// the order seen by the LLM is preserved (dashboard → projects → billing →
// support → services → CMS → email → pitch-decks → booking → suggested/team →
// navigation → CRM → projects-cards already in projects → surveys → CRM
// proposals already in CRM → automations → email subscribers/segments already
// in email).
export const PORTAL_TOOLS: Anthropic.Tool[] = [
  ...dashboardTools,
  ...projectTools.filter(t => !['create_project_card', 'update_project_card', 'move_project_card', 'add_card_comment'].includes(t.name)),
  ...billingTools.filter(t => t.name !== 'pay_invoice'),
  ...supportTools.filter(t => !['create_support_ticket', 'reply_to_ticket'].includes(t.name)),
  ...servicesTools.filter(t => t.name !== 'request_service'),
  ...cmsTools.filter(t => ![
    'create_website_page', 'publish_page', 'create_website_category', 'create_website_tag',
    'get_page_content', 'update_page_blocks', 'update_block_by_id', 'update_page_metadata',
  ].includes(t.name)),
  ...emailTools.filter(t => ![
    'create_email_campaign', 'update_email_campaign', 'get_email_campaign_details',
    'add_email_subscriber', 'get_email_segments', 'create_email_segment',
  ].includes(t.name)),
  ...pitchDeckTools.filter(t => !['create_pitch_deck', 'get_pitch_deck_slides', 'update_pitch_deck_slide'].includes(t.name)),
  ...bookingTools.filter(t => !['create_booking_page', 'update_booking_page'].includes(t.name)),
  ...teamTools.filter(t => !['request_suggested_project', 'update_profile', 'invite_team_member'].includes(t.name)),
  // ── WRITE block (mirrors original layout) ──
  ...supportTools.filter(t => ['create_support_ticket', 'reply_to_ticket'].includes(t.name)),
  ...projectTools.filter(t => t.name === 'add_card_comment'),
  ...cmsTools.filter(t => ['create_website_page', 'publish_page', 'create_website_category', 'create_website_tag'].includes(t.name)),
  ...servicesTools.filter(t => t.name === 'request_service'),
  ...teamTools.filter(t => t.name === 'request_suggested_project'),
  ...teamTools.filter(t => t.name === 'update_profile'),
  ...teamTools.filter(t => t.name === 'invite_team_member'),
  ...cmsTools.filter(t => ['get_page_content', 'update_page_blocks', 'update_block_by_id', 'update_page_metadata'].includes(t.name)),
  ...emailTools.filter(t => ['create_email_campaign', 'update_email_campaign', 'get_email_campaign_details'].includes(t.name)),
  ...pitchDeckTools.filter(t => ['create_pitch_deck', 'get_pitch_deck_slides', 'update_pitch_deck_slide'].includes(t.name)),
  ...bookingTools.filter(t => ['create_booking_page', 'update_booking_page'].includes(t.name)),
  ...navigationTools,
  ...billingTools.filter(t => t.name === 'pay_invoice'),
  ...crmTools.filter(t => ![
    'get_crm_proposals', 'create_crm_proposal', 'send_crm_proposal',
  ].includes(t.name)),
  ...projectTools.filter(t => ['create_project_card', 'update_project_card', 'move_project_card'].includes(t.name)),
  ...surveyTools,
  ...crmTools.filter(t => ['get_crm_proposals', 'create_crm_proposal', 'send_crm_proposal'].includes(t.name)),
  ...automationTools,
  ...emailTools.filter(t => ['add_email_subscriber', 'get_email_segments', 'create_email_segment'].includes(t.name)),
];

// Lookup table: tool name → handler. Built once at module load. Each handler
// owns its own DB calls and is identical (line-for-line) to the body that
// previously lived inside the monolithic `executePortalTool` switch.
const HANDLERS: Record<string, Handler> = {
  ...dashboardHandlers,
  ...projectHandlers,
  ...billingHandlers,
  ...supportHandlers,
  ...servicesHandlers,
  ...cmsHandlers,
  ...emailHandlers,
  ...pitchDeckHandlers,
  ...bookingHandlers,
  ...teamHandlers,
  ...navigationHandlers,
  ...crmHandlers,
  ...surveyHandlers,
  ...automationHandlers,
};

export async function executePortalTool(
  name: string,
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
): Promise<unknown> {
  const handler = HANDLERS[name];
  if (!handler) return { error: `Unknown tool: ${name}` };
  return handler(input, clientId, userId);
}
