import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import Anthropic from '@anthropic-ai/sdk';
import { getBrandMessaging } from '@/lib/branding';
import { buildBlockCopySystemPrompt, buildBlockCopyUserPrompt } from '@/lib/branding/copy-prompt';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';

/**
 * POST /api/portal/branding/generate-block-copy
 * Body: { blockType, context?, profileId?, variants? }
 * Returns: { success: true, data: <block fields> } OR { data: { variants: [...] } } when variants>1
 *
 * Generates on-brand copy for a block type, grounded in the client's
 * brand messaging (tagline, value prop, tone axes, voice samples).
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const client = await getPortalClient(parseInt(session.user.id, 10));
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    const { blockType, context, profileId, variants } = await req.json();
    if (!blockType || typeof blockType !== 'string') {
      return NextResponse.json({ success: false, message: 'blockType is required' }, { status: 400 });
    }

    const messaging = await getBrandMessaging(
      client.id,
      typeof profileId === 'number' ? profileId : null,
    );

    const system = buildBlockCopySystemPrompt();
    const userPrompt = buildBlockCopyUserPrompt(
      { blockType, context, variants: typeof variants === 'number' ? variants : 1 },
      messaging,
    );

    const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
    if (!gate.allowed) {
      return NextResponse.json({ success: false, message: gate.message, reason: gate.reason }, { status: 402 });
    }
    const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'anthropic' });
    const anthropic = new Anthropic({ apiKey: resolved.key });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    const totalTokens = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: totalTokens });

    let data: unknown;
    try {
      // Strip markdown fences if the model ignored instructions
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      data = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { success: false, message: 'Model returned non-JSON', raw: text },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('[generate-block-copy] failed', err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 },
    );
  }
}
