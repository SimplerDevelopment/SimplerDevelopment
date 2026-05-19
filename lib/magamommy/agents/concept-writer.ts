// Magamommy concept-writer agent.
//
// Reads a `magamommy_briefs` row (topics produced upstream by the researcher),
// asks Anthropic for 3 candidate shirt concepts on the top topic, picks ONE
// winner (the model picks; we trust its self-selection), and persists the
// winner to `magamommy_concepts`. The 2 rejected candidates ride along as
// `alternatives` for audit.
//
// Pure synthesis — no tools. Modeled on
// `lib/plugins/handlers/postcaptain-tools/draft-blog-post.ts`.

import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { magamommyBriefs, magamommyConcepts } from '@/lib/db/schema/magamommy';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';

import type { Concept, Topic } from '../types';

export interface ConceptWriterInput {
  websiteId: number;
  clientId: number;
  /** `magamommy_briefs.id` */
  briefId: number;
}

export interface ConceptWriterOutput {
  /** `magamommy_concepts.id` of the inserted winner row. */
  conceptId: number;
  /** The winning concept, parsed back into the shared type. */
  concept: Concept;
}

const SYSTEM_PROMPT = `You are the head designer for Magamommy, an apparel brand. Your core customer is the suburban / small-town Republican mom — white woman aged 30-55, kitchen-table conservative, faith-and-family-centered, classic Americana style. She wears the shirt to the grocery store, to little-league, to a backyard 4th-of-July cookout. She loves a sassy line that her group chat will laugh at.

Your job is to take a news topic and produce 3 shirt concepts, then pick the best one. Concepts must be:
- PRINTABLE (no fine detail)
- MEMORABLE (≤ 6 word slogans)
- SAFE (no individual names, no incitement, no electoral denial, no slurs)
- IN HER VOICE — punchy mom-energy, wry humor, kitchen-table phrasing. NOT 4chan, NOT angry-internet-man, NOT crude. Think "needlepoint pillow you'd actually display" not "rally sign". Slogans like "Faith. Family. Freedom." / "Make Dinner Great Again." / "Class Mom. Voting Mom." work; anything mean-spirited toward an individual or group does not.

Style families you may use:
- "bold": big block text, no imagery. Slogan dominates the garment.
- "satire": cartoon iconography (no real people), wry tone.
- "classic": vintage Americana motifs (eagle, flag, stars), bold serif type.

Hard constraints — these apply to BOTH the slogan and the visualPrompt:
- Visual prompts must describe ICONOGRAPHY, not people.
- Never include names of politicians, celebrities, journalists, or public figures.
- Never reference specific minorities.
- Stick to symbols, slogans, and abstract scenes.

OUTPUT FORMAT — VERY IMPORTANT:
Reply with a single JSON object and nothing else. No prose before or after, no markdown fences. Shape:

{
  "concepts": [
    {"slogan":"...","tagline":"...","visualPrompt":"...","palette":[{"name":"...","hex":"#......"}],"placement":"front","style":"bold"},
    {"slogan":"...","tagline":"...","visualPrompt":"...","palette":[{"name":"...","hex":"#......"}],"placement":"front","style":"satire"},
    {"slogan":"...","tagline":"...","visualPrompt":"...","palette":[{"name":"...","hex":"#......"}],"placement":"back","style":"classic"}
  ],
  "winnerIndex": 0,
  "winnerReason": "...",
  "rejectionReasons": ["why concept[1] lost","why concept[2] lost"]
}

Rules:
- Exactly 3 entries in "concepts".
- Each "palette" has 3-5 entries; every "hex" is a 7-char "#RRGGBB" string.
- Each "slogan" is at most 6 words.
- "placement" is "front" or "back". "style" is "bold", "satire", or "classic".
- "winnerIndex" is 0, 1, or 2.
- "rejectionReasons" has exactly 2 entries, one per losing concept, in concept order (skipping the winner).`;

interface ModelConceptCandidate {
  slogan: string;
  tagline: string;
  visualPrompt: string;
  palette: Array<{ name: string; hex: string }>;
  placement: 'front' | 'back';
  style: 'bold' | 'satire' | 'classic';
}

interface ModelResponse {
  concepts: ModelConceptCandidate[];
  winnerIndex: number;
  winnerReason: string;
  rejectionReasons: string[];
}

/**
 * Runs the concept-writer for a single brief. Throws on hard failure (brief
 * missing, brief empty, validation failure, or SDK failure). Callers are
 * expected to translate thrown errors into pipeline-state updates on
 * `magamommy_drops`.
 */
export async function runConceptWriter(
  input: ConceptWriterInput,
): Promise<ConceptWriterOutput> {
  const { websiteId, clientId, briefId } = input;

  // 1. Load the brief.
  const briefRows = await db
    .select({ id: magamommyBriefs.id, topics: magamommyBriefs.topics })
    .from(magamommyBriefs)
    .where(eq(magamommyBriefs.id, briefId))
    .limit(1);

  const brief = briefRows[0];
  if (!brief) {
    throw new Error(`runConceptWriter: brief not found (briefId=${briefId})`);
  }
  const topics: Topic[] = (brief.topics ?? []) as Topic[];
  if (topics.length === 0) {
    throw new Error(
      `runConceptWriter: brief has no topics (briefId=${briefId}, websiteId=${websiteId})`,
    );
  }
  const topTopic = topics[0];

  // 2. LLM call.
  const resolved = await resolveClientApiKey({ clientId, provider: 'anthropic' });
  const anthropic = new Anthropic({ apiKey: resolved.key });

  const userPrompt = [
    'Generate 3 shirt concepts for the following news topic, then pick the best one.',
    '',
    'Topic (already rank-ordered as the strongest of the week):',
    JSON.stringify(topTopic, null, 2),
    '',
    'Reminders:',
    '- 3 concepts, each in a different style family ("bold", "satire", "classic") if reasonable for the topic.',
    '- Slogans ≤ 6 words. Visual prompts describe iconography only — no people, no names.',
    '- Output the JSON envelope described in the system prompt and NOTHING else.',
  ].join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter((s) => s.length > 0)
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('runConceptWriter: model returned no text content');
  }

  // 3. Parse + validate.
  const parsed = parseAndValidate(text);
  const winner = parsed.concepts[parsed.winnerIndex];
  const losers = parsed.concepts
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => i !== parsed.winnerIndex);

  // The model returns rejectionReasons in concept-order skipping the winner.
  // Pair them by position so each loser gets the right "why it lost".
  const alternatives = losers.map(({ c }, idx) => ({
    slogan: c.slogan,
    visualPrompt: c.visualPrompt,
    rejectionReason: parsed.rejectionReasons[idx],
  }));

  // 4. Persist.
  const inserted = await db
    .insert(magamommyConcepts)
    .values({
      websiteId,
      briefId,
      topicSlug: topTopic.slug,
      slogan: winner.slogan,
      tagline: winner.tagline,
      visualPrompt: winner.visualPrompt,
      palette: winner.palette,
      placement: winner.placement,
      style: winner.style,
      alternatives,
    })
    .returning({ id: magamommyConcepts.id });

  const conceptId = inserted[0]?.id;
  if (!conceptId) {
    throw new Error('runConceptWriter: insert returned no id');
  }

  const concept: Concept = {
    topicSlug: topTopic.slug,
    slogan: winner.slogan,
    tagline: winner.tagline,
    visualPrompt: winner.visualPrompt,
    palette: winner.palette,
    placement: winner.placement,
    style: winner.style,
    alternatives,
  };

  return { conceptId, concept };
}

/**
 * Pull a JSON object out of the model's reply and validate it against the
 * shape we asked for. On validation failure we log the raw output so on-call
 * can diagnose; the throw bubbles out for the runner to record.
 */
function parseAndValidate(raw: string): ModelResponse {
  // Defensive: strip a ```json fence if the model added one despite the
  // instructions.
  let candidate = raw.trim();
  if (candidate.startsWith('```')) {
    candidate = candidate
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  // Slice from the first '{' to the last '}' to tolerate any stray prose.
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    console.error('[concept-writer] could not locate JSON in model output:', raw);
    throw new Error('runConceptWriter: model output did not contain a JSON object');
  }
  const jsonSlice = candidate.slice(firstBrace, lastBrace + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (err) {
    console.error('[concept-writer] JSON.parse failed. Raw output:', raw);
    throw new Error(
      `runConceptWriter: failed to parse model JSON: ${(err as Error).message}`,
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    console.error('[concept-writer] parsed value was not an object. Raw:', raw);
    throw new Error('runConceptWriter: model JSON was not an object');
  }

  const obj = parsed as Record<string, unknown>;
  const concepts = obj.concepts;
  const winnerIndex = obj.winnerIndex;
  const winnerReason = obj.winnerReason;
  const rejectionReasons = obj.rejectionReasons;

  if (!Array.isArray(concepts) || concepts.length !== 3) {
    console.error('[concept-writer] expected 3 concepts. Raw:', raw);
    throw new Error('runConceptWriter: expected exactly 3 concepts');
  }
  if (
    typeof winnerIndex !== 'number'
    || !Number.isInteger(winnerIndex)
    || winnerIndex < 0
    || winnerIndex > 2
  ) {
    console.error('[concept-writer] bad winnerIndex. Raw:', raw);
    throw new Error('runConceptWriter: winnerIndex must be 0, 1, or 2');
  }
  if (typeof winnerReason !== 'string') {
    console.error('[concept-writer] missing winnerReason. Raw:', raw);
    throw new Error('runConceptWriter: winnerReason must be a string');
  }
  if (!Array.isArray(rejectionReasons) || rejectionReasons.length !== 2
      || !rejectionReasons.every((r) => typeof r === 'string')) {
    console.error('[concept-writer] bad rejectionReasons. Raw:', raw);
    throw new Error('runConceptWriter: rejectionReasons must be 2 strings');
  }

  const validated: ModelConceptCandidate[] = concepts.map((c, i) => {
    if (!c || typeof c !== 'object') {
      console.error('[concept-writer] non-object concept at', i, 'Raw:', raw);
      throw new Error(`runConceptWriter: concept[${i}] is not an object`);
    }
    const cc = c as Record<string, unknown>;
    const slogan = cc.slogan;
    const tagline = cc.tagline;
    const visualPrompt = cc.visualPrompt;
    const palette = cc.palette;
    const placement = cc.placement;
    const style = cc.style;

    if (typeof slogan !== 'string' || !slogan.trim()) {
      console.error('[concept-writer] bad slogan at', i, 'Raw:', raw);
      throw new Error(`runConceptWriter: concept[${i}].slogan invalid`);
    }
    const wordCount = slogan.trim().split(/\s+/).length;
    if (wordCount > 6) {
      console.error('[concept-writer] slogan too long at', i, '-', wordCount, 'words. Raw:', raw);
      throw new Error(
        `runConceptWriter: concept[${i}].slogan exceeds 6 words (${wordCount})`,
      );
    }
    if (typeof tagline !== 'string' || !tagline.trim()) {
      console.error('[concept-writer] bad tagline at', i, 'Raw:', raw);
      throw new Error(`runConceptWriter: concept[${i}].tagline invalid`);
    }
    if (typeof visualPrompt !== 'string' || !visualPrompt.trim()) {
      console.error('[concept-writer] bad visualPrompt at', i, 'Raw:', raw);
      throw new Error(`runConceptWriter: concept[${i}].visualPrompt invalid`);
    }
    if (!Array.isArray(palette) || palette.length < 3 || palette.length > 5) {
      console.error('[concept-writer] bad palette at', i, 'Raw:', raw);
      throw new Error(`runConceptWriter: concept[${i}].palette must have 3-5 entries`);
    }
    const validatedPalette = palette.map((p, pi) => {
      if (!p || typeof p !== 'object') {
        throw new Error(`runConceptWriter: concept[${i}].palette[${pi}] not an object`);
      }
      const pp = p as Record<string, unknown>;
      if (typeof pp.name !== 'string' || !pp.name.trim()) {
        throw new Error(`runConceptWriter: concept[${i}].palette[${pi}].name invalid`);
      }
      if (typeof pp.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(pp.hex)) {
        throw new Error(
          `runConceptWriter: concept[${i}].palette[${pi}].hex must be #RRGGBB`,
        );
      }
      return { name: pp.name, hex: pp.hex };
    });
    if (placement !== 'front' && placement !== 'back') {
      console.error('[concept-writer] bad placement at', i, 'Raw:', raw);
      throw new Error(`runConceptWriter: concept[${i}].placement must be front|back`);
    }
    if (style !== 'bold' && style !== 'satire' && style !== 'classic') {
      console.error('[concept-writer] bad style at', i, 'Raw:', raw);
      throw new Error(`runConceptWriter: concept[${i}].style must be bold|satire|classic`);
    }

    return {
      slogan: slogan.trim(),
      tagline: tagline.trim(),
      visualPrompt: visualPrompt.trim(),
      palette: validatedPalette,
      placement,
      style,
    };
  });

  return {
    concepts: validated,
    winnerIndex,
    winnerReason,
    rejectionReasons: rejectionReasons as string[],
  };
}
