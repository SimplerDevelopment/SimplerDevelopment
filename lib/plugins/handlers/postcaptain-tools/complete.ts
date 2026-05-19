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
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  registeredAppRuns,
  postcaptainBriefs,
  postcaptainDrafts,
} from '@/lib/db/schema/plugins';
import type { CallbackHandler } from '../types';
import { ok, fail } from '../types';
import { redactLog, capLogTail } from './runner-redact';

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

const SuccessSchema = z.object({
  outcome: z.literal('succeeded'),
  result: z.discriminatedUnion('kind', [
    SuccessResultResearchBrief,
    SuccessResultDraftBlogPost,
    SuccessResultCompetitorResearch,
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
    const logTailRedacted = parsed.data.logTail
      ? capLogTail(redactLog(parsed.data.logTail))
      : null;

    if (parsed.data.outcome === 'succeeded') {
      // Insert the kind-specific result row first; runs.result_id is then
      // written along with the status transition so the row is internally
      // consistent. Two SQL statements but no transaction wrapper — a
      // failure between them is observable (status stays 'running') and
      // the worker can retry once we add the stuck-run reaper. Documented
      // gap: see Wave 2 TODO.
      const result = parsed.data.result;
      let resultId: number;
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
        if (run.kind !== 'competitor-research') {
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
      } else {
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
      }

      // CAS-transition. If a competing call won the transition, this UPDATE
      // matches zero rows and we 409.
      const updated = await db.update(registeredAppRuns).set({
        status: 'succeeded',
        finishedAt,
        updatedAt: finishedAt,
        exitCode: 0,
        resultId,
        logTail: logTailRedacted,
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
      logTail: logTailRedacted,
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
