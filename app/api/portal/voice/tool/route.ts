/**
 * POST /api/portal/voice/tool
 *
 * Executes a single curated voice tool on behalf of the authenticated portal
 * user. The realtime model (running in the browser) emits a function call; the
 * widget relays it here, where we re-authenticate, enforce the tool's required
 * role, and gate mutations behind a signed confirm token.
 *
 * Two-phase mutation flow (requiresConfirm tools):
 *   1. First POST { tool, args }            → { status:'needs_confirmation', summary, confirmToken }
 *      (nothing is executed; the widget shows a confirm card)
 *   2. On approve, POST { tool, args, confirmToken } → { status:'done', result }
 *
 * Read tools (requiresConfirm:false) execute immediately.
 *
 * Request body: { tool: string, args?: object, confirmToken?: string }
 * Response:     { success, data: { status, ... } }
 */
import { NextResponse } from 'next/server';

import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getVoiceTool } from '@/lib/voice/tools';
import { signConfirmToken, verifyConfirmToken } from '@/lib/voice/confirm-token';
import { recordAiUsage } from '@/lib/ai/audit';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ToolBody {
  tool?: string;
  args?: Record<string, unknown>;
  confirmToken?: string;
}

export async function POST(req: Request) {
  let body: ToolBody;
  try {
    body = (await req.json()) as ToolBody;
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const toolName = typeof body.tool === 'string' ? body.tool : '';
  const tool = getVoiceTool(toolName);
  if (!tool) {
    return NextResponse.json({ success: false, message: `Unknown tool: ${toolName}` }, { status: 400 });
  }
  const args = body.args && typeof body.args === 'object' ? body.args : {};

  // ── Auth + role check (the tool declares its required action level).
  const authed = await authorizePortal({ action: tool.action });
  if (isAuthError(authed)) return authed.response;
  const { userId, client } = authed;

  // ── Confirm gating for mutations.
  if (tool.requiresConfirm) {
    if (!body.confirmToken) {
      const confirmToken = signConfirmToken({ tool: toolName, args, userId, clientId: client.id });
      const summary = tool.summarize?.(args) ?? `Run ${toolName}?`;
      return NextResponse.json({
        success: true,
        data: { status: 'needs_confirmation', summary, confirmToken },
      });
    }
    const valid = verifyConfirmToken(body.confirmToken, {
      tool: toolName,
      args,
      userId,
      clientId: client.id,
    });
    if (!valid) {
      return NextResponse.json(
        { success: false, message: 'Confirmation expired or invalid — please try again.' },
        { status: 400 },
      );
    }
  }

  // ── Execute. Forward the caller's cookie so the internal route authenticates
  //    as this same user (keeps tenancy + validation in the target route).
  const origin = new URL(req.url).origin;
  const cookie = req.headers.get('cookie') ?? '';
  try {
    const result = await tool.execute(args, { origin, cookie });

    // Best-effort usage signal. Precise Realtime audio-token accounting is a
    // documented follow-on; a tool invocation is a cheap, trustworthy event to
    // record against the meter so dashboards reflect voice activity.
    try {
      const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'openai' });
      void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: 0 });
    } catch {
      /* metering is best-effort */
    }

    return NextResponse.json({ success: true, data: { status: 'done', result } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    console.error(`[voice/tool] ${toolName} failed`, err);
    return NextResponse.json({ success: false, message }, { status: 502 });
  }
}
