import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { complete } from '@/lib/ai/llm';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const client = await getPortalClient(parseInt(session.user.id, 10));
    if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

    const { fieldName, fieldLabel, currentValue, prompt, companyContext } = await req.json();
    if (!fieldName || !prompt?.trim()) {
      return NextResponse.json({ success: false, message: 'Field name and prompt are required' }, { status: 400 });
    }

    const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
    if (!gate.allowed) {
      return NextResponse.json({ success: false, message: gate.message, reason: gate.reason }, { status: 402 });
    }
    const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'anthropic' });

    const system = `You are an expert brand strategist and copywriter. You will rewrite or generate content for a specific brand messaging field.

You MUST respond with the new field value only — no quotes, no markdown, no explanation, no labels. Just the raw text content.

Guidelines:
- Write professional, polished copy
- Keep the tone consistent with any company context provided
- Be concise but substantive
- Follow the user's specific instructions in their prompt`;

    const userMessage = [
      `Field: ${fieldLabel || fieldName}`,
      currentValue ? `Current value: ${currentValue}` : 'Current value: (empty)',
      companyContext ? `Company context: ${companyContext}` : '',
      `\nInstructions: ${prompt.trim()}`,
    ].filter(Boolean).join('\n');

    const result = await complete({
      task: 'brandingRewrite',
      clientId: client.id,
      maxTokens: 1024,
      system,
      prompt: userMessage,
    });

    const text = result.text.trim();

    const totalTokens = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
    void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: totalTokens });

    return NextResponse.json({ success: true, data: text });
  } catch (err) {
    console.error('[POST /api/portal/branding/rewrite-field]', err);
    return NextResponse.json({ success: false, message: 'Failed to rewrite field' }, { status: 500 });
  }
}
