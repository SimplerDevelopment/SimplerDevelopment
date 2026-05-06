import { db } from '@/lib/db';
import { brainSavedSearches, type BrainSavedSearchFilters } from '@/lib/db/schema';
import { and, asc, eq, isNull, or, type SQL } from 'drizzle-orm';
import { logAudit } from './audit';

export type BrainSavedSearch = typeof brainSavedSearches.$inferSelect;
export type { BrainSavedSearchFilters };

interface ListOpts {
  /**
   * `null` -> shared-only.
   * `number` -> rows visible to that user (their own personal pins OR shared
   * pins where userId IS NULL).
   * `undefined` -> all rows for the tenant (admin/dev path).
   */
  userId?: number | null;
}

export async function listSavedSearches(
  clientId: number,
  opts: ListOpts = {},
): Promise<BrainSavedSearch[]> {
  const conds: SQL[] = [eq(brainSavedSearches.clientId, clientId)];

  if (opts.userId === null) {
    conds.push(isNull(brainSavedSearches.userId));
  } else if (typeof opts.userId === 'number') {
    const scope = or(
      eq(brainSavedSearches.userId, opts.userId),
      isNull(brainSavedSearches.userId),
    );
    if (scope) conds.push(scope);
  }

  return db.select().from(brainSavedSearches)
    .where(and(...conds))
    .orderBy(asc(brainSavedSearches.sortOrder), asc(brainSavedSearches.createdAt));
}

export async function getSavedSearch(
  clientId: number,
  id: number,
): Promise<BrainSavedSearch | null> {
  const [row] = await db.select().from(brainSavedSearches)
    .where(and(eq(brainSavedSearches.id, id), eq(brainSavedSearches.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

interface CreateInput {
  clientId: number;
  /** null = shared (team) pin, number = personal. */
  userId: number | null;
  name: string;
  icon?: string;
  filters: BrainSavedSearchFilters;
  sortOrder?: number;
  createdBy?: number | null;
}

export async function createSavedSearch(input: CreateInput): Promise<BrainSavedSearch> {
  const [created] = await db.insert(brainSavedSearches).values({
    clientId: input.clientId,
    userId: input.userId,
    name: input.name.trim().slice(0, 150),
    icon: input.icon ?? 'bookmark',
    filters: input.filters,
    sortOrder: input.sortOrder ?? 0,
    createdBy: input.createdBy ?? null,
  }).returning();

  await logAudit({
    clientId: input.clientId,
    actorId: input.createdBy ?? null,
    action: 'saved_search.created',
    entityType: 'brain_saved_search',
    entityId: created.id,
  });

  return created;
}

interface UpdateInput {
  name?: string;
  icon?: string;
  filters?: BrainSavedSearchFilters;
  sortOrder?: number;
  /** Move between personal / shared scope. */
  userId?: number | null;
}

export async function updateSavedSearch(
  clientId: number,
  id: number,
  patch: UpdateInput,
  actorId: number | null = null,
): Promise<BrainSavedSearch | null> {
  const before = await getSavedSearch(clientId, id);
  if (!before) return null;

  const set: Partial<typeof brainSavedSearches.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 150);
  if (patch.icon !== undefined) set.icon = patch.icon;
  if (patch.filters !== undefined) set.filters = patch.filters;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  if (patch.userId !== undefined) set.userId = patch.userId;

  const [updated] = await db.update(brainSavedSearches).set(set)
    .where(and(eq(brainSavedSearches.id, id), eq(brainSavedSearches.clientId, clientId)))
    .returning();

  if (updated) {
    await logAudit({
      clientId,
      actorId,
      action: 'saved_search.updated',
      entityType: 'brain_saved_search',
      entityId: id,
      metadata: { changedFields: Object.keys(patch) },
    });
  }

  return updated ?? null;
}

export async function deleteSavedSearch(
  clientId: number,
  id: number,
  actorId: number | null = null,
): Promise<boolean> {
  const before = await getSavedSearch(clientId, id);
  if (!before) return false;
  await db.delete(brainSavedSearches)
    .where(and(eq(brainSavedSearches.id, id), eq(brainSavedSearches.clientId, clientId)));

  await logAudit({
    clientId,
    actorId,
    action: 'saved_search.deleted',
    entityType: 'brain_saved_search',
    entityId: id,
  });
  return true;
}
