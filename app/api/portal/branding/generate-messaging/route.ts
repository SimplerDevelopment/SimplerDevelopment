import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { complete } from '@/lib/ai/llm';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';

const SYSTEM = `You are an expert brand strategist and copywriter. Given a description of a company or brand, generate comprehensive company messaging content.

You MUST respond with valid JSON only — no markdown, no code fences, no explanation.

{
  "companyName": "The company name",
  "tagline": "A memorable, concise tagline",
  "missionStatement": "1-3 sentences describing the company's mission and purpose",
  "visionStatement": "1-3 sentences describing the long-term vision",
  "valueProposition": "2-3 sentences explaining the unique value delivered to customers",
  "toneOfVoice": "3-5 comma-separated tone descriptors (e.g. Professional, Approachable, Innovative)",
  "brandPersonality": "2-3 sentences describing how the brand should come across",
  "writingStyle": "2-3 sentences of writing style guidelines",
  "elevatorPitch": "A compelling 2-3 sentence elevator pitch",
  "boilerplate": "A standard 3-4 sentence company description for press and proposals",
  "keyDifferentiators": ["differentiator 1", "differentiator 2", "differentiator 3"],
  "targetAudience": "2-3 sentences describing the ideal customers, their needs, and pain points",
  "industry": "Industry category",
  "yearFounded": "",
  "companySize": "",
  "headquarters": "",
  "websiteUrl": "",
  "socialProof": "",
  "keyClients": "",
  "certifications": "",
  "additionalContext": ""
}

Guidelines:
- Write in the brand's own voice based on the description
- Make the tagline punchy and memorable, not generic
- The elevator pitch should be conversational and compelling
- Key differentiators should be specific and concrete, not vague — generate 3-5 items
- The boilerplate should be polished enough to use in a press release
- Target audience should identify specific pain points the brand solves
- Tone descriptors should be specific (avoid generic words like "good" or "nice")
- Keep all content authentic to the brand description provided
- For factual fields (yearFounded, companySize, headquarters, websiteUrl), only fill if clearly stated in the description — never fabricate facts
- For socialProof, keyClients, certifications — only fill if mentioned, otherwise leave empty`;

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

    const result = await complete({
      task: 'brandingMessaging',
      clientId: client.id,
      maxTokens: 4096,
      system: SYSTEM,
      prompt: `Company/brand description: ${description.trim()}`,
    });

    let text = result.text;
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    const messaging = JSON.parse(text);

    const totalTokens = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
    void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: totalTokens });

    return NextResponse.json({ success: true, data: messaging });
  } catch (err) {
    console.error('[POST /api/portal/branding/generate-messaging]', err);
    return NextResponse.json({ success: false, message: 'Failed to generate messaging' }, { status: 500 });
  }
}
