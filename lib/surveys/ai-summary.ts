/**
 * Survey AI summarization (AI-01).
 *
 * Collects free-text answers, strips PII, asks Claude to synthesize themes /
 * sentiment / per-question summaries, and returns a structured payload the
 * caller persists to `survey_ai_summaries`.
 *
 * Pure orchestration — no DB writes happen here. The route owns persistence.
 *
 * Token-budget discipline: we cap at MAX_SAMPLES_PER_QUESTION trimmed answers
 * per question and MAX_CHARS_PER_QUESTION total characters per question.
 * Surveys with 1000s of responses get a representative sample, not the
 * whole corpus — keeps single-call cost bounded.
 */

import Anthropic from '@anthropic-ai/sdk';
import { stripPiiFromText } from './pii-strip';
import type { SurveyFieldDef } from '@/lib/db/schema';

/** Field types whose answers are worth summarizing. */
const TEXT_TYPES = new Set(['text', 'textarea']);

const MAX_SAMPLES_PER_QUESTION = 100;
const MAX_CHARS_PER_QUESTION = 30_000;

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'mixed';

export interface PerQuestionSummary {
  fieldId: string;
  label: string;
  summary: string;
  sampleCount: number;
}

export interface SurveyAiSummary {
  summary: string;
  sentiment: Sentiment;
  themes: string[];
  perQuestion: PerQuestionSummary[];
  /** Tokens billed for this generation (for usage tracking). */
  tokensUsed: number;
}

/** Pick text-type answers, scrub PII, and budget by sample-count + char-count. */
function collectSamples(
  fields: SurveyFieldDef[],
  responses: { answers: unknown }[],
): { fieldId: string; label: string; samples: string[] }[] {
  const out: { fieldId: string; label: string; samples: string[] }[] = [];
  for (const field of fields) {
    if (!TEXT_TYPES.has(field.type)) continue;
    const samples: string[] = [];
    let chars = 0;
    for (const resp of responses) {
      if (samples.length >= MAX_SAMPLES_PER_QUESTION) break;
      const answers = resp.answers as Record<string, unknown> | null;
      const raw = answers?.[field.id];
      if (typeof raw !== 'string' || raw.trim() === '') continue;
      const scrubbed = stripPiiFromText(raw.trim());
      if (chars + scrubbed.length > MAX_CHARS_PER_QUESTION) break;
      samples.push(scrubbed);
      chars += scrubbed.length;
    }
    if (samples.length > 0) {
      out.push({ fieldId: field.id, label: field.label, samples });
    }
  }
  return out;
}

const SYSTEM_PROMPT = `You analyze survey free-text responses and return a structured JSON summary.

You MUST respond with valid JSON only — no markdown, no code fences, no commentary.

Schema:
{
  "summary": "2-4 sentence high-level synthesis of what respondents said overall.",
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "themes": ["3-7 short theme strings, each 2-6 words"],
  "perQuestion": [
    {
      "fieldId": "echoed from input",
      "label": "echoed from input",
      "summary": "2-3 sentence synthesis of THIS question's answers."
    }
  ]
}

Rules:
- Be specific and grounded in the actual text. Do not fabricate themes that aren't present.
- If samples are sparse or unclear, say so in the summary ("Only X responses, limited signal").
- Sentiment refers to overall respondent feeling about the topic, not your feeling about the survey.
- Themes should be concrete and concise ("slow load times", "missing dark mode") not generic ("user experience").
- The input has already been PII-scrubbed — placeholders like [email] or [phone] are intentional. Don't comment on them.`;

export interface GenerateSurveySummaryInput {
  fields: SurveyFieldDef[];
  responses: { answers: unknown }[];
  apiKey: string;
  /** Anthropic model id. Defaults to Sonnet for cost/quality balance. */
  model?: string;
}

export async function generateSurveySummary(
  input: GenerateSurveySummaryInput,
): Promise<SurveyAiSummary | null> {
  const buckets = collectSamples(input.fields, input.responses);
  if (buckets.length === 0) return null;

  // Build a compact prompt — one section per question, with the field id /
  // label so the model can echo it back.
  const userParts: string[] = [];
  userParts.push(`Total responses: ${input.responses.length}\n`);
  for (const b of buckets) {
    userParts.push(
      `\n## Question ${b.fieldId}: ${b.label}\n` +
        `(${b.samples.length} sample${b.samples.length === 1 ? '' : 's'})\n` +
        b.samples.map((s, i) => `  ${i + 1}. ${s}`).join('\n'),
    );
  }

  const anthropic = new Anthropic({ apiKey: input.apiKey });
  const response = await anthropic.messages.create({
    model: input.model ?? 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userParts.join('\n') }],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();

  const parsed = JSON.parse(raw) as {
    summary: string;
    sentiment: Sentiment;
    themes: string[];
    perQuestion: { fieldId: string; label: string; summary: string }[];
  };

  // Backfill sampleCount from our local buckets — the model echoes fieldId/
  // label/summary but doesn't need to count.
  const sampleCountById = new Map(buckets.map((b) => [b.fieldId, b.samples.length]));
  const perQuestion: PerQuestionSummary[] = (parsed.perQuestion ?? []).map((q) => ({
    fieldId: q.fieldId,
    label: q.label,
    summary: q.summary,
    sampleCount: sampleCountById.get(q.fieldId) ?? 0,
  }));

  const tokens =
    (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

  return {
    summary: parsed.summary,
    sentiment: parsed.sentiment,
    themes: Array.isArray(parsed.themes) ? parsed.themes : [],
    perQuestion,
    tokensUsed: tokens,
  };
}
