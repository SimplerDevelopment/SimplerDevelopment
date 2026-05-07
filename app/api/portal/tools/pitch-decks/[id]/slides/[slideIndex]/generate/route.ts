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
import { classifyEdit, minimizePayload, applyPatchResponse, isPatchResponse } from '@/lib/ai/slide-edit-optimizer';
import { getBrandingByClientId } from '@/lib/branding';
import Anthropic from '@anthropic-ai/sdk';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';

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

    const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
    if (!gate.allowed) {
      return NextResponse.json({ success: false, message: gate.message, reason: gate.reason }, { status: 402 });
    }
    const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'anthropic' });
    const anthropic = new Anthropic({ apiKey: resolved.key });

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

    // Classify the edit and optimize the payload
    const editType = classifyEdit(prompt.trim());
    const optimized = minimizePayload(currentSlide, editType);

    console.log(`[pitch-deck slide edit] type=${editType}, full=${JSON.stringify(currentSlide).length}chars, optimized=${JSON.stringify(optimized.slide).length}chars`);

    // Build dynamic system prompt from block schemas + theme + deck context
    let systemPrompt = buildSlideEditPrompt(
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

    // Append edit-type-specific instructions
    if (optimized.systemAddendum) {
      systemPrompt += optimized.systemAddendum;
    }

    // Build messages: include conversation history for multi-turn refinement
    const messages: Anthropic.MessageParam[] = [];

    if (history?.length) {
      for (const msg of history.slice(-6)) { // Keep last 3 exchanges max
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Build adjacent slide context for narrative flow (skip for style-only)
    let adjacentSection = '';
    if (!optimized.skipAdjacentSlides) {
      const adjacentContext: string[] = [];
      if (idx > 0) {
        adjacentContext.push(`Previous slide (${slides[idx - 1].label || 'Slide ' + idx}):\n${JSON.stringify(slides[idx - 1], null, 2)}`);
      }
      if (idx < slides.length - 1) {
        adjacentContext.push(`Next slide (${slides[idx + 1].label || 'Slide ' + (idx + 2)}):\n${JSON.stringify(slides[idx + 1], null, 2)}`);
      }
      if (adjacentContext.length) {
        adjacentSection = `\n\nAdjacent slides for narrative context (do NOT modify these, only use for reference):\n${adjacentContext.join('\n\n')}`;
      }
    }

    // Current turn — use optimized payload
    messages.push({
      role: 'user',
      content: `${optimized.userPrefix}\n${JSON.stringify(optimized.slide, null, 2)}\n\nInstruction: ${prompt.trim()}${adjacentSection}\n\nIMPORTANT: Only change what the instruction asks for. Preserve everything not explicitly referenced.`,
    });

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: optimized.maxTokens,
      system: systemPrompt,
      messages,
    });

    let totalInput = response.usage?.input_tokens ?? 0;
    let totalOutput = response.usage?.output_tokens ?? 0;
    let text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('');

    // If output was truncated, continue generation
    if (response.stop_reason === 'max_tokens') {
      const continuation = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: optimized.maxTokens,
        system: systemPrompt,
        messages: [
          ...messages,
          { role: 'assistant' as const, content: text },
        ],
      });
      totalInput += continuation.usage?.input_tokens ?? 0;
      totalOutput += continuation.usage?.output_tokens ?? 0;
      text += continuation.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text).join('');
    }

    void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: totalInput + totalOutput });

    // Strip markdown code fences
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    // Extract JSON from response
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
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

    // Apply response based on edit type
    let finalSlide: PitchDeckSlideV2;
    const warnings: string[] = [];

    if ((editType === 'style' || editType === 'content') && isPatchResponse(parsed)) {
      // Patch mode: merge patches into original slide (no data loss)
      finalSlide = applyPatchResponse(currentSlide, parsed, editType);
      console.log(`[pitch-deck slide edit] Applied ${editType} patch with ${(parsed as { patches: unknown[] }).patches.length} changes`);
    } else {
      // Full slide mode: validate and replace
      const { valid, slide: updatedSlide, warnings: w } = validateSlideResponse(parsed, currentSlide.id);
      if (!valid) {
        console.error('[pitch-deck slide edit] Validation failed:', w);
        return NextResponse.json({ success: false, message: 'AI response failed validation. Please try again.' }, { status: 500 });
      }
      if (w.length) warnings.push(...w);
      finalSlide = updatedSlide;
    }

    // Replace the slide at the index
    const newSlides = [...slides];
    newSlides[idx] = finalSlide;

    const [updated] = await db.update(pitchDecks).set({
      slides: newSlides,
      formatVersion: 2,
      updatedAt: new Date(),
    }).where(eq(pitchDecks.id, deck.id)).returning();

    return NextResponse.json({
      success: true,
      data: updated,
      aiResponse: text,
      editType,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (err) {
    console.error('[POST pitch-decks/[id]/slides/[slideIndex]/generate]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
