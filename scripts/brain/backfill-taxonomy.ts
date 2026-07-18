/**
 * BRAIN-1 Phase 2 — One-shot backfill runner for brain_notes taxonomy.
 *
 *   bun run scripts/brain/backfill-taxonomy.ts --clientId=<n> --mode=preview|apply [options]
 *
 * Two-phase, human-gated workflow:
 *
 *   1. PREVIEW: classifies up to `--limit` active notes for the tenant via
 *      `lib/brain/classify-notes.ts`, writes the FULL result JSON to disk, and
 *      prints a stdout summary. No DB writes (other than the audit row that
 *      classifyNotes itself records — see classify-notes.ts).
 *
 *   2. APPLY: reads the JSON written by preview, prompts the operator for
 *      explicit y/N confirmation, and calls `lib/brain/apply-classifications.ts`
 *      to persist statuses + topic attachments (and route low-confidence rows
 *      to the review queue unless --noReviewQueue is set).
 *
 * The two phases are deliberately separate processes — the human must read the
 * preview JSON before any DB write happens. There is no `--mode=apply` shortcut
 * that skips preview.
 *
 * Safety:
 *   - Refuses to run against the metro/tramway prod proxies unless ALLOW_PROD=1.
 *   - Apply mode requires interactive y/N confirmation unless --yes is passed.
 *   - DATABASE_URL is loaded from .env.local with override:true (per
 *     memory `feedback_sd2026_dotenv_override`) so a stale `.env` cannot win.
 */

import * as dotenv from 'dotenv';

// Load env before importing db. .env first, then .env.local (with override) so
// a developer .env.local always wins — matches scripts/verify-db-target.ts and
// the dotenv-override invariant.
dotenv.config({ path: '.env', override: true });
dotenv.config({ path: '.env.local', override: true });

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { z } from 'zod';

// ─── CLI parsing ────────────────────────────────────────────────────────────

type Mode = 'preview' | 'apply';

interface Args {
  clientId: number;
  mode: Mode;
  limit: number;
  concurrency: number;
  previewPath: string;
  minConfidence: number;
  noReviewQueue: boolean;
  yes: boolean;
}

// Preview defaults — chosen to keep the first dry-run cheap and reviewable.
// 100 notes at ~4 concurrency comes in under $0.50 with Haiku 4.5 prompt-caching
// (verified against the cost-summary script) and the JSON is small enough for
// the human reviewer to actually skim. The 2566-note full backfill is intended
// to be reached via subsequent `--limit=500` batches, not a single 2566-shot.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 2500;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 8;
const DEFAULT_MIN_CONFIDENCE = 0.7;

function usage(extra?: string): never {
  if (extra) console.error(extra);
  console.error('');
  console.error('Usage:');
  console.error('  bun run scripts/brain/backfill-taxonomy.ts --clientId=<n> --mode=preview|apply [options]');
  console.error('');
  console.error('Options (preview):');
  console.error('  --limit=<n>          max notes to classify (default 100, cap 2500)');
  console.error('  --concurrency=<n>    LLM concurrency cap (default 4, max 8)');
  console.error('  --previewPath=<p>    where to write JSON (default scripts/brain/backfill-preview-<clientId>.json)');
  console.error('');
  console.error('Options (apply):');
  console.error('  --previewPath=<p>    where to read JSON from');
  console.error('  --minConfidence=<n>  default 0.7');
  console.error('  --noReviewQueue      skip routing low-confidence to brain_ai_review_items');
  console.error('  --yes                skip interactive confirmation prompt');
  process.exit(1);
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let clientId: number | null = null;
  let mode: Mode | null = null;
  let limit: number = DEFAULT_LIMIT;
  let concurrency: number = DEFAULT_CONCURRENCY;
  let previewPath: string | null = null;
  let minConfidence: number = DEFAULT_MIN_CONFIDENCE;
  let noReviewQueue = false;
  let yes = false;

  const kv = (a: string, prefix: string): string | null => {
    if (a.startsWith(prefix + '=')) return a.slice(prefix.length + 1);
    return null;
  };

  for (const a of argv) {
    let v: string | null;
    if ((v = kv(a, '--clientId')) !== null || (v = kv(a, '--client-id')) !== null) {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n)) usage(`Invalid --clientId: ${v}`);
      clientId = n;
    } else if ((v = kv(a, '--mode')) !== null) {
      if (v !== 'preview' && v !== 'apply') usage(`Invalid --mode: ${v}`);
      mode = v;
    } else if ((v = kv(a, '--limit')) !== null) {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n <= 0) usage(`Invalid --limit: ${v}`);
      limit = Math.min(MAX_LIMIT, n);
    } else if ((v = kv(a, '--concurrency')) !== null) {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n <= 0) usage(`Invalid --concurrency: ${v}`);
      concurrency = Math.min(MAX_CONCURRENCY, n);
    } else if ((v = kv(a, '--previewPath')) !== null) {
      previewPath = v;
    } else if ((v = kv(a, '--minConfidence')) !== null) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1) usage(`Invalid --minConfidence: ${v}`);
      minConfidence = n;
    } else if (a === '--noReviewQueue' || a === '--no-review-queue') {
      noReviewQueue = true;
    } else if (a === '--yes' || a === '-y') {
      yes = true;
    } else if (a === '--help' || a === '-h') {
      usage();
    } else {
      usage(`Unknown arg: ${a}`);
    }
  }

  if (clientId === null) usage('--clientId is required');
  if (mode === null) usage('--mode is required (preview|apply)');

  if (!previewPath) {
    previewPath = path.join('scripts', 'brain', `backfill-preview-${clientId}.json`);
  }

  return {
    clientId: clientId as number,
    mode: mode as Mode,
    limit,
    concurrency,
    previewPath,
    minConfidence,
    noReviewQueue,
    yes,
  };
}

// ─── Prod-URL refusal ───────────────────────────────────────────────────────
// Inlined because scripts/verify-db-target.ts is a top-level script (not a
// reusable helper module — it calls process.exit at import time). Keep the
// PROD_INDICATORS list in sync with that script; if a new prod proxy lands,
// update both places.

// PROD_DB_HOSTS: optional comma-separated list of hostname[:port] fragments
// that identify production database proxies. See scripts/verify-db-target.ts
// for full documentation. When unset, only RAILWAY_ENVIRONMENT_NAME is used.
const PROD_INDICATORS: string[] = (process.env.PROD_DB_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

function refusalCheck(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const hitProd =
    PROD_INDICATORS.some((p) => url.includes(p)) ||
    process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
  const override = process.env.ALLOW_PROD === '1';
  const redacted = url.replace(/:\/\/[^@]*@/, '://[REDACTED]@');

  if (hitProd && !override) {
    console.error('');
    console.error('  REFUSING to run BRAIN-1 backfill against production.');
    console.error('');
    console.error(`  DATABASE_URL → ${redacted}`);
    console.error('');
    console.error('  If this is truly intentional, re-run with ALLOW_PROD=1 in your env.');
    console.error('');
    process.exit(1);
  }
  console.log(`[backfill-taxonomy] DB target → ${redacted}${hitProd ? ' (prod override active via ALLOW_PROD=1)' : ''}`);
}

// ─── Zod schemas for preview JSON ───────────────────────────────────────────
// Mirrors `ClassifyNotesResult` from lib/brain/classify-notes.ts. Kept loose
// (lenient on extra keys, strict on the shape we read) so we can detect a
// truncated or hand-edited JSON before passing it to applyClassifications.

const noteClassificationSchema = z.object({
  noteId: z.number().int(),
  source: z.string(),
  slateAreas: z.array(z.string()),
  audiences: z.array(z.string()),
  contentType: z.string(),
  recency: z.string(),
  competitor: z.string().nullable().optional(),
  status: z.enum(['canonical', 'draft', 'stub', 'duplicate']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

const classifyNotesResultSchema = z.object({
  classifications: z.array(noteClassificationSchema),
  skipped: z.array(z.object({ noteId: z.number().int(), reason: z.string() })),
  tokensUsed: z.number(),
  costUsd: z.number(),
});

// ─── Summary helpers ────────────────────────────────────────────────────────

function tally<T extends string | number | null | undefined>(
  items: Iterable<T>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of items) {
    const k = v === null || v === undefined ? '(none)' : String(v);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function sortDesc(obj: Record<string, number>, topN?: number): Record<string, number> {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const sliced = typeof topN === 'number' ? entries.slice(0, topN) : entries;
  return Object.fromEntries(sliced);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function fmtConfidence(values: number[]): { p10: number; p50: number; p90: number; lowConf: number } {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p10: Number(percentile(sorted, 10).toFixed(2)),
    p50: Number(percentile(sorted, 50).toFixed(2)),
    p90: Number(percentile(sorted, 90).toFixed(2)),
    lowConf: values.filter((v) => v < DEFAULT_MIN_CONFIDENCE).length,
  };
}

// ─── Interactive confirm (no new deps) ──────────────────────────────────────

function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === 'y' || a === 'yes');
    });
  });
}

// ─── Preview mode ───────────────────────────────────────────────────────────

async function runPreview(args: Args): Promise<void> {
  console.log(`BRAIN-1 backfill preview — client ${args.clientId}, limit ${args.limit}, concurrency ${args.concurrency}`);

  // Lazy-import lib modules AFTER env + refusal so dotenv has settled before
  // lib/db pulls DATABASE_URL.
  const { classifyNotes } = await import('@/lib/brain/classify-notes');

  const result = await classifyNotes({
    clientId: args.clientId,
    all: true,
    limit: args.limit,
    concurrency: args.concurrency,
    actorId: null,
  });

  // Persist the FULL result so apply mode has everything it needs.
  const outPath = path.resolve(args.previewPath);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf-8');

  // ── Summary ───────────────────────────────────────────────────────────────
  const classified = result.classifications;
  const total = classified.length + result.skipped.length;
  const skipReasons = tally(result.skipped.map((s) => s.reason));

  const sources = sortDesc(tally(classified.map((c) => c.source)));
  const contentTypes = sortDesc(tally(classified.map((c) => c.contentType)));
  const statusDist = tally(classified.map((c) => c.status));
  const confidence = fmtConfidence(classified.map((c) => c.confidence));

  console.log('');
  console.log(`Classified: ${classified.length} notes`);
  console.log(`Skipped:    ${result.skipped.length} (reasons: ${JSON.stringify(skipReasons)})`);
  console.log(`Tokens used: ${result.tokensUsed}`);
  console.log(`Cost USD: $${result.costUsd.toFixed(2)}`);
  console.log(`Top sources: ${JSON.stringify(sources)}`);
  console.log(`Top content types: ${JSON.stringify(contentTypes)}`);
  console.log(`Status distribution: ${JSON.stringify(statusDist)}`);
  console.log(`Confidence distribution: ${JSON.stringify(confidence)}`);
  console.log('');
  console.log(`Preview written to: ${outPath}`);

  // ── Warnings (don't fail — let the human decide) ──────────────────────────
  if (total > 0) {
    const skipPct = (result.skipped.length / total) * 100;
    if (skipPct > 25) {
      console.log('');
      console.warn(`WARNING: skip rate ${skipPct.toFixed(1)}% exceeds 25%. Investigate the skip reasons above before applying.`);
    }
  }
  if (result.costUsd > 5) {
    console.log('');
    console.warn(`WARNING: preview cost $${result.costUsd.toFixed(2)} exceeds $5 soft cap (BRAIN-3 monthly cap is $20).`);
  }

  console.log('');
  console.log('Next: review the JSON, then run:');
  console.log(`  bun run scripts/brain/backfill-taxonomy.ts --clientId=${args.clientId} --mode=apply`);
}

// ─── Apply mode ─────────────────────────────────────────────────────────────

async function runApply(args: Args): Promise<void> {
  const inPath = path.resolve(args.previewPath);

  let raw: string;
  try {
    raw = await fs.readFile(inPath, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Cannot read preview JSON at ${inPath}: ${msg}`);
    console.error('Run --mode=preview first to generate it.');
    process.exit(1);
  }

  let parsed: z.infer<typeof classifyNotesResultSchema>;
  try {
    parsed = classifyNotesResultSchema.parse(JSON.parse(raw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Preview JSON at ${inPath} failed validation:`);
    console.error(msg);
    process.exit(1);
  }

  console.log(`BRAIN-1 backfill apply — client ${args.clientId}`);
  console.log(`Reading from: ${inPath}`);
  console.log(`Classifications: ${parsed.classifications.length}`);
  console.log(`minConfidence: ${args.minConfidence}`);
  console.log(`Route low-confidence to review queue: ${!args.noReviewQueue}`);

  if (!args.yes) {
    const ok = await confirm(
      `\nAbout to apply ${parsed.classifications.length} classifications to client ${args.clientId}. ` +
      `Topics will be attached, brain_notes.status will be updated. Proceed? [y/N] `,
    );
    if (!ok) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  const { applyClassifications } = await import('@/lib/brain/apply-classifications');

  // Cast: the preview JSON's slug fields are validated as strings (lenient) but
  // applyClassifications resolves slugs via the brain_topics slug map, so an
  // unknown slug is dropped silently — no need to retype as the strict union.
  const result = await applyClassifications({
    clientId: args.clientId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    classifications: parsed.classifications as any,
    actorId: null,
    minConfidence: args.minConfidence,
    routeBelowMinToReview: !args.noReviewQueue,
  });

  console.log('');
  console.log(`Notes updated:      ${result.notesUpdated}`);
  console.log(`Topics attached:    ${result.topicsAttached}`);
  console.log(`Already attached:   ${result.attachmentsExisted} (idempotent skip)`);
  console.log(`Routed to review:   ${result.routedToReview}`);
  console.log(`Skipped:            ${result.skipped.length}`);
  if (result.skipped.length > 0) {
    const reasons = tally(result.skipped.map((s) => s.reason));
    console.log(`  Skip reasons: ${JSON.stringify(reasons)}`);
  }
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  refusalCheck();

  if (args.mode === 'preview') {
    await runPreview(args);
  } else {
    await runApply(args);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backfill-taxonomy failed:', err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  });
