import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { saveVersionSnapshot } from '@/lib/pitch-deck-versions';
import { buildSlideEditPrompt } from '@/lib/ai/slide-prompt-builder';
import { validateSlideResponse } from '@/lib/ai/validate-slide-response';
import { getBrandingByClientId } from '@/lib/branding';
import Anthropic from '@anthropic-ai/sdk';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';

function summarizeSlide(slide: PitchDeckSlideV2): string {
  const texts: string[] = [];
  for (const block of slide.blocks) {
    const b = block as unknown as Record<string, unknown>;
    if (b.title && typeof b.title === 'string') texts.push(b.title.replace(/<[^>]+>/g, ''));
    if (b.content && typeof b.content === 'string') texts.push(b.content.replace(/<[^>]+>/g, ''));
    if (b.description && typeof b.description === 'string') texts.push(b.description.replace(/<[^>]+>/g, ''));
    if (texts.join(' ').length > 200) break;
  }
  return texts.join(' | ').slice(0, 250) || '(empty)';
}

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

    const { prompt, slideIndices } = await req.json() as { prompt?: string; slideIndices?: number[] };
    if (!prompt?.trim()) return NextResponse.json({ success: false, message: 'Prompt is required' }, { status: 400 });
    if (!slideIndices?.length) return NextResponse.json({ success: false, message: 'No slides selected' }, { status: 400 });

    const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
    if (!gate.allowed) {
      return NextResponse.json({ success: false, message: gate.message, reason: gate.reason }, { status: 402 });
    }
    const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'anthropic' });
    const anthropic = new Anthropic({ apiKey: resolved.key });

    const slides = (deck.slides || []) as PitchDeckSlideV2[];
    const validIndices = slideIndices.filter(i => i >= 0 && i < slides.length);
    if (!validIndices.length) return NextResponse.json({ success: false, message: 'Invalid slide indices' }, { status: 400 });

    // Snapshot before batch edit
    await saveVersionSnapshot(deck.id, slides, deck.theme as PitchDeckTheme, 'ai_slide_edit', userId);

    const theme = deck.theme as PitchDeckTheme;

    // Load brand info
    let brandInfo: { headingFont?: string; bodyFont?: string; primaryColor?: string; accentColor?: string; logoText?: string } | null = null;
    try {
      const branding = await getBrandingByClientId(client.id);
      brandInfo = {
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
        headingFont: branding.headingFont || undefined,
        bodyFont: branding.bodyFont || undefined,
        logoText: branding.logoText || undefined,
      };
    } catch { /* non-critical */ }

    // Build system prompt with full deck context
    const systemPrompt = buildSlideEditPrompt(
      theme,
      {
        title: deck.title,
        description: deck.description,
        allSlides: slides.map((s, i) => ({
          index: i,
          label: s.label || `Slide ${i + 1}`,
          contentSummary: summarizeSlide(s),
          notes: s.notes,
        })),
        currentSlideIndex: validIndices[0],
        brandInfo,
      },
    ).replace(
      // Override the single-slide framing to batch framing
      'You modify individual slides based on natural language instructions.',
      'You modify multiple slides at once based on a single instruction, applying changes consistently across all targeted slides.',
    );

    // Build the slides payload — send all targeted slides
    const targetedSlides = validIndices.map(i => ({
      index: i,
      slide: slides[i],
    }));

    const batchSystemAddendum = `

# Batch Edit Mode
You are editing ${validIndices.length} slides at once. Return a JSON array of the edited slides in the same order they were provided.
Each slide must retain its original "id". Apply the instruction consistently across all slides.

Response format:
{
  "slides": [
    { "id": "original-id", "label": "...", "blocks": [...], "notes": "..." },
    ...
  ]
}`;

    const messages: Anthropic.MessageParam[] = [{
      role: 'user',
      content: `Slides to edit:\n${JSON.stringify(targetedSlides.map(t => t.slide), null, 2)}\n\nInstruction to apply to ALL these slides: ${prompt.trim()}\n\nIMPORTANT: Apply the instruction consistently across every slide. Preserve all existing styling, structure, and content that is not targeted by the instruction. Ensure slides maintain their narrative flow within the deck.`,
    }];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt + batchSystemAddendum,
      messages,
    });

    let totalInput = response.usage?.input_tokens ?? 0;
    let totalOutput = response.usage?.output_tokens ?? 0;
    let text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('');

    // Handle truncation
    if (response.stop_reason === 'max_tokens') {
      const continuation = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt + batchSystemAddendum,
        messages: [
          ...messages,
          { role: 'assistant', content: text },
        ],
      });
      totalInput += continuation.usage?.input_tokens ?? 0;
      totalOutput += continuation.usage?.output_tokens ?? 0;
      text += continuation.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text).join('');
    }

    void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: totalInput + totalOutput });

    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    let parsedSlides: unknown[];
    try {
      const parsed = JSON.parse(text);
      parsedSlides = parsed.slides || parsed;
      if (!Array.isArray(parsedSlides)) throw new Error('Expected array');
    } catch {
      console.error('[batch-edit] Failed to parse AI response:', text.slice(0, 500));
      return NextResponse.json({ success: false, message: 'AI returned invalid JSON. Please try again.' }, { status: 500 });
    }

    // Validate each slide and merge back
    const newSlides = [...slides];
    const warnings: string[] = [];

    for (let i = 0; i < Math.min(parsedSlides.length, validIndices.length); i++) {
      const targetIdx = validIndices[i];
      const originalId = slides[targetIdx].id;
      const { valid, slide: validated, warnings: w } = validateSlideResponse(parsedSlides[i], originalId);
      if (valid) {
        newSlides[targetIdx] = validated;
      } else {
        warnings.push(`Slide ${targetIdx + 1} validation failed: ${w.join(', ')}`);
      }
      if (w.length) warnings.push(...w.map(ww => `Slide ${targetIdx + 1}: ${ww}`));
    }

    const [updated] = await db.update(pitchDecks).set({
      slides: newSlides,
      formatVersion: 2,
      updatedAt: new Date(),
    }).where(eq(pitchDecks.id, deck.id)).returning();

    return NextResponse.json({
      success: true,
      data: updated,
      editedCount: Math.min(parsedSlides.length, validIndices.length),
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (err) {
    console.error('[POST pitch-decks/[id]/slides/batch-edit]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
