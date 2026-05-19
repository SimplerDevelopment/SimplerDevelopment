// Magamommy researcher agent.
//
// Calls Anthropic with the native web_search tool to harvest the 3 most-talked-about
// Republican-leaning political stories of the past 7 days, structured for the
// downstream concept-writer. Persists the result into `magamommy_briefs` and
// returns the row id along with the parsed topics.
//
// Tool-use loop: web_search_20250305 is a SERVER-SIDE tool — Anthropic executes
// the search and threads the result back into the next assistant turn. We don't
// run a manual tool dispatcher; we simply loop on `messages.create()` until the
// model emits `stop_reason === 'end_turn'`. Pattern mirrors
// `lib/plugins/handlers/postcaptain-tools/research-brief.ts`.

import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { magamommyBriefs } from '@/lib/db/schema';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import type { Topic } from '../types';

const SYSTEM_PROMPT = `You are a culture researcher for an apparel brand whose customers are conservative-leaning Americans. Your job is to identify the 3 most-talked-about political stories from the past 7 days.

Search anchor sites first — start every research session with web_search queries scoped to these domains, in this order:
  - foxnews.com
  - breitbart.com
  - dailywire.com
  - newsmax.com
  - nationalreview.com
Then broaden the search if you need additional corroboration or context.

Safety filter (HARD requirements — failing any of these disqualifies a topic):
  - Do NOT propose topics that target individuals by name (politicians, public figures, journalists).
  - Do NOT propose anything that incites violence.
  - Do NOT propose anything that discriminates by protected class (race, religion, national origin, sex, sexual orientation, gender identity, disability, age).
  - Do NOT propose election denial.
  - DO stick to policy debates, cultural moments, and slogans.

Pick the 3 stories with the broadest cultural resonance — the ones a t-shirt slogan could plausibly riff on without naming a person or breaking the safety rules above.

Output format — return ONLY a JSON object (no prose, no markdown fences, no preamble) matching exactly:

{
  "topics": [
    {
      "slug": "kebab-case-id-max-60-chars",
      "headline": "<=120 char central claim",
      "context": "2-3 sentences on why this is in the news right now, with dates",
      "sourceUrls": ["https://...", "https://..."]
    }
  ]
}

Every topic MUST include 1-5 sourceUrls drawn from your web_search results. Use web_search aggressively — you have up to 8 searches.`;

export interface ResearcherInput {
  /** The magamommy client (tenant). Used to resolve BYOK Anthropic key. */
  clientId: number;
  /** The magamommy site that this brief belongs to. */
  websiteId: number;
  /** Monday of the drop week, UTC. */
  weekOf: Date;
}

export interface ResearcherOutput {
  /** Primary key of the inserted magamommy_briefs row. */
  briefId: number;
  topics: Topic[];
  /** Full final assistant text — persisted for audit / debugging. */
  rawModelResponse: string;
}

/**
 * Format a JS Date as YYYY-MM-DD in UTC, matching the `date` column shape.
 */
function formatWeekOf(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Strip code fences / leading prose so JSON.parse has a clean shot.
 * The system prompt asks for JSON-only, but models occasionally wrap.
 */
function extractJsonBlob(text: string): string {
  const trimmed = text.trim();
  // Fenced code block — ```json ... ``` or ``` ... ```.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  // Otherwise grab from first { to last } — tolerates leading commentary.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

/**
 * Coerce a single object from the model into our Topic shape, with defensive
 * fallbacks. Skips silently-invalid entries (caller validates emptiness).
 */
function coerceTopic(raw: unknown): Topic | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const slug = typeof o.slug === 'string' ? o.slug.trim().slice(0, 60) : '';
  const headline = typeof o.headline === 'string' ? o.headline.trim().slice(0, 120) : '';
  const context = typeof o.context === 'string' ? o.context.trim() : '';
  const sourceUrls = Array.isArray(o.sourceUrls)
    ? o.sourceUrls.filter((u): u is string => typeof u === 'string').slice(0, 5)
    : [];
  if (!slug || !headline) return null;
  return { slug, headline, context, sourceUrls };
}

/**
 * Run the researcher agent end-to-end: loop on Anthropic until `end_turn`,
 * parse the final JSON, persist to magamommy_briefs, return the row id.
 *
 * Throws on:
 *   - missing API key (via resolveClientApiKey)
 *   - JSON parse failure
 *   - empty topics array
 */
export async function runResearcher(input: ResearcherInput): Promise<ResearcherOutput> {
  const { clientId, websiteId, weekOf } = input;
  console.log(
    `[researcher] starting clientId=${clientId} websiteId=${websiteId} weekOf=${formatWeekOf(weekOf)}`,
  );

  const resolved = await resolveClientApiKey({ clientId, provider: 'anthropic' });
  console.log(`[researcher] resolved api key source=${resolved.source}`);
  const client = new Anthropic({ apiKey: resolved.key });

  const userPrompt = [
    `Drop week (Monday, UTC): ${formatWeekOf(weekOf)}`,
    '',
    'Identify the top 3 trending political stories from the past 7 days that an apparel brand serving conservative-leaning customers could turn into a t-shirt drop. Use web_search aggressively against the anchor sites listed in your instructions, then return ONLY the JSON object specified.',
  ].join('\n');

  // Iterative loop — web_search is server-side but we still defensively loop
  // on stop_reason to handle any future tool variants or pause/resume turns.
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  let lastResponse: Anthropic.Messages.Message | null = null;
  let safety = 0;
  while (safety < 6) {
    safety += 1;
    console.log(`[researcher] anthropic call iteration=${safety}`);
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 8,
        },
      ],
      messages,
    });
    lastResponse = response;

    if (response.stop_reason === 'end_turn') {
      console.log(`[researcher] end_turn after iteration=${safety}`);
      break;
    }

    // web_search is server-side — the SDK typically completes the loop in a
    // single create() call. If we somehow get a different non-terminal stop
    // reason, push the assistant turn back in and re-invoke so the model can
    // continue. This is belt-and-suspenders for SDK version drift.
    messages.push({ role: 'assistant', content: response.content });
    if (response.stop_reason !== 'tool_use' && response.stop_reason !== 'pause_turn') {
      console.log(`[researcher] unexpected stop_reason=${response.stop_reason}; breaking`);
      break;
    }
  }

  if (!lastResponse) {
    throw new Error('[researcher] anthropic returned no response');
  }

  // Final assistant text is the JSON payload. Concatenate any text blocks.
  const textParts: string[] = [];
  for (const block of lastResponse.content) {
    if (block.type === 'text') textParts.push(block.text);
  }
  const rawModelResponse = textParts.join('\n').trim();
  if (!rawModelResponse) {
    throw new Error('[researcher] model returned no text content in final turn');
  }

  const jsonBlob = extractJsonBlob(rawModelResponse);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlob);
  } catch (err) {
    const excerpt = rawModelResponse.slice(0, 500);
    throw new Error(
      `[researcher] failed to parse model JSON: ${(err as Error).message}. Response excerpt: ${excerpt}`,
    );
  }

  const rawTopics = (parsed && typeof parsed === 'object' && 'topics' in parsed)
    ? (parsed as { topics: unknown }).topics
    : null;
  if (!Array.isArray(rawTopics)) {
    throw new Error(
      `[researcher] model JSON missing "topics" array. Response excerpt: ${rawModelResponse.slice(0, 500)}`,
    );
  }

  const topics: Topic[] = rawTopics
    .map(coerceTopic)
    .filter((t): t is Topic => t !== null);

  if (topics.length === 0) {
    throw new Error(
      `[researcher] model returned 0 valid topics. Response excerpt: ${rawModelResponse.slice(0, 500)}`,
    );
  }

  console.log(`[researcher] parsed ${topics.length} topics; persisting brief`);

  const [row] = await db
    .insert(magamommyBriefs)
    .values({
      websiteId,
      weekOf: formatWeekOf(weekOf),
      topics,
      rawModelResponse,
    })
    .returning({ id: magamommyBriefs.id });

  console.log(`[researcher] persisted briefId=${row.id}`);

  return {
    briefId: row.id,
    topics,
    rawModelResponse,
  };
}
