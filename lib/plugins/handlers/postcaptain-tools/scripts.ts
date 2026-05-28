// Postcaptain Tools — script-run handlers.
//
// /scripts/run        POST   — kick off a research-brief or draft-blog-post run
// /scripts/runs       GET    — paginated history filtered to ctx.client.id
// /scripts/runs/:id   GET    — detail with IDOR defense
//
// Tenant boundary is already enforced by `authenticateCallback` (it verifies
// the JWT clientId is allowed for this app). Per-route IDOR defense is still
// the handler's job — every read of `registered_app_runs` is joined to
// `ctx.client.id` so a leaked run id from one tenant can't be opened by
// another.

import { z } from 'zod';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { registeredAppRuns } from '@/lib/db/schema/plugins';
import type { CallbackHandler } from '../types';
import { ok, fail } from '../types';
import { enqueueRun } from './runner';

// Body schema for POST /scripts/run. `kind` is open-ended — the plugin's
// dispatch-router decides whether the kind is known (legacy kinds plus
// anything declared in the plugin's lib/scripts.ts SCRIPTS registry).
// Per-kind arg validation happens on the worker side. The legacy fields
// below stay as optional typed slots so existing TS callers don't break;
// anything else is captured by the catchall.
const RunBodySchema = z.object({
  kind: z.string().min(1).max(64),
  topic: z.string().min(1).max(255).optional(),
  focus: z.string().max(2000).optional(),
  briefId: z.number().int().positive().optional(),
  // competitor-research args
  competitorSlug: z.string().min(1).max(64).optional(),
  depth: z.enum(['news', 'deep']).optional(),
  lookbackDays: z.number().int().min(1).max(365).optional(),
}).catchall(z.unknown());

const ListRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.coerce.number().int().positive().optional(),
});

const postScriptsRun: CallbackHandler = {
  method: 'POST',
  path: '/scripts/run',
  scope: 'postcaptain:research:write',
  async handle(req, ctx) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('validation_error', 'Request body must be JSON.', 400);
    }
    const parsed = RunBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        'validation_error',
        'Invalid request body.',
        400,
        parsed.error.flatten(),
      );
    }
    const { kind, topic, focus, briefId, competitorSlug, depth, lookbackDays, ...extraArgs } = parsed.data;

    // Light per-kind required-field check for the LEGACY kinds — keeps the
    // contract tight for callers that haven't migrated to manifest-declared
    // scripts. New scripts validate their own args on the worker side.
    if (kind === 'research-brief' && !topic) {
      return fail(
        'validation_error',
        "'topic' is required for kind='research-brief'.",
        400,
      );
    }
    if (kind === 'draft-blog-post' && !briefId && !topic) {
      return fail(
        'validation_error',
        "Either 'briefId' or 'topic' is required for kind='draft-blog-post'.",
        400,
      );
    }
    if (kind === 'competitor-research' && !competitorSlug) {
      return fail(
        'validation_error',
        "'competitorSlug' is required for kind='competitor-research'.",
        400,
      );
    }

    // Build args narrowly for legacy kinds so unrelated fields don't leak
    // through. For arbitrary script kinds, pass through whatever the
    // caller supplied (catchall'd by the Zod schema above) — the worker's
    // dispatch-router does the per-kind validation.
    let args: Record<string, unknown>;
    if (kind === 'competitor-research') {
      args = { competitorSlug, depth: depth ?? 'news', focus, lookbackDays };
    } else if (kind === 'research-brief') {
      args = { topic, focus };
    } else if (kind === 'draft-blog-post') {
      args = { topic, focus, briefId };
    } else {
      args = { ...extraArgs };
    }

    try {
      const { runId } = await enqueueRun({
        app: ctx.app,
        client: ctx.client,
        kind,
        args,
      });
      return ok({ runId }, { status: 202 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'enqueueRun failed';
      return fail('internal_error', message, 500);
    }
  },
};

const getScriptsRuns: CallbackHandler = {
  method: 'GET',
  path: '/scripts/runs',
  scope: 'postcaptain:research:read',
  async handle(req, ctx) {
    const url = new URL(req.url);
    const parsed = ListRunsQuerySchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    });
    if (!parsed.success) {
      return fail(
        'validation_error',
        'Invalid query parameters.',
        400,
        parsed.error.flatten(),
      );
    }
    const { limit, cursor } = parsed.data;

    // Cursor pagination on `id DESC` — simple and stable for an append-only
    // table. `cursor` is the last id from the previous page; we return
    // strictly-smaller ids.
    const whereExpr = cursor
      ? and(
          eq(registeredAppRuns.appId, ctx.app.id),
          eq(registeredAppRuns.clientId, ctx.client.id),
          lt(registeredAppRuns.id, cursor),
        )
      : and(
          eq(registeredAppRuns.appId, ctx.app.id),
          eq(registeredAppRuns.clientId, ctx.client.id),
        );

    const rows = await db
      .select()
      .from(registeredAppRuns)
      .where(whereExpr)
      .orderBy(desc(registeredAppRuns.id))
      .limit(limit);

    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    return ok({ runs: rows, nextCursor });
  },
};

const getScriptsRunById: CallbackHandler = {
  method: 'GET',
  path: '/scripts/runs/:id',
  scope: 'postcaptain:research:read',
  async handle(_req, ctx, params) {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return fail('validation_error', "Invalid run id.", 400);
    }
    const [row] = await db
      .select()
      .from(registeredAppRuns)
      .where(and(
        eq(registeredAppRuns.id, id),
        eq(registeredAppRuns.appId, ctx.app.id),
        eq(registeredAppRuns.clientId, ctx.client.id),
      ))
      .limit(1);
    if (!row) {
      return fail('not_found', 'Run not found.', 404);
    }
    return ok({ run: row });
  },
};

export const scriptsHandlers: CallbackHandler[] = [
  postScriptsRun,
  getScriptsRuns,
  getScriptsRunById,
];
