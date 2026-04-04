import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks, aiConversations, aiMessages } from '@/lib/db/schema';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { saveVersionSnapshot } from '@/lib/pitch-deck-versions';
import { hasCredits, deductCredits, getBalance } from '@/lib/ai-credits';
import { getBrandingByClientId, getBrandingByProfileId, brandingToPitchDeckTheme } from '@/lib/branding';
import { brandingMessaging } from '@/lib/db/schema';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const GENERATE_SYSTEM = `You are an expert pitch deck creator. You produce professional, compelling pitch decks using a block-based content system.

You MUST respond with valid JSON only — no markdown, no code fences, no explanation text.

The JSON must have this exact structure:
{
  "slides": [
    {
      "id": "unique-string",
      "label": "Cover|Problem|Solution|Features|Metrics|Team|Pricing|Call to Action|etc.",
      "blocks": [ ...array of block objects... ],
      "notes": "optional speaker notes"
    }
  ]
}

Each block in the "blocks" array must have "id" (unique string), "type", and "order" (sequential integer starting at 1).

Available block types:

1. hero — Full-width banner for cover/title slides
   { "id": "...", "type": "hero", "order": 1, "title": "string", "subtitle": "optional", "description": "optional", "ctaText": "optional button", "ctaLink": "optional url" }

2. heading — Section titles
   { "id": "...", "type": "heading", "order": 1, "content": "string", "level": 1|2|3, "alignment": "left|center|right" }

3. text — Paragraph content
   { "id": "...", "type": "text", "order": 2, "content": "string", "alignment": "left|center|right", "size": "sm|base|lg|xl" }

4. stats — Numeric metrics display
   { "id": "...", "type": "stats", "order": 2, "title": "optional", "stats": [{"id": "...", "value": "100+", "label": "Clients"}], "columns": 2|3|4 }

5. card-grid — Grid of content cards (features, team, steps, bullets)
   { "id": "...", "type": "card-grid", "order": 2, "title": "optional", "cards": [{"id": "...", "title": "string", "description": "string", "icon": "optional material icon name"}], "columns": 2|3|4 }

6. testimonial — Quote/testimonial
   { "id": "...", "type": "testimonial", "order": 2, "quote": "string", "author": "string", "role": "optional", "company": "optional" }

7. cta — Call to action section
   { "id": "...", "type": "cta", "order": 2, "title": "string", "description": "optional", "primaryButtonText": "string", "primaryButtonUrl": "#", "backgroundStyle": "gradient|solid|none" }

8. image — Display an image
   { "id": "...", "type": "image", "order": 2, "url": "https://...", "alt": "string" }

9. spacer — Vertical spacing
   { "id": "...", "type": "spacer", "order": 2, "height": "sm|md|lg" }

10. divider — Horizontal line
    { "id": "...", "type": "divider", "order": 2, "lineStyle": "solid|dashed" }

Guidelines:
- Generate 8-12 slides for a complete pitch deck
- First slide should use a "hero" block, last slide should use a "cta" block
- Use compelling, concise language — this is a presentation, not an essay
- Each slide should have 1-4 blocks (keep it focused)
- Use card-grid for features, team members, process steps, pricing tiers, and bullet lists
- Use stats for numeric metrics
- Use testimonial for quotes
- Make all IDs unique across the entire deck (use descriptive IDs like "slide-1", "block-cover-hero", etc.)
- Make the content specific to the company/topic, not generic
- If company messaging is provided, USE IT to write slide content — weave in the company name, tagline, value proposition, differentiators, elevator pitch, and social proof into relevant slides
- Match the provided tone of voice and writing style throughout
- Use the target audience info to frame the narrative (who the deck is speaking to and their pain points)`;

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

    const { id } = await params;
    const deckId = parseInt(id);
    const [deck] = await db.select().from(pitchDecks)
      .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, client.id)))
      .limit(1);
    if (!deck) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const { prompt, websiteUrl } = await req.json();
    if (!prompt?.trim()) return NextResponse.json({ success: false, message: 'Prompt is required' }, { status: 400 });

    // Check AI credits (skip in development)
    if (process.env.NODE_ENV === 'production') {
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
        const siteRes = await fetch(websiteUrl.trim(), {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SimplerDev/1.0)' },
          signal: AbortSignal.timeout(10000),
        });
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

    // Use extended token limit for full deck generation (8-12 slides)
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: GENERATE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    let text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('');

    // If output was truncated, continue generation
    if (response.stop_reason === 'max_tokens') {
      const continuation = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: GENERATE_SYSTEM,
        messages: [
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: text },
        ],
      });
      totalInput += continuation.usage.input_tokens;
      totalOutput += continuation.usage.output_tokens;
      text += continuation.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text).join('');
    }

    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

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

    // Deduct AI credits
    if (process.env.NODE_ENV === 'production') {
      const totalTokens = totalInput + totalOutput;
      await deductCredits(client.id, totalTokens, 'pitch-decks', String(deckId), `Pitch deck: ${deck.title}`);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/portal/tools/pitch-decks/[id]/generate]', errMsg, err);
    return NextResponse.json({ success: false, message: `Generation failed: ${errMsg}` }, { status: 500 });
  }
}
