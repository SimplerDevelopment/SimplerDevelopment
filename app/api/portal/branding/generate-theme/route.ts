import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { complete } from '@/lib/ai/llm';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';

const SYSTEM = `You are an expert brand designer. Given a brand description, generate a complete visual identity.

You MUST respond with valid JSON only — no markdown, no code fences, no explanation.

{
  "primaryColor": "#hex - main brand color",
  "secondaryColor": "#hex - supporting color",
  "accentColor": "#hex - highlight/accent color",
  "backgroundColor": "#hex - page background",
  "textColor": "#hex - body text color",
  "navBackground": "#hex - navigation bar background",
  "navTextColor": "#hex - navigation text color",
  "headingFont": "Google Font family name for headings",
  "bodyFont": "Google Font family name for body text",
  "borderRadius": "CSS value (e.g. 0px, 4px, 8px, 12px, 9999px)",
  "linkColor": "#hex - inline link color",
  "linkHoverColor": "#hex - link hover color",
  "buttonStyle": {
    "primaryBg": "#hex - primary button background",
    "primaryText": "#hex - primary button text",
    "primaryHoverBg": "#hex - primary button hover",
    "secondaryBg": "#hex - secondary button background",
    "secondaryText": "#hex - secondary button text",
    "secondaryHoverBg": "#hex - secondary button hover",
    "borderRadius": "CSS value or empty to inherit global",
    "variant": "filled or outline"
  },
  "darkMode": {
    "primaryColor": "#hex",
    "secondaryColor": "#hex",
    "accentColor": "#hex",
    "backgroundColor": "#hex - dark background",
    "textColor": "#hex - light text for dark bg",
    "navBackground": "#hex",
    "navTextColor": "#hex"
  }
}

Guidelines:
- Choose colors that evoke the described brand personality
- Ensure sufficient contrast between text and background (WCAG AA minimum)
- Pick Google Fonts that match the brand tone (e.g. geometric sans for tech, serif for luxury)
- The heading font should have personality; the body font should be highly readable
- Dark mode should be a cohesive inversion, not just swapped values
- Border radius should match brand personality (sharp = corporate, rounded = friendly, pill = playful)
- Button styles should be consistent with the overall color scheme`;

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
      task: 'brandingTheme',
      clientId: client.id,
      maxTokens: 2048,
      system: SYSTEM,
      prompt: `Brand description: ${description.trim()}`,
    });

    const totalTokens = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
    void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: totalTokens });

    let text = result.text;
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    const theme = JSON.parse(text);

    return NextResponse.json({ success: true, data: theme });
  } catch (err) {
    console.error('[POST /api/portal/branding/generate-theme]', err);
    return NextResponse.json({ success: false, message: 'Failed to generate theme' }, { status: 500 });
  }
}
