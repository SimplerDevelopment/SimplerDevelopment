/**
 * BRAIN-1 Phase 1A — LLM classification pipeline for brain_notes.
 *
 * Given a batch of brain_notes rows (title + body + sourceUrl), asks Claude to
 * return a structured classification across 6 reserved taxonomy facets plus a
 * status. The 6 facets correspond to the `_`-prefixed root topic trees seeded
 * by scripts/brain/seed-taxonomy-topics.ts:
 *
 *   _source, _slate-area, _audience, _content-type, _recency, _competitor
 *
 * This module is read-only against the DB except for one `brain_audit_logs`
 * row per batch — actually persisting topic attachments + status changes is
 * the orchestrator's job (see Phase 1C `applyClassifications`, owned by a
 * separate agent).
 *
 * Multi-tenant: every DB query filters on clientId. The LLM client uses the
 * tenant's BYOK key when configured; otherwise platform.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainNotes } from '@/lib/db/schema';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { logAudit } from '@/lib/brain/audit';

// ─── Model + cost constants ─────────────────────────────────────────────────
// Haiku 4.5 is the cheap classifier — matches lib/extension/extract.ts and
// lib/brain/analyze-attachment.ts. Per Anthropic pricing as of 2026-05:
//   input  $1.00 / 1M tokens
//   output $5.00 / 1M tokens
// (Cached input reads are billed separately when prompt caching hits — the
// SDK returns those in `usage.cache_read_input_tokens` / `cache_creation_input_tokens`.)
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_OUTPUT_TOKENS = 700;
const INPUT_RATE_USD_PER_TOKEN = 1.0 / 1_000_000;
const OUTPUT_RATE_USD_PER_TOKEN = 5.0 / 1_000_000;
const CACHE_WRITE_RATE_USD_PER_TOKEN = 1.25 / 1_000_000;   // 1.25x base input
const CACHE_READ_RATE_USD_PER_TOKEN = 0.1 / 1_000_000;     // 0.1x base input

const BODY_EXCERPT_CHARS = 4000;

// Defaults + caps for the public API.
const DEFAULT_LIMIT_ALL = 50;
const MAX_LIMIT = 500;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 8;

// ─── Slug union types (exported) ────────────────────────────────────────────
// These mirror the leaf slugs in scripts/brain/seed-taxonomy-topics.ts. Keep
// them in sync — `applyClassifications` resolves slugs → topic ids by exact
// match.

export type SourceSlug =
  | 'slate-kb' | 'competitor' | 'own-marketing'
  | 'industry-news' | 'research-brief' | 'meeting-transcript' | 'linkedin-draft';

export type SlateAreaSlug =
  | 'queries' | 'deliver' | 'portals' | 'forms'
  | 'workflows' | 'reports' | 'permissions' | 'integrations' | 'none';

export type AudienceSlug =
  | 'vp-enrollment' | 'slate-admin' | 'advancement'
  | 'internal-only' | 'prospect-facing';

export type ContentTypeSlug =
  | 'how-to' | 'case-study' | 'reference' | 'opinion'
  | 'transcript' | 'news' | 'service-page';

export type RecencySlug = 'evergreen' | 'current-12mo' | 'archive';

export type CompetitorSlug =
  | 'carnegie' | 'enrollmentfuel' | 'rhb' | 'waybetter'
  | 'human-capital' | 'huron' | 'bwf';

export type NoteStatusSlug = 'canonical' | 'draft' | 'stub' | 'duplicate';

// Internal arrays used for prompt construction and zod enum validation. Keep
// in the same order as the seed script for readability.
const SOURCE_SLUGS: SourceSlug[] = [
  'slate-kb', 'competitor', 'own-marketing',
  'industry-news', 'research-brief', 'meeting-transcript', 'linkedin-draft',
];
const SLATE_AREA_SLUGS: SlateAreaSlug[] = [
  'queries', 'deliver', 'portals', 'forms',
  'workflows', 'reports', 'permissions', 'integrations', 'none',
];
const AUDIENCE_SLUGS: AudienceSlug[] = [
  'vp-enrollment', 'slate-admin', 'advancement',
  'internal-only', 'prospect-facing',
];
const CONTENT_TYPE_SLUGS: ContentTypeSlug[] = [
  'how-to', 'case-study', 'reference', 'opinion',
  'transcript', 'news', 'service-page',
];
const RECENCY_SLUGS: RecencySlug[] = ['evergreen', 'current-12mo', 'archive'];
const COMPETITOR_SLUGS: CompetitorSlug[] = [
  'carnegie', 'enrollmentfuel', 'rhb', 'waybetter',
  'human-capital', 'huron', 'bwf',
];
const NOTE_STATUS_SLUGS: NoteStatusSlug[] = ['canonical', 'draft', 'stub', 'duplicate'];

// Map of competitor domain → slug. Kept inline because `lib/competitors.ts`
// does not exist (verified 2026-05-27). When that file lands, swap this map
// for an import.
const COMPETITOR_DOMAINS: Record<string, CompetitorSlug> = {
  'carnegiehighered.com': 'carnegie',
  'carnegiedartlet.com': 'carnegie',
  'enrollmentfuel.com': 'enrollmentfuel',
  'rhb.com': 'rhb',
  'waybetter.com': 'waybetter',
  'waybettermarketing.com': 'waybetter',
  'humancapitalresearch.com': 'human-capital',
  'humancapital.com': 'human-capital',
  'huronconsultinggroup.com': 'huron',
  'huronconsultancy.com': 'huron',
  'bwf.com': 'bwf',
};

// ─── Public API ─────────────────────────────────────────────────────────────

export interface ClassifyNotesArgs {
  clientId: number;
  /** Explicit batch; mutually exclusive with `all`. */
  noteIds?: number[];
  /** Classify every active (deletedAt IS NULL) note for this tenant. */
  all?: boolean;
  /** Default 50 when `all` is set. Capped at MAX_LIMIT in any single call. */
  limit?: number;
  /** Default DEFAULT_CONCURRENCY, capped at MAX_CONCURRENCY. */
  concurrency?: number;
  /** Optional actor for audit logging; null = system / cron. */
  actorId?: number | null;
}

/**
 * One classification per note. `topicSlugs` are LEAF slugs from the reserved
 * trees seeded by scripts/brain/seed-taxonomy-topics.ts. The orchestrator
 * resolves slugs → topic IDs in `applyClassifications`.
 */
export interface NoteClassification {
  noteId: number;
  source: SourceSlug;                    // exactly one
  slateAreas: SlateAreaSlug[];           // 0..n
  audiences: AudienceSlug[];             // 0..n
  contentType: ContentTypeSlug;          // exactly one
  recency: RecencySlug;                  // exactly one
  competitor?: CompetitorSlug | null;    // only when source='competitor'
  status: NoteStatusSlug;
  confidence: number;                    // 0..1
  reasoning?: string;
}

export interface ClassifyNotesResult {
  classifications: NoteClassification[];
  skipped: Array<{ noteId: number; reason: string }>;
  tokensUsed: number;
  costUsd: number;
}

// ─── Zod schema for the model's JSON output ─────────────────────────────────
// Lenient about ordering/extra keys; strict about value domains.

const classificationSchema = z.object({
  source: z.enum(SOURCE_SLUGS as [SourceSlug, ...SourceSlug[]]),
  slateAreas: z.array(z.enum(SLATE_AREA_SLUGS as [SlateAreaSlug, ...SlateAreaSlug[]])).default([]),
  audiences: z.array(z.enum(AUDIENCE_SLUGS as [AudienceSlug, ...AudienceSlug[]])).default([]),
  contentType: z.enum(CONTENT_TYPE_SLUGS as [ContentTypeSlug, ...ContentTypeSlug[]]),
  recency: z.enum(RECENCY_SLUGS as [RecencySlug, ...RecencySlug[]]),
  competitor: z.enum(COMPETITOR_SLUGS as [CompetitorSlug, ...CompetitorSlug[]]).nullish(),
  status: z.enum(NOTE_STATUS_SLUGS as [NoteStatusSlug, ...NoteStatusSlug[]]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500).optional(),
});

// ─── Prompt construction ────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are classifying knowledge-base notes for Post Captain Consulting, a Slate-only enrollment consultancy serving higher-education enrollment and advancement teams.

For each note, return STRICT JSON matching this schema — no preamble, no markdown fences:

{
  "source":      one of [${SOURCE_SLUGS.map((s) => `"${s}"`).join(', ')}],         // exactly one
  "slateAreas":  array of zero or more of [${SLATE_AREA_SLUGS.map((s) => `"${s}"`).join(', ')}],
  "audiences":   array of zero or more of [${AUDIENCE_SLUGS.map((s) => `"${s}"`).join(', ')}],
  "contentType": one of [${CONTENT_TYPE_SLUGS.map((s) => `"${s}"`).join(', ')}],   // exactly one
  "recency":     one of [${RECENCY_SLUGS.map((s) => `"${s}"`).join(', ')}],
  "competitor":  one of [${COMPETITOR_SLUGS.map((s) => `"${s}"`).join(', ')}] or null  // ONLY when source = "competitor"
  "status":      one of ["canonical", "draft", "stub", "duplicate"],
  "confidence":  number in [0, 1],
  "reasoning":   short sentence (under 500 chars), optional
}

Slug meanings:

source — where the note originated:
  - slate-kb: Slate documentation, knowledge base, technolutions references
  - competitor: a competitor's marketing/case study/blog/site
  - own-marketing: Post Captain's own marketing, blog drafts, service pages
  - industry-news: third-party industry news, EAB/Forbes/Inside Higher Ed, etc.
  - research-brief: original research, white papers, market analysis
  - meeting-transcript: meeting recordings or AI-summarized transcripts
  - linkedin-draft: drafts intended for LinkedIn or other social

slate-area — which Slate functional area the note covers. Use "none" only when the note is not Slate-specific at all (industry trends, general marketing). Multiple areas are allowed.

audience — who the note is for. Most notes target one audience, but a deep technical "how-to" might serve both vp-enrollment and slate-admin.

content-type:
  - how-to: step-by-step instructional content
  - case-study: a specific outcome at a named institution
  - reference: data sheets, glossaries, lookup tables
  - opinion: editorial, point-of-view
  - transcript: raw or lightly-edited recording
  - news: dated event coverage
  - service-page: a paid offering's landing copy

recency:
  - evergreen: still useful in 3+ years
  - current-12mo: tied to the last 12 months (recent product release, recent enrollment cycle)
  - archive: older than 12 months and superseded by newer content

competitor — populated ONLY when source = "competitor". When set, match the strongest signal among carnegie, enrollmentfuel, rhb, waybetter, human-capital, huron, bwf.

status — quality classification:
  - canonical: gold-standard reference, well-written, anchor for this topic
  - draft: in progress, still being refined (default for new content)
  - stub: too short / low quality / clearly under-developed
  - duplicate: content is functionally identical to another, better note

Rules:
- Populate arrays SPARINGLY — only include slugs that genuinely apply. Empty arrays are fine.
- Never invent slugs outside the allowed enums.
- Set "competitor": null whenever source != "competitor".
- Confidence reflects how sure you are of the OVERALL classification — 0.7+ for clear cases, 0.5-0.7 for plausible-but-mixed signals, <0.5 for guesses.
- Be honest about low confidence; downstream code routes uncertain results to human review.`;
}

export interface NoteRow {
  id: number;
  title: string;
  body: string;
  sourceUrl: string | null;
  source: string;
}

export interface NoteClassifyUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface PrefillHints {
  source?: SourceSlug;
  competitor?: CompetitorSlug;
}

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function competitorFromDomain(domain: string | null): CompetitorSlug | null {
  if (!domain) return null;
  if (COMPETITOR_DOMAINS[domain]) return COMPETITOR_DOMAINS[domain];
  // Match suffix — e.g. "blog.carnegiehighered.com" → "carnegie".
  for (const [needle, slug] of Object.entries(COMPETITOR_DOMAINS)) {
    if (domain.endsWith(`.${needle}`) || domain === needle) return slug;
  }
  return null;
}

function buildPrefillHints(note: NoteRow): PrefillHints {
  const hints: PrefillHints = {};
  const domain = extractDomain(note.sourceUrl);
  const competitor = competitorFromDomain(domain);
  if (competitor) {
    hints.source = 'competitor';
    hints.competitor = competitor;
  } else if (note.source === 'document_import') {
    // No competitor match — guess slate-kb vs research-brief by URL shape.
    if (note.sourceUrl?.toLowerCase().includes('technolutions')) {
      hints.source = 'slate-kb';
    } else {
      hints.source = 'research-brief';
    }
  }
  return hints;
}

function buildUserPrompt(note: NoteRow, hints: PrefillHints): string {
  const body = (note.body ?? '').slice(0, BODY_EXCERPT_CHARS);
  const lines: string[] = [];
  lines.push(`Title: ${note.title}`);
  lines.push(`SourceURL: ${note.sourceUrl ?? 'none'}`);
  if (hints.source || hints.competitor) {
    const parts: string[] = [];
    if (hints.source) parts.push(`source likely "${hints.source}"`);
    if (hints.competitor) parts.push(`competitor likely "${hints.competitor}"`);
    lines.push(`Hint (URL-derived, confirm or override): ${parts.join('; ')}`);
  }
  lines.push('Body:');
  lines.push(body || '(empty)');
  lines.push('');
  lines.push('Respond with only JSON.');
  return lines.join('\n');
}

// ─── Output parsing ─────────────────────────────────────────────────────────

function unfence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

function parseClassification(raw: string, noteId: number): NoteClassification {
  const cleaned = unfence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Model did not return JSON');
    parsed = JSON.parse(m[0]);
  }
  const validated = classificationSchema.parse(parsed);

  // Enforce the "competitor only when source=competitor" invariant — the model
  // sometimes returns a competitor slug + source='industry-news' etc. Clamp
  // here rather than rejecting, since the rest of the classification is fine.
  const competitor = validated.source === 'competitor'
    ? (validated.competitor ?? null)
    : null;

  return {
    noteId,
    source: validated.source,
    slateAreas: validated.slateAreas,
    audiences: validated.audiences,
    contentType: validated.contentType,
    recency: validated.recency,
    competitor,
    status: validated.status,
    confidence: validated.confidence,
    reasoning: validated.reasoning,
  };
}

// ─── Pure per-note classification core (DB-free) ────────────────────────────

/**
 * Classify ONE note's content: build the (cacheable) prompt, call the model,
 * parse + validate. No DB, no tenant resolution — the caller supplies the
 * Anthropic client. The DB orchestrator (`classifyNotes`) and the eval harness
 * both call this so they exercise the identical prompt path.
 *
 * `onUsage` fires with the model usage BEFORE the no-text-block check, matching
 * the orchestrator's original accounting (a no-text response still counts its
 * tokens).
 */
export async function classifyNoteRow(
  row: NoteRow,
  anthropic: Anthropic,
  systemPrompt: string = buildSystemPrompt(),
  onUsage?: (usage: NoteClassifyUsage) => void,
): Promise<{ classification: NoteClassification; usage: NoteClassifyUsage }> {
  const hints = buildPrefillHints(row);
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    // Prompt caching: the system prompt is identical across a batch, so mark it
    // cacheable. The block form is required to pass `cache_control`.
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserPrompt(row, hints) }],
  });

  const raw = response.usage as {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  } | undefined;
  const usage: NoteClassifyUsage = {
    inputTokens: raw?.input_tokens ?? 0,
    outputTokens: raw?.output_tokens ?? 0,
    cacheReadTokens: raw?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: raw?.cache_creation_input_tokens ?? 0,
  };
  onUsage?.(usage);

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('model returned no text content');
  const classification = parseClassification(textBlock.text, row.id);
  return { classification, usage };
}

// ─── Concurrency limiter (tiny inline semaphore — no new dependency) ────────

function pLimit(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= max) return;
    const job = queue.shift();
    if (!job) return;
    active += 1;
    job();
  };

  return <T>(fn: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    const run = () => {
      fn()
        .then((v) => { active -= 1; resolve(v); next(); })
        .catch((e) => { active -= 1; reject(e); next(); });
    };
    queue.push(run);
    next();
  });
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export async function classifyNotes(args: ClassifyNotesArgs): Promise<ClassifyNotesResult> {
  if (args.noteIds && args.all) {
    throw new Error('classifyNotes: noteIds and all are mutually exclusive');
  }
  if (!args.noteIds && !args.all) {
    return { classifications: [], skipped: [], tokensUsed: 0, costUsd: 0 };
  }

  const concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, args.concurrency ?? DEFAULT_CONCURRENCY));
  const limit = Math.min(MAX_LIMIT, Math.max(1, args.limit ?? (args.all ? DEFAULT_LIMIT_ALL : MAX_LIMIT)));

  // ── Load notes ────────────────────────────────────────────────────────────
  let rows: NoteRow[] = [];
  if (args.noteIds && args.noteIds.length > 0) {
    const ids = args.noteIds.slice(0, MAX_LIMIT);
    rows = await db
      .select({
        id: brainNotes.id,
        title: brainNotes.title,
        body: brainNotes.body,
        sourceUrl: brainNotes.sourceUrl,
        source: brainNotes.source,
      })
      .from(brainNotes)
      .where(and(
        eq(brainNotes.clientId, args.clientId), // tenant scoping
        inArray(brainNotes.id, ids),
        isNull(brainNotes.deletedAt),
      ))
      .limit(MAX_LIMIT);
  } else if (args.all) {
    rows = await db
      .select({
        id: brainNotes.id,
        title: brainNotes.title,
        body: brainNotes.body,
        sourceUrl: brainNotes.sourceUrl,
        source: brainNotes.source,
      })
      .from(brainNotes)
      .where(and(
        eq(brainNotes.clientId, args.clientId), // tenant scoping
        isNull(brainNotes.deletedAt),
      ))
      .limit(limit);
  }

  if (rows.length === 0) {
    return { classifications: [], skipped: [], tokensUsed: 0, costUsd: 0 };
  }

  // ── Resolve LLM client (per-tenant BYOK aware) ────────────────────────────
  const resolved = await resolveClientApiKey({ clientId: args.clientId, provider: 'anthropic' });
  const anthropic = new Anthropic({ apiKey: resolved.key });

  const systemPrompt = buildSystemPrompt();

  // ── Classify in parallel ──────────────────────────────────────────────────
  const classifications: NoteClassification[] = [];
  const skipped: Array<{ noteId: number; reason: string }> = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;

  const gate = pLimit(concurrency);

  await Promise.all(rows.map((row) => gate(async () => {
    try {
      const { classification } = await classifyNoteRow(row, anthropic, systemPrompt, (usage) => {
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;
        cacheReadTokens += usage.cacheReadTokens;
        cacheCreationTokens += usage.cacheCreationTokens;
      });
      classifications.push(classification);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown classify error';
      skipped.push({ noteId: row.id, reason: message.slice(0, 300) });
    }
  })));

  // ── Cost accounting ───────────────────────────────────────────────────────
  // tokensUsed counts every input + output token the model billed us for
  // (base input, cache writes, cache reads, output). costUsd applies the
  // per-bucket rate so cache hits show up as the discount they actually are.
  const tokensUsed = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  const costUsd =
    inputTokens * INPUT_RATE_USD_PER_TOKEN +
    outputTokens * OUTPUT_RATE_USD_PER_TOKEN +
    cacheCreationTokens * CACHE_WRITE_RATE_USD_PER_TOKEN +
    cacheReadTokens * CACHE_READ_RATE_USD_PER_TOKEN;

  // Fire-and-forget cost ledger entry, same as classify-crm.
  void recordAiUsage({
    clientId: args.clientId,
    source: resolved.source,
    tokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
  });

  // ── Audit (one row per batch) ─────────────────────────────────────────────
  await logAudit({
    clientId: args.clientId,
    actorId: args.actorId ?? null,
    action: 'brain_notes.classify_batch',
    entityType: 'brain_notes',
    metadata: {
      count: classifications.length,
      skipped: skipped.length,
      tokensUsed,
      costUsd: Number(costUsd.toFixed(6)),
      model: MODEL,
      mode: args.all ? 'all' : 'noteIds',
      requestedConcurrency: concurrency,
      requestedLimit: limit,
    },
  });

  return {
    classifications,
    skipped,
    tokensUsed,
    costUsd,
  };
}
