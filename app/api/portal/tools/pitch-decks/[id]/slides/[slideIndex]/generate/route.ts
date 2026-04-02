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
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: Request, { params }: { params: Promise<{ id: string; slideIndex: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const userId = parseInt(session.user.id, 10);
    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

    const { id, slideIndex } = await params;
    const deckId = parseInt(id);
    const idx = parseInt(slideIndex);

    const [deck] = await db.select().from(pitchDecks)
      .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, client.id)))
      .limit(1);
    if (!deck) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const slides = (deck.slides || []) as PitchDeckSlideV2[];
    if (idx < 0 || idx >= slides.length) {
      return NextResponse.json({ success: false, message: 'Invalid slide index' }, { status: 400 });
    }

    const { prompt, history } = await req.json() as { prompt?: string; history?: Array<{ role: 'user' | 'assistant'; content: string }> };
    if (!prompt?.trim()) return NextResponse.json({ success: false, message: 'Prompt is required' }, { status: 400 });

    // Auto-save current state before AI slide edit
    await saveVersionSnapshot(
      deck.id,
      slides,
      deck.theme as PitchDeckTheme,
      'ai_slide_edit',
      userId,
    );

    const currentSlide = slides[idx];
    const theme = deck.theme as PitchDeckTheme;

    // Build dynamic system prompt from block schemas + theme + deck context
    const systemPrompt = buildSlideEditPrompt(
      theme,
      {
        title: deck.title,
        allSlides: slides.map((s, i) => ({ index: i, label: s.label || `Slide ${i + 1}` })),
        currentSlideIndex: idx,
      },
    );

    // Build messages: include conversation history for multi-turn refinement
    const messages: Anthropic.MessageParam[] = [];

    if (history?.length) {
      for (const msg of history.slice(-6)) { // Keep last 3 exchanges max
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Current turn — include preservation reminder alongside the slide data
    messages.push({
      role: 'user',
      content: `Current slide:\n${JSON.stringify(currentSlide, null, 2)}\n\nInstruction: ${prompt.trim()}\n\nIMPORTANT: Only change what the instruction asks for. Preserve all existing styling (style, elementStyles), content (text, headings, images, URLs), and structure that is not explicitly referenced in the instruction above.`,
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    let text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('');
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('[pitch-deck slide edit] Failed to parse AI response:', text.slice(0, 500));
      return NextResponse.json({ success: false, message: 'AI returned invalid JSON. Please try again.' }, { status: 500 });
    }

    // Validate and normalize
    const { valid, slide: updatedSlide, warnings } = validateSlideResponse(parsed, currentSlide.id);
    if (!valid) {
      console.error('[pitch-deck slide edit] Validation failed:', warnings);
      return NextResponse.json({ success: false, message: 'AI response failed validation. Please try again.' }, { status: 500 });
    }

    if (warnings.length) {
      console.warn('[pitch-deck slide edit] Warnings:', warnings);
    }

    // Replace the slide at the index
    const newSlides = [...slides];
    newSlides[idx] = updatedSlide;

    const [updated] = await db.update(pitchDecks).set({
      slides: newSlides,
      formatVersion: 2,
      updatedAt: new Date(),
    }).where(eq(pitchDecks.id, deck.id)).returning();

    return NextResponse.json({
      success: true,
      data: updated,
      // Return the AI's raw text for multi-turn history
      aiResponse: text,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (err) {
    console.error('[POST pitch-decks/[id]/slides/[slideIndex]/generate]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
