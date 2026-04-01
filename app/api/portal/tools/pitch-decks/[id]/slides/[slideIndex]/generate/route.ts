import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { saveVersionSnapshot } from '@/lib/pitch-deck-versions';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SLIDE_EDIT_SYSTEM = `You are an expert pitch deck editor. You modify individual slides based on user instructions.

You MUST respond with valid JSON only — no markdown, no code fences, no explanation.

A slide has this structure:
{
  "id": "keep-the-same-id",
  "label": "Slide Label",
  "blocks": [ ...array of block objects... ],
  "notes": "optional speaker notes"
}

Each block must have "id" (unique string), "type", and "order" (sequential integer).

Available block types:

1. hero — { "type": "hero", "title": "string", "subtitle": "optional", "description": "optional", "ctaText": "optional", "ctaLink": "optional" }
2. heading — { "type": "heading", "content": "string", "level": 1|2|3, "alignment": "left|center|right" }
3. text — { "type": "text", "content": "string", "alignment": "left|center|right", "size": "sm|base|lg|xl" }
4. stats — { "type": "stats", "title": "optional", "stats": [{"id": "...", "value": "100+", "label": "Clients"}], "columns": 2|3|4 }
5. card-grid — { "type": "card-grid", "title": "optional", "cards": [{"id": "...", "title": "string", "description": "string", "icon": "optional"}], "columns": 2|3|4 }
6. testimonial — { "type": "testimonial", "quote": "string", "author": "string", "role": "optional", "company": "optional" }
7. cta — { "type": "cta", "title": "string", "description": "optional", "primaryButtonText": "string", "primaryButtonUrl": "#", "backgroundStyle": "gradient|solid|none" }
8. image — { "type": "image", "url": "https://...", "alt": "string" }
9. spacer — { "type": "spacer", "height": "sm|md|lg" }
10. divider — { "type": "divider", "lineStyle": "solid|dashed" }

Rules:
- Keep the same slide ID always
- You can add, remove, reorder, or change block types
- Update the label if the slide's purpose changes
- Keep blocks focused — 1-4 blocks per slide`;

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

    let updatedSlide: PitchDeckSlideV2;
    try {
      updatedSlide = JSON.parse(text);
    } catch {
      console.error('[pitch-deck slide edit] Failed to parse AI response:', text.slice(0, 500));
      return NextResponse.json({ success: false, message: 'AI returned invalid JSON. Please try again.' }, { status: 500 });
    }

    // Replace the slide at the index, preserving the original ID
    const newSlides = [...slides];
    newSlides[idx] = { ...updatedSlide, id: currentSlide.id };

    const [updated] = await db.update(pitchDecks).set({
      slides: newSlides,
      formatVersion: 2,
      updatedAt: new Date(),
    }).where(eq(pitchDecks.id, deck.id)).returning();

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('[POST pitch-decks/[id]/slides/[slideIndex]/generate]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
