// POST /scripts/runs/:id/complete — worker → portal completion callback.
//
// The Wave 2 dispatch model splits a run into two phases. SD claims a
// queued run and POSTs it to the postcaptain-tools worker; the worker
// executes (Anthropic + web_search), then calls this endpoint to finalize.
//
// This handler is on the *callback* side — i.e. the worker authenticates
// with a JWT that carries the dedicated `postcaptain:internal:complete`
// scope. A user-context JWT (from the proxy flow) is rejected by the
// callback router's scope check, so a leaked end-user token can't be used
// to forge a completion.
//
// Idempotency: completion is CAS-transitioned from 'running' → terminal.
// A second call (worker retry, network re-delivery) will find the row
// no longer in 'running' and return a 409 — caller logs and gives up.
//
// Tenancy: the run row is loaded WHERE clientId=ctx.client.id so a leaked
// run id from one tenant can't be completed by another. This mirrors the
// IDOR pattern in scripts.ts.

import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  registeredAppRuns,
  postcaptainBriefs,
  postcaptainDrafts,
} from '@/lib/db/schema/plugins';
import { brainNotes } from '@/lib/db/schema/brain';
import { users } from '@/lib/db/schema/auth';
import type { CallbackHandler } from '../types';
import { ok, fail } from '../types';
import { redactLog, capLogTail } from './runner-redact';
import { ingestCompetitorBriefArtifacts } from './competitor-brain';

const LOG_TAIL_MAX = 64 * 1024; // matches runner-redact.ts; used only for the input Zod cap
const ERROR_SUMMARY_MAX = 1_000;

// ─── Result schemas ────────────────────────────────────────────────────────
// Discriminated by `outcome`. Succeeded payloads carry a kind-specific
// `result` block; failures carry an error summary instead.

const SuccessResultResearchBrief = z.object({
  kind: z.literal('research-brief'),
  topic: z.string().min(1).max(255),
  focus: z.string().nullable().optional(),
  body: z.string().min(1),
  sources: z.array(z.object({ url: z.string(), title: z.string().optional() })).default([]),
});

const SuccessResultDraftBlogPost = z.object({
  kind: z.literal('draft-blog-post'),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  briefId: z.number().int().positive().nullable().optional(),
});

const VulnScore = z.enum(['HIGH', 'MED', 'LOW']);

const SuccessResultCompetitorResearch = z.object({
  kind: z.literal('competitor-research'),
  topic: z.string().min(1).max(255), // typically "Competitor: <slug>"
  focus: z.string().nullable().optional(),
  body: z.string().min(1),
  sources: z.array(z.object({ url: z.string(), title: z.string().optional() })).default([]),
  // Structured signal — persisted into postcaptain_briefs.meta so Wave 4
  // can detect score changes between consecutive runs.
  competitorSlug: z.string().min(1).max(64),
  depth: z.enum(['news', 'deep']),
  vulnerability: z.object({
    score: VulnScore,
    dims: z.object({
      clarity: VulnScore.optional(),
      differentiation: VulnScore.optional(),
      proof: VulnScore.optional(),
      consistency: VulnScore.optional(),
      specificity: VulnScore.optional(),
    }).optional(),
    rationale: z.string().max(2000).optional(),
  }).optional(),
});

// Brain-notes batch — `scrape-<slug>` runs. Each entry becomes one
// brain_notes row (deduped by clientId+sourceUrl). Caps on title/body
// are defense-in-depth (the plugin already clamps but we don't trust
// arbitrary worker output).
const SuccessResultBrainNotesBatch = z.object({
  kind: z.literal('brain-notes-batch'),
  competitorSlug: z.string().min(1).max(64),
  competitorName: z.string().min(1).max(255),
  domain: z.string().min(1).max(253),
  notes: z.array(z.object({
    sourceUrl: z.string().min(1).max(1000),
    title: z.string().min(1).max(255),
    body: z.string().max(50_000).default(''),
    category: z.string().min(1).max(64),
    fetchedOk: z.boolean(),
  })).max(100),
  stats: z.object({
    totalKeep: z.number().int().nonnegative(),
    alreadyScrapedCount: z.number().int().nonnegative(),
    attempted: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
  }),
});

// Generic script result — used for any kind declared in the plugin's
// SCRIPTS registry that doesn't have a dedicated result table (e.g.
// hello-world). The JSON `output` is serialised into the run's log_tail
// so it surfaces in the Runs detail view; no schema change needed for
// new scripts.
const SuccessResultScript = z.object({
  kind: z.literal('script'),
  scriptId: z.string().min(1).max(64),
  output: z.unknown(),
});

const SuccessSchema = z.object({
  outcome: z.literal('succeeded'),
  result: z.discriminatedUnion('kind', [
    SuccessResultResearchBrief,
    SuccessResultDraftBlogPost,
    SuccessResultCompetitorResearch,
    SuccessResultBrainNotesBatch,
    SuccessResultScript,
  ]),
  logTail: z.string().max(LOG_TAIL_MAX * 2).optional(), // server caps to LOG_TAIL_MAX
});

const FailureSchema = z.object({
  outcome: z.literal('failed'),
  errorSummary: z.string().min(1),
  logTail: z.string().max(LOG_TAIL_MAX * 2).optional(),
});

const CompleteBodySchema = z.discriminatedUnion('outcome', [SuccessSchema, FailureSchema]);

// ─── Handler ───────────────────────────────────────────────────────────────

const postComplete: CallbackHandler = {
  method: 'POST',
  path: '/scripts/runs/:id/complete',
  scope: 'postcaptain:internal:complete',
  async handle(req, ctx, params) {
    const runId = Number(params.id);
    if (!Number.isFinite(runId) || runId <= 0) {
      return fail('validation_error', 'Invalid run id.', 400);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('validation_error', 'Request body must be JSON.', 400);
    }
    const parsed = CompleteBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        'validation_error',
        'Invalid completion payload.',
        400,
        parsed.error.flatten(),
      );
    }

    // IDOR + ownership defense: load the run filtered by clientId. If the
    // run doesn't exist or belongs to a different tenant, surface as 404
    // (matches scripts.ts pattern).
    const [run] = await db
      .select()
      .from(registeredAppRuns)
      .where(and(
        eq(registeredAppRuns.id, runId),
        eq(registeredAppRuns.clientId, ctx.client.id),
      ))
      .limit(1);
    if (!run) {
      return fail('not_found', 'Run not found.', 404);
    }

    if (run.status !== 'running') {
      // CAS-style early-out — the run has already been finalized, or it
      // never made it out of 'queued'. Either way nothing for us to do.
      return fail(
        'conflict',
        `Run is in status '${run.status}', not 'running'.`,
        409,
      );
    }

    const finishedAt = new Date();
    // We re-compute the redacted log tail just before the UPDATE because
    // some result branches (competitor-research's brain-ingest trace,
    // script's JSON output dump) mutate parsed.data.logTail mid-flight.
    // Helper so both the success and failure paths agree on the cap.
    const computeRedactedLogTail = (): string | null =>
      parsed.data.logTail ? capLogTail(redactLog(parsed.data.logTail)) : null;

    if (parsed.data.outcome === 'succeeded') {
      // Insert the kind-specific result row first; runs.result_id is then
      // written along with the status transition so the row is internally
      // consistent. Two SQL statements but no transaction wrapper — a
      // failure between them is observable (status stays 'running') and
      // the worker can retry once we add the stuck-run reaper. Documented
      // gap: see Wave 2 TODO.
      const result = parsed.data.result;
      let resultId: number | null = null;
      if (result.kind === 'research-brief') {
        if (run.kind !== 'research-brief') {
          return fail(
            'validation_error',
            `Result kind 'research-brief' does not match run kind '${run.kind}'.`,
            400,
          );
        }
        const [row] = await db.insert(postcaptainBriefs).values({
          clientId: run.clientId,
          runId: run.id,
          topic: result.topic.slice(0, 255),
          focus: result.focus ?? null,
          body: result.body,
          sources: result.sources.map((s) => ({ url: s.url, title: s.title ?? s.url })),
        }).returning({ id: postcaptainBriefs.id });
        if (!row) throw new Error('complete: postcaptainBriefs insert returned no row');
        resultId = row.id;
      } else if (result.kind === 'competitor-research') {
        // Per-competitor scrape kinds (`scrape-<slug>` — declared in the
        // plugin's lib/scripts.ts via lib/competitors.ts) all dispatch
        // through runCompetitorResearch on the worker side and emit a
        // `competitor-research` result. Accept both `competitor-research`
        // and `scrape-*` run kinds here so each scrape script lands as a
        // postcaptain_briefs row + brain ingestion the same way.
        if (run.kind !== 'competitor-research' && !run.kind.startsWith('scrape-')) {
          return fail(
            'validation_error',
            `Result kind 'competitor-research' does not match run kind '${run.kind}'.`,
            400,
          );
        }
        // Persisted into postcaptain_briefs with a structured `meta` block
        // so Wave 4 can read meta.vulnerability and diff vs prior runs.
        const [row] = await db.insert(postcaptainBriefs).values({
          clientId: run.clientId,
          runId: run.id,
          topic: result.topic.slice(0, 255),
          focus: result.focus ?? null,
          body: result.body,
          sources: result.sources.map((s) => ({ url: s.url, title: s.title ?? s.url })),
          meta: {
            competitorSlug: result.competitorSlug,
            depth: result.depth,
            ...(result.vulnerability ? { vulnerability: result.vulnerability } : {}),
          },
        }).returning({ id: postcaptainBriefs.id });
        if (!row) throw new Error('complete: postcaptainBriefs insert returned no row');
        resultId = row.id;

        // Wave 4 — brain ingestion + card-comment loop. We deliberately do
        // NOT block the /complete response on these side-effects: if either
        // throws, the run still succeeds (the brief itself is the primary
        // artifact). ingestCompetitorBriefArtifacts swallows errors and
        // returns a summary we can log via logTail.
        try {
          const summary = await ingestCompetitorBriefArtifacts({
            clientId: run.clientId,
            briefId: resultId,
            competitorSlug: result.competitorSlug,
            depth: result.depth,
            topic: result.topic,
            body: result.body,
            newVulnerability: result.vulnerability,
          });
          // Surface a one-line trace into the run's logTail so operators
          // can see what happened after the brief landed. The worker's
          // logTail (in parsed.data.logTail) is concatenated below.
          const trace = `[brain] noteId=${summary.brainNoteId ?? 'none'} ${
            summary.scoreChange
              ? `cardComment=${summary.cardCommentId} change=${summary.scoreChange.fromScore}→${summary.scoreChange.toScore}`
              : 'cardComment=none'
          }`;
          parsed.data.logTail = parsed.data.logTail
            ? `${parsed.data.logTail}\n${trace}`
            : trace;
        } catch (err) {
          // Best-effort — don't fail the /complete response. Log into the
          // run's logTail so it's findable later.
          const msg = err instanceof Error ? err.message : String(err);
          parsed.data.logTail = `${parsed.data.logTail ?? ''}\n[brain] ingestion failed: ${msg}`;
        }
      } else if (result.kind === 'brain-notes-batch') {
        // `scrape-<slug>` workflow: write one brain_notes row per
        // discovered page, deduped on (clientId, sourceUrl). We don't
        // need a per-run result table — the notes themselves are the
        // artifact — so resultId stays null. Counts get serialised into
        // the run's logTail so operators can see what the batch did
        // from the Runs UI.
        if (!run.kind.startsWith('scrape-')) {
          return fail(
            'validation_error',
            `Result kind 'brain-notes-batch' does not match run kind '${run.kind}'.`,
            400,
          );
        }
        const summary = await ingestBrainNotesBatch({
          clientId: run.clientId,
          competitorSlug: result.competitorSlug,
          competitorName: result.competitorName,
          notes: result.notes,
        });
        const trace =
          `[brain-notes-batch] competitor=${result.competitorSlug} ` +
          `domain=${result.domain} stats=(keep=${result.stats.totalKeep}, ` +
          `already=${result.stats.alreadyScrapedCount}, attempted=${result.stats.attempted}, ` +
          `succeeded=${result.stats.succeeded}) inserted=${summary.inserted} ` +
          `skippedDuplicate=${summary.skippedDuplicate} failed=${summary.failed}`;
        parsed.data.logTail = parsed.data.logTail
          ? `${parsed.data.logTail}\n${trace}`
          : trace;
        // resultId stays null — there is no per-run result row, the
        // brain_notes inserts ARE the artifact. exit_code=0 below still
        // signals success.
      } else if (result.kind === 'draft-blog-post') {
        if (run.kind !== 'draft-blog-post') {
          return fail(
            'validation_error',
            `Result kind 'draft-blog-post' does not match run kind '${run.kind}'.`,
            400,
          );
        }
        const [row] = await db.insert(postcaptainDrafts).values({
          clientId: run.clientId,
          runId: run.id,
          briefId: result.briefId ?? null,
          title: result.title.slice(0, 255),
          body: result.body,
          status: 'draft',
        }).returning({ id: postcaptainDrafts.id });
        if (!row) throw new Error('complete: postcaptainDrafts insert returned no row');
        resultId = row.id;
      } else {
        // Generic 'script' result — no kind-specific result table. Cross-
        // check that the run's recorded kind matches the script id the
        // worker reported, then serialise the JSON output into the run's
        // logTail so it shows up in the Runs detail view. resultId stays
        // null (registered_app_runs.result_id is nullable).
        if (run.kind !== result.scriptId) {
          return fail(
            'validation_error',
            `Result scriptId '${result.scriptId}' does not match run kind '${run.kind}'.`,
            400,
          );
        }
        let serialisedOutput = '';
        try {
          serialisedOutput = JSON.stringify(result.output, null, 2);
        } catch {
          serialisedOutput = String(result.output);
        }
        const trace = `[script:${result.scriptId}] output:\n${serialisedOutput}`;
        parsed.data.logTail = parsed.data.logTail
          ? `${parsed.data.logTail}\n${trace}`
          : trace;
      }

      // CAS-transition. If a competing call won the transition, this UPDATE
      // matches zero rows and we 409.
      const updated = await db.update(registeredAppRuns).set({
        status: 'succeeded',
        finishedAt,
        updatedAt: finishedAt,
        exitCode: 0,
        resultId,
        logTail: computeRedactedLogTail(),
      }).where(and(
        eq(registeredAppRuns.id, runId),
        eq(registeredAppRuns.status, 'running'),
      )).returning({ id: registeredAppRuns.id });
      if (updated.length === 0) {
        return fail('conflict', 'Run state changed under us.', 409);
      }
      return ok({ runId, resultId }, { status: 200 });
    }

    // Failure outcome.
    const errorSummary = redactLog(parsed.data.errorSummary).slice(0, ERROR_SUMMARY_MAX);
    const updated = await db.update(registeredAppRuns).set({
      status: 'failed',
      finishedAt,
      updatedAt: finishedAt,
      exitCode: 1,
      errorSummary,
      logTail: computeRedactedLogTail(),
    }).where(and(
      eq(registeredAppRuns.id, runId),
      eq(registeredAppRuns.status, 'running'),
    )).returning({ id: registeredAppRuns.id });
    if (updated.length === 0) {
      return fail('conflict', 'Run state changed under us.', 409);
    }
    return ok({ runId }, { status: 200 });
  },
};

export const completeHandlers: CallbackHandler[] = [postComplete];

// ─── brain-notes-batch ingestion helper ────────────────────────────────────
//
// One brain_notes row per scraped page, deduped on (clientId, sourceUrl).
// We pre-load the set of already-existing source_urls in this batch so the
// dedup is a single round trip instead of N. Insert failures are swallowed
// (and counted) — a single bad URL shouldn't fail the whole run.

const TOOLS_BOT_EMAIL = 'tools-bot@simplerdevelopment.com';
const BRAIN_NOTE_SOURCE = 'plugin-postcaptain-tools';
let toolsBotUserIdCache: number | null | undefined;

async function getToolsBotUserId(): Promise<number | null> {
  if (toolsBotUserIdCache !== undefined) return toolsBotUserIdCache;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TOOLS_BOT_EMAIL))
    .limit(1);
  toolsBotUserIdCache = row ? row.id : null;
  return toolsBotUserIdCache;
}

interface IngestBrainNotesBatchInput {
  clientId: number;
  competitorSlug: string;
  competitorName: string;
  notes: Array<{
    sourceUrl: string;
    title: string;
    body: string;
    category: string;
    fetchedOk: boolean;
  }>;
}

interface IngestBrainNotesBatchSummary {
  inserted: number;
  skippedDuplicate: number;
  failed: number;
}

async function ingestBrainNotesBatch(
  input: IngestBrainNotesBatchInput,
): Promise<IngestBrainNotesBatchSummary> {
  const summary: IngestBrainNotesBatchSummary = {
    inserted: 0,
    skippedDuplicate: 0,
    failed: 0,
  };
  if (input.notes.length === 0) return summary;

  const botUserId = await getToolsBotUserId();
  const candidateUrls = input.notes.map((n) => n.sourceUrl);

  // Pre-load existing source_urls so dedup is one query, not N.
  const existingRows = await db
    .select({ sourceUrl: brainNotes.sourceUrl })
    .from(brainNotes)
    .where(and(
      eq(brainNotes.clientId, input.clientId),
      inArray(brainNotes.sourceUrl, candidateUrls),
    ));
  const existing = new Set(
    existingRows
      .map((r) => r.sourceUrl)
      .filter((u): u is string => typeof u === 'string'),
  );

  for (const note of input.notes) {
    if (existing.has(note.sourceUrl)) {
      summary.skippedDuplicate += 1;
      continue;
    }
    const tags = [
      `competitor:${input.competitorSlug}`,
      `page-type:${note.category}`,
      ...(note.fetchedOk ? [] : ['scrape-failed']),
    ];
    try {
      await db.insert(brainNotes).values({
        clientId: input.clientId,
        title: note.title.slice(0, 255),
        body: note.body,
        tags,
        source: BRAIN_NOTE_SOURCE,
        sourceUrl: note.sourceUrl,
        createdBy: botUserId,
      });
      summary.inserted += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}

// Test-only reset (matches competitor-brain.ts). Vitest can clear caches
// between cases.
export function __resetToolsBotUserIdCache(): void {
  toolsBotUserIdCache = undefined;
}
