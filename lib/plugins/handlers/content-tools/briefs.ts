// Content Tools — research brief handlers.
//
// /briefs        GET — paginated list filtered to ctx.client.id
// /briefs/:id    GET — single brief detail with IDOR defense
//
// Briefs are write-once outputs of `research-brief` runs (the runner inserts
// them); there's no public update/delete callback in v1.

import { z } from 'zod';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contentBriefs } from '@/lib/db/schema/plugins';
import type { CallbackHandler } from '../types';
import { ok, fail } from '../types';

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.coerce.number().int().positive().optional(),
});

const getBriefs: CallbackHandler = {
  method: 'GET',
  path: '/briefs',
  scope: 'content:research:read',
  async handle(req, ctx) {
    const url = new URL(req.url);
    const parsed = ListQuerySchema.safeParse({
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

    const whereExpr = cursor
      ? and(
          eq(contentBriefs.clientId, ctx.client.id),
          lt(contentBriefs.id, cursor),
        )
      : eq(contentBriefs.clientId, ctx.client.id);

    const rows = await db
      .select()
      .from(contentBriefs)
      .where(whereExpr)
      .orderBy(desc(contentBriefs.id))
      .limit(limit);
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    return ok({ briefs: rows, nextCursor });
  },
};

const getBriefById: CallbackHandler = {
  method: 'GET',
  path: '/briefs/:id',
  scope: 'content:research:read',
  async handle(_req, ctx, params) {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return fail('validation_error', 'Invalid brief id.', 400);
    }
    const [row] = await db
      .select()
      .from(contentBriefs)
      .where(and(
        eq(contentBriefs.id, id),
        eq(contentBriefs.clientId, ctx.client.id),
      ))
      .limit(1);
    if (!row) {
      return fail('not_found', 'Brief not found.', 404);
    }
    return ok({ brief: row });
  },
};

export const briefsHandlers: CallbackHandler[] = [getBriefs, getBriefById];
