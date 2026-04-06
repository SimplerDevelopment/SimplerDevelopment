import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks, clientWebsites, siteBranding } from '@/lib/db/schema';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { saveVersionSnapshot } from '@/lib/pitch-deck-versions';
import { buildSlideEditPrompt } from '@/lib/ai/slide-prompt-builder';
import { validateSlideResponse } from '@/lib/ai/validate-slide-response';
import { getBrandingByClientId } from '@/lib/branding';
import Anthropic from '@anthropic-ai/sdk';

/** Extract a short text summary from a slide's blocks for AI context. */
function summarizeSlide(slide: PitchDeckSlideV2): string {
  const texts: string[] = [];
  for (const block of slide.blocks) {
    const b = block as unknown as Record<string, unknown>;
    if (b.title && typeof b.title === 'string') texts.push(b.title.replace(/<[^>]+>/g, ''));
    if (b.content && typeof b.content === 'string') texts.push(b.content.replace(/<[^>]+>/g, ''));
    if (b.description && typeof b.description === 'string') texts.push(b.description.replace(/<[^>]+>/g, ''));
    if (texts.join(' ').length > 200) break;
  }
  const summary = texts.join(' | ').slice(0, 250);
  return summary || '(empty)';
}

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

    // Load brand info for richer context
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

    // Build dynamic system prompt from block schemas + theme + deck context
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
        currentSlideIndex: idx,
        brandInfo,
      },
    );

    // Build messages: include conversation history for multi-turn refinement
    const messages: Anthropic.MessageParam[] = [];

    if (history?.length) {
      for (const msg of history.slice(-6)) { // Keep last 3 exchanges max
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Build adjacent slide context for narrative flow
    const adjacentContext: string[] = [];
    if (idx > 0) {
      adjacentContext.push(`Previous slide (${slides[idx - 1].label || 'Slide ' + idx}):\n${JSON.stringify(slides[idx - 1], null, 2)}`);
    }
    if (idx < slides.length - 1) {
      adjacentContext.push(`Next slide (${slides[idx + 1].label || 'Slide ' + (idx + 2)}):\n${JSON.stringify(slides[idx + 1], null, 2)}`);
    }
    const adjacentSection = adjacentContext.length
      ? `\n\nAdjacent slides for narrative context (do NOT modify these, only use for reference):\n${adjacentContext.join('\n\n')}`
      : '';

    // Current turn — include preservation reminder alongside the slide data
    messages.push({
      role: 'user',
      content: `Current slide:\n${JSON.stringify(currentSlide, null, 2)}\n\nInstruction: ${prompt.trim()}${adjacentSection}\n\nIMPORTANT: Only change what the instruction asks for. Preserve all existing styling (style, elementStyles), content (text, headings, images, URLs), and structure that is not explicitly referenced in the instruction above. Ensure the edited slide flows naturally with the surrounding slides.`,
    });

    // Scale max_tokens based on slide complexity to avoid truncation
    const slideJsonSize = JSON.stringify(currentSlide).length;
    const maxTokens = Math.max(4096, Math.min(16384, Math.ceil(slideJsonSize / 2) + 2048));

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    let text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('');

    // If output was truncated, continue generation
    if (response.stop_reason === 'max_tokens') {
      const continuation = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          ...messages,
          { role: 'assistant' as const, content: text },
        ],
      });
      text += continuation.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text).join('');
    }

    // Strip markdown code fences
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    // Extract JSON object from response — handle explanation text before/after
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try to extract JSON object from within the text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          console.error('[pitch-deck slide edit] Failed to parse AI response:', text.slice(0, 500), '...', text.slice(-200));
          return NextResponse.json({ success: false, message: 'AI returned invalid JSON. Please try again.' }, { status: 500 });
        }
      } else {
        console.error('[pitch-deck slide edit] No JSON found in AI response:', text.slice(0, 500));
        return NextResponse.json({ success: false, message: 'AI returned invalid JSON. Please try again.' }, { status: 500 });
      }
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
