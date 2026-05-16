// Postcaptain Tools — weekly schedule handlers.
//
// /jobs        POST    — create a weekly schedule
// /jobs        GET     — list schedules (filtered to clientId)
// /jobs/:id    PATCH   — partial update; recomputes nextRunAt if day/time
//                        change
// /jobs/:id    DELETE  — hard delete (IDOR-defended)
//
// v1 only supports weekly schedules (dayOfWeek 0..6 + timeUtc HH:mm). Cron
// expressions are out of scope per .planning/plugin-registry-spec.md
// §"Out of scope for v1".

import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { registeredAppJobs } from '@/lib/db/schema/plugins';
import type { CallbackHandler } from '../types';
import { ok, fail } from '../types';

const KIND_ENUM = ['research-brief', 'draft-blog-post'] as const;

const TIME_UTC_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const ArgsResearchBrief = z.object({
  topic: z.string().min(1).max(255),
  focus: z.string().max(2000).optional(),
});
const ArgsDraftBlogPost = z.object({
  briefId: z.number().int().positive().optional(),
  topic: z.string().min(1).max(255).optional(),
  focus: z.string().max(2000).optional(),
});

const CreateJobSchema = z.object({
  name: z.string().min(1).max(255),
  kind: z.enum(KIND_ENUM),
  args: z.union([ArgsResearchBrief, ArgsDraftBlogPost]),
  dayOfWeek: z.number().int().min(0).max(6),
  timeUtc: z.string().regex(TIME_UTC_RE, 'timeUtc must be HH:mm (24h UTC)'),
});

const UpdateJobSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  timeUtc: z.string().regex(TIME_UTC_RE).optional(),
  args: z.union([ArgsResearchBrief, ArgsDraftBlogPost]).optional(),
});

/**
 * Pure helper: compute the next UTC `Date` at which a weekly job should
 * run, given the (dayOfWeek, timeUtc) tuple and a reference `now`. If the
 * computed slot is exactly `now` or in the past today, we roll forward to
 * next week — schedules never fire instantly when created (avoids
 * accidental same-tick duplicates).
 *
 *   dayOfWeek: 0=Sunday, 6=Saturday (matches Date#getUTCDay)
 *   timeUtc:   'HH:mm' (24-hour UTC)
 */
export function computeNextWeeklyRun(
  dayOfWeek: number,
  timeUtc: string,
  now: Date = new Date(),
): Date {
  const m = timeUtc.match(TIME_UTC_RE);
  if (!m) throw new Error(`computeNextWeeklyRun: invalid timeUtc='${timeUtc}'`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 0 ||
    dayOfWeek > 6
  ) {
    throw new Error(`computeNextWeeklyRun: invalid dayOfWeek=${dayOfWeek}`);
  }

  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hours,
    minutes,
    0,
    0,
  ));
  // Days until target dayOfWeek. 0..6.
  let daysAhead = (dayOfWeek - candidate.getUTCDay() + 7) % 7;
  // If it's today AND we've already passed the slot, push to next week.
  if (daysAhead === 0 && candidate.getTime() <= now.getTime()) {
    daysAhead = 7;
  }
  candidate.setUTCDate(candidate.getUTCDate() + daysAhead);
  return candidate;
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
    const { name, kind, args, dayOfWeek, timeUtc } = parsed.data;
    const nextRunAt = computeNextWeeklyRun(dayOfWeek, timeUtc);

    const [row] = await db
      .insert(registeredAppJobs)
      .values({
        appId: ctx.app.id,
        clientId: ctx.client.id,
        name,
        kind,
        args: args as Record<string, unknown>,
        dayOfWeek,
        timeUtc,
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
    let dayChanged = false;
    let timeChanged = false;
    if (parsed.data.dayOfWeek !== undefined) {
      updates.dayOfWeek = parsed.data.dayOfWeek;
      dayChanged = parsed.data.dayOfWeek !== existing.dayOfWeek;
    }
    if (parsed.data.timeUtc !== undefined) {
      updates.timeUtc = parsed.data.timeUtc;
      timeChanged = parsed.data.timeUtc !== existing.timeUtc;
    }
    if (dayChanged || timeChanged) {
      const effectiveDow = (parsed.data.dayOfWeek ?? existing.dayOfWeek) as number;
      const effectiveTime = (parsed.data.timeUtc ?? existing.timeUtc) as string;
      updates.nextRunAt = computeNextWeeklyRun(effectiveDow, effectiveTime);
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
