import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks, aiConversations, aiMessages } from '@/lib/db/schema';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { hasServiceAccess } from '@/lib/portal-auth';
import { saveVersionSnapshot } from '@/lib/pitch-deck-versions';
import { hasCredits, deductCredits, getBalance } from '@/lib/ai-credits';
import { getBrandingByClientId, getBrandingByProfileId, brandingToPitchDeckTheme } from '@/lib/branding';
import { assertSafeUrl } from '@/lib/ssrf-guard';
import { brandingMessaging } from '@/lib/db/schema';
import Anthropic from '@anthropic-ai/sdk';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { generateDeckSlidesRaw, unfenceJson } from '@/lib/ai/pitch-deck-generate';

const BRAND_SYSTEM = `You are a brand analyst. Given website HTML content, extract the brand identity.

You MUST respond with valid JSON only — no markdown, no code fences, no explanation.

{
  "primaryColor": "#hex - main brand color",
  "accentColor": "#hex - secondary/accent color",
  "backgroundColor": "#hex - dark background for presentation",
  "textColor": "#hex - light text color for dark background",
  "headingFont": "font family name for headings",
  "bodyFont": "font family name for body text",
  "companyName": "extracted company name",
  "tagline": "extracted tagline if found",
  "industry": "detected industry"
}

If you can't determine specific values, use professional defaults:
- primaryColor: #1a2744 (dark navy)
- accentColor: #c9a84c (gold)
- backgroundColor: #0f1b2d
- textColor: #ffffff
- headingFont: Cormorant Garamond
- bodyFont: Plus Jakarta Sans`;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const userId = parseInt(session.user.id, 10);
    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    if (!(await hasServiceAccess(client.id, 'pitch-decks'))) return NextResponse.json({ success: false, message: 'This feature requires an active pitch-decks subscription.', requiresService: 'pitch-decks', upsellUrl: '/portal/services' }, { status: 403 });

    const { id } = await params;
    const deckId = parseInt(id);
    const [deck] = await db.select().from(pitchDecks)
      .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, client.id)))
      .limit(1);
    if (!deck) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const { prompt, websiteUrl } = await req.json();
    if (!prompt?.trim()) return NextResponse.json({ success: false, message: 'Prompt is required' }, { status: 400 });

    const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
    if (!gate.allowed) {
      return NextResponse.json({ success: false, message: gate.message, reason: gate.reason }, { status: 402 });
    }
    const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'anthropic' });
    const anthropic = new Anthropic({ apiKey: resolved.key });

    // Check AI credits (skip in development; skip when BYOK — client pays directly)
    if (process.env.NODE_ENV === 'production' && resolved.source === 'platform') {
      const canProceed = await hasCredits(client.id, 5000);
      if (!canProceed) {
        const bal = await getBalance(client.id);
        return NextResponse.json({
          success: false,
          message: 'Insufficient AI credits for deck generation.',
          creditsRemaining: bal.balance,
        }, { status: 402 });
      }
    }

    // Auto-save current state before AI generation
    await saveVersionSnapshot(
      deck.id,
      (deck.slides || []) as PitchDeckSlideV2[],
      deck.theme as PitchDeckTheme,
      (deck.slides as PitchDeckSlideV2[])?.length > 0 ? 'ai_regenerate' : 'ai_generate',
      userId,
    );

    // Track in AI conversations
    const [conv] = await db.insert(aiConversations).values({
      clientId: client.id,
      title: `Pitch Deck: ${deck.title}`,
    }).returning();

    let theme: PitchDeckTheme = deck.theme as PitchDeckTheme;
    let brandContext = '';
    let totalInput = 0;
    let totalOutput = 0;

    // Step 1: Load branding — prefer deck's assigned profile, then client branding,
    // fall back to AI extraction from URL if nothing configured.
    const deckProfileId = (deck as Record<string, unknown>).brandingProfileId as number | null;
    const clientBranding = deckProfileId
      ? await getBrandingByProfileId(deckProfileId)
      : await getBrandingByClientId(client.id);
    const hasSiteBranding = clientBranding.primaryColor !== '#2563eb' ||
      clientBranding.headingFont || clientBranding.logoUrl;

    if (hasSiteBranding) {
      // Use the shared siteBranding — no AI call needed
      theme = brandingToPitchDeckTheme(clientBranding);
      brandContext = `Brand colors: primary ${clientBranding.primaryColor}, accent ${clientBranding.accentColor}. Fonts: ${clientBranding.headingFont || 'default'} / ${clientBranding.bodyFont || 'default'}.`;
    } else if (websiteUrl?.trim()) {
      // No siteBranding configured — fall back to AI extraction from URL
      try {
        const trimmedUrl = websiteUrl.trim();
        // SSRF guard — re-resolve DNS at fetch time, reject private/loopback.
        await assertSafeUrl(trimmedUrl);
        const siteRes = await fetch(trimmedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SimplerDev/1.0)' },
          redirect: 'manual',
          signal: AbortSignal.timeout(10000),
        });
        if (siteRes.status >= 300 && siteRes.status < 400) {
          throw new Error('Refusing to follow redirect (SSRF guard).');
        }
        const html = await siteRes.text();
        const truncatedHtml = html.slice(0, 15000);

        const brandResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: BRAND_SYSTEM,
          messages: [{ role: 'user', content: `Extract brand identity from this website HTML:\n\n${truncatedHtml}` }],
        });

        totalInput += brandResponse.usage.input_tokens;
        totalOutput += brandResponse.usage.output_tokens;

        let brandText = brandResponse.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text).join('');
        brandText = brandText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

        const brandData = JSON.parse(brandText);
        theme = {
          primaryColor: brandData.primaryColor || theme.primaryColor,
          accentColor: brandData.accentColor || theme.accentColor,
          backgroundColor: brandData.backgroundColor || theme.backgroundColor,
          textColor: brandData.textColor || theme.textColor,
          headingFont: brandData.headingFont || theme.headingFont,
          bodyFont: brandData.bodyFont || theme.bodyFont,
          logo: brandData.logo || theme.logo,
        };
        brandContext = `Company: ${brandData.companyName || 'Unknown'}. Industry: ${brandData.industry || 'Unknown'}. Tagline: ${brandData.tagline || 'N/A'}.`;
      } catch {
        brandContext = `Website URL provided: ${websiteUrl} (could not fetch details)`;
      }
    }

    // Load messaging context — try profile-specific first, fall back to default (null profile)
    let messagingContext = '';
    try {
      const profileCondition = deckProfileId
        ? and(eq(brandingMessaging.clientId, client.id), eq(brandingMessaging.brandingProfileId, deckProfileId))
        : and(eq(brandingMessaging.clientId, client.id), isNull(brandingMessaging.brandingProfileId));
      let [msg] = await db.select().from(brandingMessaging).where(profileCondition).limit(1);
      // If profile-specific messaging is empty, fall back to default
      if (!msg && deckProfileId) {
        [msg] = await db.select().from(brandingMessaging)
          .where(and(eq(brandingMessaging.clientId, client.id), isNull(brandingMessaging.brandingProfileId)))
          .limit(1);
      }
      if (msg) {
        const parts: string[] = [];
        if (msg.companyName) parts.push(`Company Name: ${msg.companyName}`);
        if (msg.tagline) parts.push(`Tagline: ${msg.tagline}`);
        if (msg.industry) parts.push(`Industry: ${msg.industry}`);
        if (msg.missionStatement) parts.push(`Mission: ${msg.missionStatement}`);
        if (msg.visionStatement) parts.push(`Vision: ${msg.visionStatement}`);
        if (msg.valueProposition) parts.push(`Value Proposition: ${msg.valueProposition}`);
        if (msg.elevatorPitch) parts.push(`Elevator Pitch: ${msg.elevatorPitch}`);
        if (msg.boilerplate) parts.push(`Company Description: ${msg.boilerplate}`);
        if (msg.targetAudience) parts.push(`Target Audience: ${msg.targetAudience}`);
        if (msg.toneOfVoice) parts.push(`Tone of Voice: ${msg.toneOfVoice}`);
        if (msg.brandPersonality) parts.push(`Brand Personality: ${msg.brandPersonality}`);
        if (msg.writingStyle) parts.push(`Writing Style: ${msg.writingStyle}`);
        const diffArray = msg.keyDifferentiators as string[] | null;
        if (diffArray?.length) parts.push(`Key Differentiators: ${diffArray.join('; ')}`);
        if (msg.socialProof) parts.push(`Social Proof: ${msg.socialProof}`);
        if (msg.keyClients) parts.push(`Key Clients: ${msg.keyClients}`);
        if (msg.certifications) parts.push(`Certifications: ${msg.certifications}`);
        if (msg.yearFounded) parts.push(`Founded: ${msg.yearFounded}`);
        if (msg.companySize) parts.push(`Company Size: ${msg.companySize}`);
        if (msg.headquarters) parts.push(`Headquarters: ${msg.headquarters}`);
        if (msg.additionalContext) parts.push(`Additional Context: ${msg.additionalContext}`);
        if (parts.length) messagingContext = `# Company Messaging — use this to write authentic, on-brand slide content:\n${parts.join('\n')}`;
      }
    } catch { /* messaging is optional */ }

    // Step 2: Generate slides
    const contextParts: string[] = [];
    if (brandContext) contextParts.push(brandContext);
    if (messagingContext) contextParts.push(messagingContext);
    const userPrompt = contextParts.length
      ? `${contextParts.join('\n\n')}\n\nUser request: ${prompt.trim()}`
      : prompt.trim();

    // Use extended token limit for full deck generation (8-12 slides); the core
    // handles the max_tokens continuation. Parsing stays here so the route keeps
    // its specific invalid-JSON response.
    const { rawText, inputTokens: genInput, outputTokens: genOutput } = await generateDeckSlidesRaw(userPrompt, resolved.key);
    totalInput += genInput;
    totalOutput += genOutput;

    const text = unfenceJson(rawText);

    let slides: PitchDeckSlideV2[];
    try {
      const parsed = JSON.parse(text);
      slides = parsed.slides || parsed;
    } catch {
      console.error('[pitch-deck generate] Failed to parse AI response:', text.slice(0, 500), '...', text.slice(-200));
      return NextResponse.json({ success: false, message: 'AI returned invalid JSON. Please try again.' }, { status: 500 });
    }

    // Save to deck (v2 block format)
    const [updated] = await db.update(pitchDecks).set({
      slides,
      theme,
      formatVersion: 2,
      sourceUrl: websiteUrl?.trim() || deck.sourceUrl,
      updatedAt: new Date(),
    }).where(eq(pitchDecks.id, deck.id)).returning();

    // Log AI usage
    await db.insert(aiMessages).values({
      conversationId: conv.id,
      role: 'user',
      content: `Generate pitch deck: ${prompt.trim()}${websiteUrl ? `\nWebsite: ${websiteUrl}` : ''}`,
      inputTokens: 0,
      outputTokens: 0,
    });
    await db.insert(aiMessages).values({
      conversationId: conv.id,
      role: 'assistant',
      content: `Generated ${slides.length} slides for "${deck.title}"`,
      inputTokens: totalInput,
      outputTokens: totalOutput,
    });

    // Deduct AI credits — only for platform-keyed calls. BYOK clients pay
    // their provider directly so internal credit deduction is skipped.
    const totalTokens = totalInput + totalOutput;
    if (process.env.NODE_ENV === 'production' && resolved.source === 'platform') {
      await deductCredits(client.id, totalTokens, 'pitch-decks', String(deckId), `Pitch deck: ${deck.title}`);
    }
    void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: totalTokens });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/portal/tools/pitch-decks/[id]/generate]', errMsg, err);
    return NextResponse.json({ success: false, message: `Generation failed: ${errMsg}` }, { status: 500 });
  }
}
