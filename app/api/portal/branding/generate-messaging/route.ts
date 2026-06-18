import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { generateBrandMessaging } from '@/lib/branding/generators';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const client = await getPortalClient(parseInt(session.user.id, 10));
    if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

    const { description } = await req.json();
    if (!description?.trim()) return NextResponse.json({ success: false, message: 'Description is required' }, { status: 400 });

    const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
    if (!gate.allowed) {
      return NextResponse.json({ success: false, message: gate.message, reason: gate.reason }, { status: 402 });
    }
    const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'anthropic' });

    const { messaging, inputTokens, outputTokens } = await generateBrandMessaging(description, resolved.key);
    void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: inputTokens + outputTokens });

    return NextResponse.json({ success: true, data: messaging });
  } catch (err) {
    console.error('[POST /api/portal/branding/generate-messaging]', err);
    return NextResponse.json({ success: false, message: 'Failed to generate messaging' }, { status: 500 });
  }
}
