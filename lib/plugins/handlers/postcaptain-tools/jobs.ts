// Postcaptain Tools — schedule handlers.
//
// /jobs        POST    — create a schedule (weekly or cron)
// /jobs        GET     — list schedules (filtered to clientId)
// /jobs/:id    PATCH   — partial update; recomputes nextRunAt if the
//                        schedule shape changes
// /jobs/:id    DELETE  — hard delete (IDOR-defended)
//
// Two mutually-exclusive schedule modes:
//   weekly  — dayOfWeek (0..6) + timeUtc ('HH:mm'), the original v1 mode
//   cron    — cronExpr (5-field UTC cron), added in v2 for sub-weekly
//             cadences like daily competitor news-watch
//
// Math + validation live in `./schedule.ts` so this file only does HTTP
// concerns. `computeNextWeeklyRun` is re-exported for back-compat with any
// callers that still import it.

import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { registeredAppJobs } from '@/lib/db/schema/plugins';
import type { CallbackHandler } from '../types';
import { ok, fail } from '../types';
import {
  TIME_UTC_RE,
  assertExactlyOneMode,
  computeNextRun,
  validateCronExpr,
} from './schedule';

const KIND_ENUM = ['research-brief', 'draft-blog-post', 'competitor-research'] as const;

const ArgsResearchBrief = z.object({
  topic: z.string().min(1).max(255),
  focus: z.string().max(2000).optional(),
});
const ArgsDraftBlogPost = z.object({
  briefId: z.number().int().positive().optional(),
  topic: z.string().min(1).max(255).optional(),
  focus: z.string().max(2000).optional(),
});
const ArgsCompetitorResearch = z.object({
  competitorSlug: z.string().min(1).max(64),
  depth: z.enum(['news', 'deep']).default('news'),
  focus: z.string().max(2000).optional(),
  lookbackDays: z.number().int().min(1).max(365).optional(),
});

const CreateJobSchema = z.object({
  name: z.string().min(1).max(255),
  kind: z.enum(KIND_ENUM),
  args: z.union([ArgsResearchBrief, ArgsDraftBlogPost, ArgsCompetitorResearch]),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  timeUtc: z.string().regex(TIME_UTC_RE, 'timeUtc must be HH:mm (24h UTC)').optional(),
  cronExpr: z.string().min(1).max(64).optional(),
});

const UpdateJobSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  timeUtc: z.string().regex(TIME_UTC_RE).nullable().optional(),
  cronExpr: z.string().min(1).max(64).nullable().optional(),
  args: z.union([ArgsResearchBrief, ArgsDraftBlogPost, ArgsCompetitorResearch]).optional(),
});

/**
 * Back-compat shim: `computeNextWeeklyRun(dow, time, now)` was the v1 API.
 * Kept as a thin wrapper over the new `computeNextRun()` so any external
 * caller still importing it keeps working. Internal callers should use
 * `computeNextRun` directly.
 */
export function computeNextWeeklyRun(
  dayOfWeek: number,
  timeUtc: string,
  now: Date = new Date(),
): Date {
  return computeNextRun({ dayOfWeek, timeUtc, cronExpr: null }, now);
}

const postJob: CallbackHandler = {
  method: 'POST',
  path: '/jobs',
  scope: 'postcaptain:research:write',
  async handle(req, ctx) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('validation_error', 'Request body must be JSON.', 400);
    }
    const parsed = CreateJobSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        'validation_error',
        'Invalid request body.',
        400,
        parsed.error.flatten(),
      );
    }
    const { name, kind, args, dayOfWeek, timeUtc, cronExpr } = parsed.data;

    // Mutually-exclusive mode validation. Errors from assertExactlyOneMode
    // become 400s with the precise reason so the caller sees what they got
    // wrong rather than a generic 'invalid schedule'.
    try {
      assertExactlyOneMode({ dayOfWeek, timeUtc, cronExpr });
    } catch (err) {
      return fail(
        'validation_error',
        err instanceof Error ? err.message : 'Invalid schedule.',
        400,
      );
    }
    if (cronExpr) {
      const cronCheck = validateCronExpr(cronExpr);
      if (!cronCheck.ok) {
        return fail('validation_error', cronCheck.error, 400);
      }
    }

    const nextRunAt = computeNextRun({ dayOfWeek, timeUtc, cronExpr });

    const [row] = await db
      .insert(registeredAppJobs)
      .values({
        appId: ctx.app.id,
        clientId: ctx.client.id,
        name,
        kind,
        args: args as Record<string, unknown>,
        dayOfWeek: dayOfWeek ?? null,
        timeUtc: timeUtc ?? null,
        cronExpr: cronExpr ?? null,
        nextRunAt,
        // createdBy: best-effort — the JWT sub field is the user id as
        // string. Coerce safely; null if non-numeric.
        createdBy: Number.isFinite(Number(ctx.claims.sub))
          ? Number(ctx.claims.sub)
          : null,
      })
      .returning();
    return ok({ job: row }, { status: 201 });
  },
};

const getJobs: CallbackHandler = {
  method: 'GET',
  path: '/jobs',
  scope: 'postcaptain:research:read',
  async handle(_req, ctx) {
    const rows = await db
      .select()
      .from(registeredAppJobs)
      .where(and(
        eq(registeredAppJobs.appId, ctx.app.id),
        eq(registeredAppJobs.clientId, ctx.client.id),
      ))
      .orderBy(desc(registeredAppJobs.id));
    return ok({ jobs: rows });
  },
};

const patchJob: CallbackHandler = {
  method: 'PATCH',
  path: '/jobs/:id',
  scope: 'postcaptain:research:write',
  async handle(req, ctx, params) {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return fail('validation_error', 'Invalid job id.', 400);
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('validation_error', 'Request body must be JSON.', 400);
    }
    const parsed = UpdateJobSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        'validation_error',
        'Invalid request body.',
        400,
        parsed.error.flatten(),
      );
    }
    // IDOR defense: load + check WHERE clientId first.
    const [existing] = await db
      .select()
      .from(registeredAppJobs)
      .where(and(
        eq(registeredAppJobs.id, id),
        eq(registeredAppJobs.appId, ctx.app.id),
        eq(registeredAppJobs.clientId, ctx.client.id),
      ))
      .limit(1);
    if (!existing) {
      return fail('not_found', 'Job not found.', 404);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;
    if (parsed.data.args !== undefined) updates.args = parsed.data.args;

    // Schedule fields: a PATCH may set, change, or null any of the three.
    // `null` is the explicit "clear this mode" signal — important when
    // switching from weekly to cron (or vice versa). `undefined` means
    // "leave as-is". We compute the *effective* post-update shape, validate
    // it, then recompute nextRunAt only if any schedule field actually
    // changed (avoids needless nextRunAt churn on name-only edits).
    const scheduleTouched =
      parsed.data.dayOfWeek !== undefined ||
      parsed.data.timeUtc !== undefined ||
      parsed.data.cronExpr !== undefined;

    if (scheduleTouched) {
      const effective = {
        dayOfWeek: parsed.data.dayOfWeek !== undefined
          ? parsed.data.dayOfWeek
          : existing.dayOfWeek,
        timeUtc: parsed.data.timeUtc !== undefined
          ? parsed.data.timeUtc
          : existing.timeUtc,
        cronExpr: parsed.data.cronExpr !== undefined
          ? parsed.data.cronExpr
          : existing.cronExpr,
      };
      try {
        assertExactlyOneMode(effective);
      } catch (err) {
        return fail(
          'validation_error',
          err instanceof Error ? err.message : 'Invalid schedule.',
          400,
        );
      }
      if (effective.cronExpr) {
        const cronCheck = validateCronExpr(effective.cronExpr);
        if (!cronCheck.ok) {
          return fail('validation_error', cronCheck.error, 400);
        }
      }
      if (parsed.data.dayOfWeek !== undefined) updates.dayOfWeek = parsed.data.dayOfWeek;
      if (parsed.data.timeUtc !== undefined) updates.timeUtc = parsed.data.timeUtc;
      if (parsed.data.cronExpr !== undefined) updates.cronExpr = parsed.data.cronExpr;
      updates.nextRunAt = computeNextRun(effective);
    }

    const [updated] = await db
      .update(registeredAppJobs)
      .set(updates)
      .where(and(
        eq(registeredAppJobs.id, id),
        eq(registeredAppJobs.clientId, ctx.client.id),
      ))
      .returning();
    return ok({ job: updated });
  },
};

const deleteJob: CallbackHandler = {
  method: 'DELETE',
  path: '/jobs/:id',
  scope: 'postcaptain:research:write',
  async handle(_req, ctx, params) {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return fail('validation_error', 'Invalid job id.', 400);
    }
    // Hard-delete WHERE id AND clientId — `returning()` doubles as the
    // IDOR check: if no row matches, nothing's returned, we 404.
    const deleted = await db
      .delete(registeredAppJobs)
      .where(and(
        eq(registeredAppJobs.id, id),
        eq(registeredAppJobs.appId, ctx.app.id),
        eq(registeredAppJobs.clientId, ctx.client.id),
      ))
      .returning({ id: registeredAppJobs.id });
    if (deleted.length === 0) {
      return fail('not_found', 'Job not found.', 404);
    }
    return ok({ deletedId: deleted[0].id });
  },
};

export const jobsHandlers: CallbackHandler[] = [
  postJob,
  getJobs,
  patchJob,
  deleteJob,
];
