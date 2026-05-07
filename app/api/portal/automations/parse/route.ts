import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { hasCredits, deductCredits } from '@/lib/ai-credits';
import { parseAutomationDescription } from '@/lib/automation';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';

// POST /api/portal/automations/parse — NLP parse a description into a rule
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
  if (!gate.allowed) {
    return NextResponse.json({ success: false, error: gate.message, reason: gate.reason }, { status: 402 });
  }

  const { description } = await req.json();
  if (!description || typeof description !== 'string') {
    return NextResponse.json({ success: false, error: 'description is required' }, { status: 400 });
  }

  try {
    const { parsed, inputTokens, outputTokens, source } = await parseAutomationDescription(description, { clientId: client.id });

    const totalTokens = inputTokens + outputTokens;
    if (source === 'platform') {
      // Only check / deduct credits for platform-keyed calls.
      const canUse = await hasCredits(client.id, 500);
      if (!canUse) {
        return NextResponse.json({
          success: false,
          error: 'Insufficient AI credits. Purchase more, enable pay-as-you-go, or add a BYOK key in Settings → API Keys.',
        }, { status: 402 });
      }
      await deductCredits(client.id, totalTokens, 'automation_parse', 'nlp-parse', `NLP automation parse: "${description.slice(0, 50)}..."`);
    }

    return NextResponse.json({ success: true, parsed, tokensUsed: totalTokens, keySource: source });
  } catch (err) {
    console.error('[automation/parse] Error:', err);
    return NextResponse.json({
      success: false,
      error: 'Failed to parse automation. Try rephrasing your description.',
    }, { status: 500 });
  }
}
