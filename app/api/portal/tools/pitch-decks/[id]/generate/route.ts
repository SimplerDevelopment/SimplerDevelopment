import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks, aiConversations, aiMessages } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckTheme } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { saveVersionSnapshot } from '@/lib/pitch-deck-versions';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const GENERATE_SYSTEM = `You are an expert pitch deck creator. You produce professional, compelling pitch decks.

You MUST respond with valid JSON only — no markdown, no code fences, no explanation text.

The JSON must have this exact structure:
{
  "slides": [
    {
      "id": "unique-string",
      "type": "cover|problem|solution|features|process|metrics|testimonial|team|pricing|cta|custom",
      "headline": "string",
      "subheadline": "optional string",
      "body": "optional paragraph text",
      "bullets": ["optional", "bullet", "points"],
      "stats": [{"label": "string", "value": "string"}],
      "steps": [{"title": "string", "description": "string"}],
      "members": [{"name": "string", "role": "string"}],
      "tiers": [{"name": "string", "price": "string", "features": ["string"], "highlighted": false}],
      "notes": "optional speaker notes"
    }
  ]
}

Guidelines:
- Generate 8-12 slides for a complete pitch deck
- First slide must be type "cover", last slide should be type "cta"
- Use compelling, concise language — this is a presentation, not an essay
- Each slide should have a clear headline
- Use the appropriate type for each slide's content
- Only include fields relevant to the slide type (e.g. stats for metrics, bullets for features)
- Make the content specific to the company/topic, not generic`;

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

    // Auto-save current state before AI generation
    await saveVersionSnapshot(
      deck.id,
      (deck.slides || []) as PitchDeckSlide[],
      deck.theme as PitchDeckTheme,
      (deck.slides as PitchDeckSlide[])?.length > 0 ? 'ai_regenerate' : 'ai_generate',
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

    // Step 1: Extract branding from website if URL provided
    if (websiteUrl?.trim()) {
      try {
        const siteRes = await fetch(websiteUrl.trim(), {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SimplerDev/1.0)' },
          signal: AbortSignal.timeout(10000),
        });
        const html = await siteRes.text();
        // Truncate to avoid token limits
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
        // Brand extraction failed — continue with defaults
        brandContext = `Website URL provided: ${websiteUrl} (could not fetch details)`;
      }
    }

    // Step 2: Generate slides
    const userPrompt = brandContext
      ? `${brandContext}\n\nUser request: ${prompt.trim()}`
      : prompt.trim();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: GENERATE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    let text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('');

    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    let slides: PitchDeckSlide[];
    try {
      const parsed = JSON.parse(text);
      slides = parsed.slides || parsed;
    } catch {
      console.error('[pitch-deck generate] Failed to parse AI response:', text.slice(0, 500));
      return NextResponse.json({ success: false, message: 'AI returned invalid JSON. Please try again.' }, { status: 500 });
    }

    // Save to deck
    const [updated] = await db.update(pitchDecks).set({
      slides,
      theme,
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

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/portal/tools/pitch-decks/[id]/generate]', errMsg, err);
    return NextResponse.json({ success: false, message: `Generation failed: ${errMsg}` }, { status: 500 });
  }
}
