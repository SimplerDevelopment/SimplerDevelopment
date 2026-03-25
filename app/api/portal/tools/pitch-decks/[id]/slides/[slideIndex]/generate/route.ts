import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckTheme } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { saveVersionSnapshot } from '@/lib/pitch-deck-versions';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SLIDE_EDIT_SYSTEM = `You are an expert pitch deck editor. You modify individual slides based on user instructions.

You MUST respond with valid JSON only — no markdown, no code fences, no explanation.

Return a single slide object:
{
  "id": "keep-the-same-id",
  "type": "cover|problem|solution|features|process|metrics|testimonial|team|pricing|cta|custom",
  "headline": "string",
  "subheadline": "optional string",
  "body": "optional paragraph text",
  "bullets": ["optional", "bullet", "points"],
  "stats": [{"label": "string", "value": "string"}],
  "steps": [{"title": "string", "description": "string"}],
  "members": [{"name": "string", "role": "string"}],
  "tiers": [{"name": "string", "price": "string", "features": ["string"], "highlighted": false}],
  "columns": 3,
  "notes": "optional speaker notes"
}

## Layout control
- "columns" controls the grid layout (2, 3, 4, etc.). For example, columns: 3 with 5 stats = 3 on top, 2 centered on bottom.
- To change layout (e.g. "3 on top, 2 on bottom"), set columns to the top row count and adjust the number of items accordingly.
- You can add, remove, or reorder items in bullets/stats/steps/members/tiers arrays.
- You may change the slide type if the user's instruction implies a different layout style.
- Keep the same slide ID always.`;

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

    const slides = (deck.slides || []) as PitchDeckSlide[];
    if (idx < 0 || idx >= slides.length) {
      return NextResponse.json({ success: false, message: 'Invalid slide index' }, { status: 400 });
    }

    const { prompt } = await req.json();
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

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SLIDE_EDIT_SYSTEM,
      messages: [{
        role: 'user',
        content: `Current slide:\n${JSON.stringify(currentSlide, null, 2)}\n\nInstruction: ${prompt.trim()}`,
      }],
    });

    let text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('');
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    let updatedSlide: PitchDeckSlide;
    try {
      updatedSlide = JSON.parse(text);
    } catch {
      console.error('[pitch-deck slide edit] Failed to parse AI response:', text.slice(0, 500));
      return NextResponse.json({ success: false, message: 'AI returned invalid JSON. Please try again.' }, { status: 500 });
    }

    // Replace the slide at the index
    const newSlides = [...slides];
    newSlides[idx] = { ...updatedSlide, id: currentSlide.id };

    const [updated] = await db.update(pitchDecks).set({
      slides: newSlides,
      updatedAt: new Date(),
    }).where(eq(pitchDecks.id, deck.id)).returning();

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('[POST pitch-decks/[id]/slides/[slideIndex]/generate]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
