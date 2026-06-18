/**
 * Pitch-deck slide-generation prompt core (DB-free).
 *
 * The slide-generation model logic (create + max_tokens continuation + parse)
 * used to live inline in app/api/portal/tools/pitch-decks/[id]/generate. Extracted
 * here so the route AND the eval harness call the same path with just an
 * Anthropic key. The route keeps everything else — auth, credits, brand/messaging
 * context assembly, brand extraction from a URL, persistence — and assembles the
 * `userPrompt` it passes in.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';

const MODEL = 'claude-sonnet-4-6';

export const GENERATE_SYSTEM = `You are an expert pitch deck creator. You produce professional, compelling pitch decks using a block-based content system.

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

function textOf(content: Anthropic.ContentBlock[]): string {
  return content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
}

/** Strip ```json fences the model sometimes adds despite "JSON only". */
export function unfenceJson(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
}

/**
 * Run the deck-generation prompt and return the RAW concatenated text, handling
 * the `max_tokens` continuation. Parsing is left to the caller so the route can
 * keep its specific invalid-JSON error response.
 */
export async function generateDeckSlidesRaw(
  userPrompt: string,
  apiKey: string,
  systemPrompt: string = GENERATE_SYSTEM,
): Promise<{ rawText: string; inputTokens: number; outputTokens: number }> {
  const anthropic = new Anthropic({ apiKey });
  let totalInput = 0;
  let totalOutput = 0;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16384,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  totalInput += response.usage.input_tokens;
  totalOutput += response.usage.output_tokens;
  let text = textOf(response.content);

  if (response.stop_reason === 'max_tokens') {
    const continuation = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: text },
      ],
    });
    totalInput += continuation.usage.input_tokens;
    totalOutput += continuation.usage.output_tokens;
    text += textOf(continuation.content);
  }

  return { rawText: text, inputTokens: totalInput, outputTokens: totalOutput };
}

/**
 * Convenience wrapper used by the eval harness: raw generation + fence-strip +
 * parse → slides array. `parsed.slides || parsed` mirrors the route's tolerance
 * for either a wrapped or bare slides array.
 */
export async function generateDeckSlides(
  userPrompt: string,
  apiKey: string,
  systemPrompt: string = GENERATE_SYSTEM,
): Promise<{ slides: PitchDeckSlideV2[]; inputTokens: number; outputTokens: number }> {
  const { rawText, inputTokens, outputTokens } = await generateDeckSlidesRaw(userPrompt, apiKey, systemPrompt);
  const parsed = JSON.parse(unfenceJson(rawText));
  const slides = (parsed.slides || parsed) as PitchDeckSlideV2[];
  return { slides, inputTokens, outputTokens };
}
