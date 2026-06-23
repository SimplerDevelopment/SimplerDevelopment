// Content Tools — blog draft handlers.
//
// /drafts        GET    — paginated list filtered to ctx.client.id
// /drafts/:id    GET    — single draft detail (IDOR-defended)
// /drafts/:id    PATCH  — edit title/body/status (IDOR-defended)
//
// Drafts are seeded by `draft-blog-post` runs; the PATCH callback lets the
// plugin UI surface inline edits.

import { z } from 'zod';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contentDrafts } from '@/lib/db/schema/plugins';
import type { CallbackHandler } from '../types';
import { ok, fail } from '../types';

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.coerce.number().int().positive().optional(),
});

const PatchDraftSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  body: z.string().optional(),
  status: z.enum(['draft', 'published-elsewhere']).optional(),
});

const getDrafts: CallbackHandler = {
  method: 'GET',
  path: '/drafts',
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
          eq(contentDrafts.clientId, ctx.client.id),
          lt(contentDrafts.id, cursor),
        )
      : eq(contentDrafts.clientId, ctx.client.id);

    const rows = await db
      .select()
      .from(contentDrafts)
      .where(whereExpr)
      .orderBy(desc(contentDrafts.id))
      .limit(limit);
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    return ok({ drafts: rows, nextCursor });
  },
};

const getDraftById: CallbackHandler = {
  method: 'GET',
  path: '/drafts/:id',
  scope: 'content:research:read',
  async handle(_req, ctx, params) {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return fail('validation_error', 'Invalid draft id.', 400);
    }
    const [row] = await db
      .select()
      .from(contentDrafts)
      .where(and(
        eq(contentDrafts.id, id),
        eq(contentDrafts.clientId, ctx.client.id),
      ))
      .limit(1);
    if (!row) {
      return fail('not_found', 'Draft not found.', 404);
    }
    return ok({ draft: row });
  },
};

const patchDraft: CallbackHandler = {
  method: 'PATCH',
  path: '/drafts/:id',
  scope: 'content:research:write',
  async handle(req, ctx, params) {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return fail('validation_error', 'Invalid draft id.', 400);
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('validation_error', 'Request body must be JSON.', 400);
    }
    const parsed = PatchDraftSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        'validation_error',
        'Invalid request body.',
        400,
        parsed.error.flatten(),
      );
    }
    if (
      parsed.data.title === undefined &&
      parsed.data.body === undefined &&
      parsed.data.status === undefined
    ) {
      return fail(
        'validation_error',
        'At least one of title, body, status must be present.',
        400,
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.body !== undefined) updates.body = parsed.data.body;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;

    const [updated] = await db
      .update(contentDrafts)
      .set(updates)
      .where(and(
        eq(contentDrafts.id, id),
        eq(contentDrafts.clientId, ctx.client.id),
      ))
      .returning();
    if (!updated) {
      // No row matched id+clientId — could be wrong tenant or non-existent.
      // Either way, surface as 404 (don't leak existence).
      return fail('not_found', 'Draft not found.', 404);
    }
    return ok({ draft: updated });
  },
};

export const draftsHandlers: CallbackHandler[] = [
  getDrafts,
  getDraftById,
  patchDraft,
];
