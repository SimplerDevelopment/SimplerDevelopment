/**
 * Barrel for `@/lib/ai/portal-tools`. Re-exports the union of every domain
 * module's tool definitions and dispatches `executePortalTool` calls to the
 * matching domain handler. Public API (`PORTAL_TOOLS`, `executePortalTool`)
 * is preserved exactly — every existing import continues to resolve.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { logAgentAction, hashParams } from '@/lib/audit/agent-action-log';

import { stageOrApply } from '@/lib/mcp/pending-changes';
import type { PortalMcpContext } from '@/lib/mcp-auth';

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
// Exported so the completeness test in tests/unit/portal-tools-scopes.test.ts
// can enumerate the full key set without importing every domain module.
export const HANDLERS: Record<string, Handler> = {
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

/**
 * Tools that create / modify portal data. Mirrors the confirmation-rules list
 * in the shared chat system prompt. Read tools (get_, list_, search_ prefixes)
 * are deliberately absent — they must never be deferred, or the assistant could
 * no longer answer questions. Missing a write here fails OPEN (executes
 * directly, same as today) — safe; mis-listing a read would defer it — unsafe.
 */
const WRITE_TOOLS: ReadonlySet<string> = new Set([
  'create_support_ticket', 'reply_to_ticket',
  'add_card_comment', 'create_project_card', 'update_project_card', 'move_project_card',
  'create_website_page', 'publish_page', 'create_website_category', 'create_website_tag',
  'update_page_blocks', 'update_block_by_id', 'update_page_metadata',
  'request_service', 'request_suggested_project', 'update_profile', 'invite_team_member',
  'create_crm_contact', 'update_crm_contact', 'create_crm_company',
  'create_crm_deal', 'update_crm_deal', 'log_crm_activity',
  'create_crm_proposal', 'send_crm_proposal',
  'create_survey', 'update_survey',
  'create_automation', 'toggle_automation',
  'create_email_campaign', 'update_email_campaign', 'add_email_subscriber', 'create_email_segment',
  'create_pitch_deck', 'update_pitch_deck_slide',
  'create_booking_page', 'update_booking_page',
]);

/** Short human summary for the approval queue row. */
function summarizeToolCall(name: string, input: Record<string, unknown>): string {
  const label = input.title ?? input.name ?? input.subject ?? input.id;
  return label != null ? `AI assistant: ${name} — ${String(label)}` : `AI assistant: ${name}`;
}

export interface PortalToolCtx {
  source?: 'automation' | 'assistant';
  ruleId?: number;
}

/**
 * Execute an AI-chat tool. Two orthogonal cross-cutting concerns are applied:
 *
 *  1. Approval staging (`gateCtx`): on the streaming chat path (bearer auth),
 *     when the tool is a write AND the caller's API key requires approval, the
 *     write is staged into the approval queue instead of committing —
 *     `stageOrApply` decides from the key's `require_cms_approval` flag. The
 *     deferred call is replayed verbatim on approval (`ai_tool_call:execute` in
 *     `lib/mcp/approvals.ts`). Omit `gateCtx` to execute directly.
 *  2. Agent-action audit (`ctx`): every call is logged to the agent-action log
 *     with source / outcome / duration (automation runs pass `{ source, ruleId }`).
 */
export async function executePortalTool(
  name: string,
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
  gateCtx?: PortalMcpContext | null,
  ctx?: PortalToolCtx,
): Promise<unknown> {
  const handler = HANDLERS[name];
  if (!handler) {
    void logAgentAction({
      clientId,
      userId,
      source: ctx?.source ?? 'assistant',
      tool: name,
      paramsHash: hashParams(input),
      outcome: 'error',
      errorMessage: `Unknown tool: ${name}`,
      ruleId: ctx?.ruleId ?? null,
    });
    return { error: `Unknown tool: ${name}` };
  }

  const start = Date.now();
  let outcome: 'success' | 'error' = 'success';
  let errorMessage: string | null = null;
  let result: unknown;

  try {
    if (gateCtx && WRITE_TOOLS.has(name)) {
      const staged = await stageOrApply({
        ctx: gateCtx,
        entityType: 'ai_tool_call',
        operation: 'execute',
        entityId: null,
        summary: summarizeToolCall(name, input),
        payload: { tool: name, input },
        apply: () => handler(input, clientId, userId),
      });
      result = staged.pending
        ? {
            pending: true,
            pendingId: staged.pendingId,
            status: 'pending_approval',
            summary: staged.summary,
            message: 'Queued for the workspace owner to approve before it runs.',
          }
        : staged.data;
    } else {
      result = await handler(input, clientId, userId);
    }
    // Treat a result object carrying an `error` key as an error outcome.
    if (result !== null && typeof result === 'object' && 'error' in (result as Record<string, unknown>)) {
      outcome = 'error';
      errorMessage = String((result as Record<string, unknown>).error);
    }
  } catch (err) {
    outcome = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
    // Re-throw after logging so callers still observe the exception.
    void logAgentAction({
      clientId,
      userId,
      source: ctx?.source ?? 'assistant',
      tool: name,
      paramsHash: hashParams(input),
      outcome,
      errorMessage,
      ruleId: ctx?.ruleId ?? null,
      durationMs: Date.now() - start,
    });
    throw err;
  }

  void logAgentAction({
    clientId,
    userId,
    source: ctx?.source ?? 'assistant',
    tool: name,
    paramsHash: hashParams(input),
    outcome,
    errorMessage,
    ruleId: ctx?.ruleId ?? null,
    durationMs: Date.now() - start,
  });

  return result;
}
