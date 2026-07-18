/**
 * /api/extension/v1/tasks
 *
 *   POST → create a Brain task from the browser extension (e.g. "follow up with
 *          this person tomorrow", quick-task popup, "save this page as a TODO").
 *   GET  → list the current user's open extension-created tasks for the popup.
 *
 * Tenant-scoped on every query — `clientId` is always the resolved key's
 * client. Source recorded as `'extension'`; the `brain_tasks.source` column is
 * varchar(50) at the DB level so the value is permitted at runtime even though
 * the typed union in `lib/brain/tasks.ts` is narrower for back-compat.
 */

import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainTasks, type BrainTaskStatus } from '@/lib/db/schema';
import {
  withExtensionAuth,
  extensionOk,
  extensionError,
} from '@/lib/extension/with-auth';
import { createTask } from '@/lib/brain/tasks';

export const runtime = 'nodejs';

const createSchema = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string().max(5000).optional(),
  // ISO date string. Validated by `new Date(...)` below.
  dueAt: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().max(1000).optional(),
  // brain_tasks has no contact_id column — we capture it in the description
  // footer so the link is preserved without a schema migration.
  contactId: z.number().int().positive().optional(),
  companyId: z.number().int().positive().optional(),
  dealId: z.number().int().positive().optional(),
  // brain_tasks priority is `low | medium | high | urgent`. The wrapper accepts
  // `low | normal | high` per the API contract and maps `normal` → `medium`.
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

const PRIORITY_MAP: Record<'low' | 'normal' | 'high', 'low' | 'medium' | 'high'> = {
  low: 'low',
  normal: 'medium',
  high: 'high',
};

function buildDescription(input: z.infer<typeof createSchema>): string | undefined {
  const parts: string[] = [];
  if (input.body && input.body.trim().length > 0) parts.push(input.body.trim());
  // brain_tasks has neither sourceUrl nor contactId; preserve them in the body
  // as a footer so the link is not lost.
  const refs: string[] = [];
  if (input.sourceUrl) refs.push(`Source: ${input.sourceUrl}`);
  if (input.contactId) refs.push(`Contact: #${input.contactId}`);
  if (refs.length > 0) parts.push(refs.join('\n'));
  if (parts.length === 0) return undefined;
  return parts.join('\n\n');
}

const POST = withExtensionAuth(async (req, ctx) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return extensionError('Invalid JSON body');
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return extensionError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }
  const input = parsed.data;

  let dueDate: Date | null = null;
  if (input.dueAt) {
    const d = new Date(input.dueAt);
    if (Number.isNaN(d.getTime())) {
      return extensionError('`dueAt` is not a valid ISO date');
    }
    dueDate = d;
  }

  const description = buildDescription(input);
  const priority = input.priority ? PRIORITY_MAP[input.priority] : undefined;

  const created = await createTask({
    clientId: ctx.client.id,
    title: input.title,
    description,
    dueDate,
    priority,
    // 'extension' is a new provenance value; varchar(50) accepts it at runtime.
    source: 'extension' as never,
    createdBy: ctx.userId,
  });

  // The createTask helper doesn't accept companyId/dealId in its input shape,
  // even though the columns exist on brain_tasks. Patch them in via an update
  // when supplied.
  let row = created;
  if (input.companyId || input.dealId) {
    const patch: Partial<typeof brainTasks.$inferInsert> = { updatedAt: new Date() };
    if (input.companyId) patch.companyId = input.companyId;
    if (input.dealId) patch.dealId = input.dealId;
    const [updated] = await db.update(brainTasks)
      .set(patch)
      .where(and(eq(brainTasks.id, created.id), eq(brainTasks.clientId, ctx.client.id)))
      .returning();
    if (updated) row = updated;
  }

  return extensionOk(row, { status: 201 });
});

const listSchema = z.object({
  status: z.enum(['open', 'all']).default('open'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function slimTask(t: typeof brainTasks.$inferSelect) {
  // Recover sourceUrl from the description footer if present.
  let sourceUrl: string | null = null;
  if (t.description) {
    const m = t.description.match(/^Source:\s*(\S+)/m);
    if (m) sourceUrl = m[1];
  }
  return {
    id: t.id,
    title: t.title,
    dueAt: t.dueDate,
    status: t.status,
    sourceUrl,
    contactId: null as number | null,
    companyId: t.companyId,
    dealId: t.dealId,
  };
}

const GET = withExtensionAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const parsed = listSchema.safeParse({
    status: url.searchParams.get('status') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return extensionError(`Invalid query: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }
  const { status, limit } = parsed.data;

  const conds = [eq(brainTasks.clientId, ctx.client.id)];
  if (status === 'open') {
    conds.push(eq(brainTasks.status, 'open' satisfies BrainTaskStatus));
  }

  const rows = await db.select().from(brainTasks)
    .where(and(...conds))
    .orderBy(desc(brainTasks.createdAt))
    .limit(limit);

  return extensionOk({ items: rows.map(slimTask) });
});

export { POST, GET };
export const OPTIONS = POST;
