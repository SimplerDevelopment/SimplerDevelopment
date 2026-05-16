// Execution backbone for postcaptain-tools plugin runs. Three layers:
//
//   1. enqueueRun() — inserts a registered_app_runs row with status='queued'.
//      Used by the callback handler ('/scripts/run') and by the
//      jobs-tick cron (when a weekly schedule fires).
//   2. executeRun() — claims a queued run via a CAS UPDATE, routes to the
//      kind-specific handler (research-brief or draft-blog-post), persists
//      the result into postcaptain_briefs or postcaptain_drafts, and bumps
//      the run row to succeeded/failed. Idempotent: calling on a non-queued
//      run returns { status: 'skipped' }.
//   3. drainQueuedRuns() — picks up to N queued runs, executes them with
//      bounded parallelism, returns aggregate counters. Used by the
//      plugin-runs-drain cron, kept under the Vercel 60s function limit by
//      capping parallelism (research-brief can take 30-60s).
//
// Log redaction (redactLog) is applied before persisting `logTail`; the
// tail is capped at 64 KB. Common leaks stripped: JWTs, Anthropic API keys
// (sk-ant-…), Bearer tokens, env-var-ish KEY=value patterns.

import { db } from '@/lib/db';
import {
  registeredAppRuns,
  postcaptainBriefs,
  postcaptainDrafts,
  type RegisteredApp,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { runResearchBrief } from './research-brief';
import { runDraftBlogPost } from './draft-blog-post';

// ─── Constants ──────────────────────────────────────────────────────────────

const LOG_TAIL_MAX_BYTES = 64 * 1024; // 64 KB
const DRAIN_PARALLELISM = 2; // research can take 30-60s; keep cron <60s
const ERROR_SUMMARY_MAX = 1_000;

export type RunKind = 'research-brief' | 'draft-blog-post';

// ─── enqueueRun ─────────────────────────────────────────────────────────────

export interface EnqueueRunOpts {
  app: RegisteredApp;
  client: { id: number };
  kind: RunKind;
  args: Record<string, unknown>;
  jobId?: number | null;
}

/**
 * Inserts a queued run row. Returns the new run id. The actual execution is
 * deferred to the drain cron — this function never blocks on Anthropic.
 */
export async function enqueueRun(opts: EnqueueRunOpts): Promise<{ runId: number }> {
  const [row] = await db.insert(registeredAppRuns).values({
    appId: opts.app.id,
    clientId: opts.client.id,
    jobId: opts.jobId ?? null,
    kind: opts.kind,
    args: opts.args,
    status: 'queued',
  }).returning({ id: registeredAppRuns.id });
  if (!row) throw new Error('enqueueRun: insert returned no row');
  return { runId: row.id };
}

// ─── executeRun ─────────────────────────────────────────────────────────────

export type ExecuteRunResult =
  | { status: 'succeeded'; reason?: string }
  | { status: 'failed'; reason?: string }
  | { status: 'skipped'; reason?: string };

/**
 * CAS-claims a queued run (status='queued' → 'running'), executes the
 * kind-specific handler, persists the result, and finalizes the row.
 *
 * Idempotent: if the run is not in status='queued' at call time (another
 * worker grabbed it, it was cancelled, or it's already terminal), returns
 * { status: 'skipped' } without doing any work.
 */
export async function executeRun(runId: number): Promise<ExecuteRunResult> {
  // CAS-claim. `RETURNING *` lets us read the kind/args without a second
  // round-trip after the claim.
  const claimed = await db
    .update(registeredAppRuns)
    .set({
      status: 'running',
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(registeredAppRuns.id, runId),
      eq(registeredAppRuns.status, 'queued'),
    ))
    .returning();

  if (claimed.length === 0) {
    return { status: 'skipped', reason: 'already-claimed' };
  }

  const run = claimed[0];
  const logBuf: string[] = [];
  const log = (line: string) => { logBuf.push(line); };

  try {
    log(`[${new Date().toISOString()}] run ${runId} kind=${run.kind} starting`);

    let resultId: number;
    if (run.kind === 'research-brief') {
      resultId = await handleResearchBrief(run, log);
    } else if (run.kind === 'draft-blog-post') {
      resultId = await handleDraftBlogPost(run, log);
    } else {
      throw new Error(`unknown run kind: ${run.kind}`);
    }

    log(`[${new Date().toISOString()}] run ${runId} succeeded resultId=${resultId}`);

    await db.update(registeredAppRuns)
      .set({
        status: 'succeeded',
        finishedAt: new Date(),
        updatedAt: new Date(),
        exitCode: 0,
        resultId,
        logTail: capLogTail(redactLog(logBuf.join('\n'))),
      })
      .where(eq(registeredAppRuns.id, runId));

    return { status: 'succeeded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[${new Date().toISOString()}] run ${runId} FAILED: ${message}`);
    if (err instanceof Error && err.stack) {
      log(err.stack);
    }

    await db.update(registeredAppRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        updatedAt: new Date(),
        exitCode: 1,
        errorSummary: redactLog(message).slice(0, ERROR_SUMMARY_MAX),
        logTail: capLogTail(redactLog(logBuf.join('\n'))),
      })
      .where(eq(registeredAppRuns.id, runId));

    return { status: 'failed', reason: message };
  }
}

// ─── Kind handlers ──────────────────────────────────────────────────────────

interface RunRow {
  id: number;
  clientId: number;
  args: Record<string, unknown>;
}

async function handleResearchBrief(
  run: RunRow,
  log: (line: string) => void,
): Promise<number> {
  const args = run.args ?? {};
  const topic = typeof args.topic === 'string' ? args.topic.trim() : '';
  if (!topic) {
    throw new Error('research-brief run missing required arg: topic');
  }
  const focus = typeof args.focus === 'string' && args.focus.trim()
    ? args.focus.trim()
    : undefined;

  log(`calling Anthropic for research brief: topic=${topic}`);
  const brief = await runResearchBrief({ topic, focus });
  log(`brief ready: ${brief.body.length} chars, ${brief.sources.length} sources`);

  const [briefRow] = await db.insert(postcaptainBriefs).values({
    clientId: run.clientId,
    runId: run.id,
    topic: brief.topic.slice(0, 255),
    focus: brief.focus,
    body: brief.body,
    // Schema requires {url, title}[]; if the model didn't return a title,
    // default to the URL itself so we don't violate the type.
    sources: brief.sources.map(s => ({ url: s.url, title: s.title ?? s.url })),
  }).returning({ id: postcaptainBriefs.id });

  if (!briefRow) throw new Error('research-brief: insert returned no row');
  return briefRow.id;
}

async function handleDraftBlogPost(
  run: RunRow,
  log: (line: string) => void,
): Promise<number> {
  const args = run.args ?? {};
  // Two input modes: pass a briefId to load from postcaptain_briefs, or pass
  // an inline brief object. The callback handler ('/scripts/run') is
  // expected to normalize to briefId for persistence.
  let briefData: { topic: string; body: string; sources: Array<{ url: string; title?: string }> };
  let briefId: number | null = null;

  if (typeof args.briefId === 'number') {
    briefId = args.briefId;
    const rows = await db.select()
      .from(postcaptainBriefs)
      .where(eq(postcaptainBriefs.id, briefId))
      .limit(1);
    if (rows.length === 0) {
      throw new Error(`draft-blog-post: brief ${briefId} not found`);
    }
    const b = rows[0];
    if (b.clientId !== run.clientId) {
      throw new Error('draft-blog-post: brief belongs to a different client');
    }
    briefData = {
      topic: b.topic,
      body: b.body,
      sources: b.sources,
    };
  } else if (args.brief && typeof args.brief === 'object') {
    const raw = args.brief as Partial<{ topic: string; body: string; sources: unknown }>;
    if (typeof raw.topic !== 'string' || typeof raw.body !== 'string') {
      throw new Error('draft-blog-post: inline brief missing topic/body');
    }
    briefData = {
      topic: raw.topic,
      body: raw.body,
      sources: Array.isArray(raw.sources)
        ? (raw.sources as Array<{ url: string; title?: string }>).filter(s => s && typeof s.url === 'string')
        : [],
    };
  } else {
    throw new Error('draft-blog-post run missing brief or briefId arg');
  }

  const targetLength = args.targetLength === 'short' || args.targetLength === 'long'
    ? args.targetLength
    : 'medium';

  log(`calling Anthropic for blog draft: topic=${briefData.topic} length=${targetLength}`);
  const draft = await runDraftBlogPost({ brief: briefData, targetLength });
  log(`draft ready: title="${draft.title}" body=${draft.body.length} chars`);

  const [draftRow] = await db.insert(postcaptainDrafts).values({
    clientId: run.clientId,
    runId: run.id,
    briefId,
    title: draft.title.slice(0, 255),
    body: draft.body,
    status: 'draft',
  }).returning({ id: postcaptainDrafts.id });

  if (!draftRow) throw new Error('draft-blog-post: insert returned no row');
  return draftRow.id;
}

// ─── drainQueuedRuns ────────────────────────────────────────────────────────

/**
 * Drains up to `max` queued runs in parallel, with bounded concurrency
 * (DRAIN_PARALLELISM = 2). Returns aggregate counters. Long runs (Anthropic
 * 30-60s) mean we deliberately leave excess work for the next tick — the
 * cron fires every minute, so backlog clears quickly.
 */
export async function drainQueuedRuns(max: number): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
}> {
  if (max <= 0) return { attempted: 0, succeeded: 0, failed: 0 };

  // Snapshot the queue — pick the oldest queued IDs. We DON'T claim here;
  // claim happens inside executeRun via CAS so concurrent drain ticks don't
  // double-fire.
  const candidates = await db.select({ id: registeredAppRuns.id })
    .from(registeredAppRuns)
    .where(eq(registeredAppRuns.status, 'queued'))
    .orderBy(registeredAppRuns.id)
    .limit(max);

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  // Process in batches of DRAIN_PARALLELISM. Skipped runs (already claimed
  // by another tick) don't count toward succeeded/failed — they're just
  // misses on the CAS.
  for (let i = 0; i < candidates.length; i += DRAIN_PARALLELISM) {
    const batch = candidates.slice(i, i + DRAIN_PARALLELISM);
    const results = await Promise.all(batch.map(c => executeRun(c.id)));
    for (const r of results) {
      attempted += 1;
      if (r.status === 'succeeded') succeeded += 1;
      else if (r.status === 'failed') failed += 1;
    }
  }

  return { attempted, succeeded, failed };
}

// ─── redactLog ──────────────────────────────────────────────────────────────

const REDACTION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  // Anthropic API keys.
  { pattern: /sk-ant-[A-Za-z0-9_-]+/g, replacement: 'sk-ant-[REDACTED]' },
  // JWTs — three base64url segments separated by dots, anchored on the JWT
  // header prefix "eyJ" so we avoid clobbering version strings like 1.2.3.
  {
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: '[REDACTED_JWT]',
  },
  // Bearer tokens (case-insensitive). Stops on whitespace or end-of-line.
  { pattern: /Bearer\s+[A-Za-z0-9._\-+/=]+/gi, replacement: 'Bearer [REDACTED]' },
  // Common env-var-looking secrets. Captures KEY=value where KEY contains
  // "secret", "token", "key", "password", or "api" — case-insensitive
  // so lower-case `api_token=...` also gets caught. Conservative match on
  // the value (no whitespace, no quote characters).
  {
    pattern: /\b([A-Za-z][A-Za-z0-9_]*(?:secret|token|key|password|api)[A-Za-z0-9_]*)=([^\s"']{4,})/gi,
    replacement: '$1=[REDACTED]',
  },
];

export function redactLog(raw: string): string {
  let out = raw;
  for (const rule of REDACTION_RULES) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  return out;
}

function capLogTail(s: string): string {
  // Cap by BYTES (not characters) since logTail is text with UTF-8 storage
  // in Postgres and the spec says 64 KB. We keep the trailing window
  // because the most recent lines are usually the most relevant on failure.
  const encoder = new TextEncoder();
  const bytes = encoder.encode(s);
  if (bytes.byteLength <= LOG_TAIL_MAX_BYTES) return s;
  // Slice from the tail. Find a safe character boundary by decoding.
  const tail = bytes.slice(bytes.byteLength - LOG_TAIL_MAX_BYTES);
  // Trim any leading bytes that may have started mid-character.
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(tail);
  // Strip up to the first newline so we don't show a half-line.
  const firstNl = decoded.indexOf('\n');
  return firstNl >= 0 ? `…[truncated]\n${decoded.slice(firstNl + 1)}` : `…[truncated]\n${decoded}`;
}
