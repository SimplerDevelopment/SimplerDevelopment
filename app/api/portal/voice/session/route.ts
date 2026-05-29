/**
 * POST /api/portal/voice/session
 *
 * Mints a short-lived OpenAI Realtime API client secret so the browser can open
 * a WebRTC connection directly to OpenAI (no media server). The tool list and
 * base instructions are baked into the session SERVER-SIDE here, so a tampered
 * client can't widen the toolset or change the system prompt — it can only
 * append page context (truncated) for awareness.
 *
 * Same auth / plan-gate / BYOK-key / credit prologue as
 * `app/api/portal/ai/chat/stream/route.ts`, but for the `openai` provider.
 *
 * NOTE on metering: this endpoint gates access up front (plan + credit balance).
 * Precise per-session Realtime token accounting (audio tokens reported in
 * `response.done`) is a documented follow-on — see the voice plan. v1 is
 * gate-only so we never under-bill silently without a server-trusted source.
 *
 * Request body: { pageContext?: string }
 * Response:     { success, data: { clientSecret, expiresAt, model } }
 */
import { NextResponse } from 'next/server';

import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { hasCredits } from '@/lib/ai-credits';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { voiceToolsForRealtime } from '@/lib/voice/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
const VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';

const BASE_INSTRUCTIONS = `You are the SimplerDevelopment portal voice assistant for this client's team.
You can answer questions about and take actions in the client's CRM, Company Brain, and tasks using the provided tools.
Be concise and conversational — your replies are spoken aloud. Confirm understanding briefly, then act.
When a tool requires confirmation, the user will be shown a confirm card; tell them you've prepared the action and ask them to confirm.
Never invent data — if a tool returns nothing, say so. Format money as dollars and dates in plain English.`;

export async function POST(req: Request) {
  // ── 1. Auth (session cookie or bearer). 'write' so the assistant may act.
  const authed = await authorizePortal({ action: 'write' });
  if (isAuthError(authed)) return authed.response;
  const { client } = authed;

  // ── 2. Plan-gate + key resolution (OpenAI provider for Realtime).
  const gate = await checkAiPlanGate({ clientId: client.id, provider: 'openai' });
  if (!gate.allowed) {
    return NextResponse.json(
      { success: false, message: gate.message ?? 'Voice AI is not available on the current plan.' },
      { status: 402 },
    );
  }

  const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'openai' });
  if (resolved.source === 'platform') {
    const ok = await hasCredits(client.id);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: 'Insufficient AI credits for voice.' },
        { status: 402 },
      );
    }
  }

  // ── 3. Optional page context from the client (truncated, untrusted).
  let pageContext = '';
  try {
    const body = (await req.json()) as { pageContext?: unknown };
    if (typeof body?.pageContext === 'string') {
      pageContext = body.pageContext.slice(0, 600);
    }
  } catch {
    /* no body is fine */
  }

  const instructions = pageContext
    ? `${BASE_INSTRUCTIONS}\n\nCurrent page context (for awareness): ${pageContext}`
    : BASE_INSTRUCTIONS;

  // ── 4. Mint the ephemeral client secret with server-controlled session config.
  let oaRes: Response;
  try {
    oaRes = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolved.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: MODEL,
          instructions,
          audio: { output: { voice: VOICE } },
          tools: voiceToolsForRealtime(),
          tool_choice: 'auto',
        },
      }),
    });
  } catch (err) {
    console.error('[voice/session] mint fetch failed', err);
    return NextResponse.json(
      { success: false, message: 'Could not reach the voice service.' },
      { status: 502 },
    );
  }

  if (!oaRes.ok) {
    const detail = await oaRes.text().catch(() => '');
    console.error('[voice/session] OpenAI error', oaRes.status, detail.slice(0, 500));
    return NextResponse.json(
      { success: false, message: 'Failed to start a voice session.' },
      { status: 502 },
    );
  }

  const data = (await oaRes.json()) as {
    value?: string;
    expires_at?: number;
    client_secret?: { value?: string; expires_at?: number };
  };

  // The GA endpoint returns { value, expires_at }; older shapes nest it under
  // client_secret. Accept either so a model/endpoint bump doesn't break us.
  const clientSecret = data.value ?? data.client_secret?.value;
  const expiresAt = data.expires_at ?? data.client_secret?.expires_at ?? null;
  if (!clientSecret) {
    console.error('[voice/session] no client secret in response', data);
    return NextResponse.json(
      { success: false, message: 'Voice service returned an unexpected response.' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { clientSecret, expiresAt, model: MODEL },
  });
}
