/**
 * Brain topics — hierarchical taxonomy that cross-cuts every brain entity via
 * the polymorphic `brain_entity_topics` join.
 *
 * Path-sync invariants (kept by the helpers below):
 *   - `slug` is auto-derived from `name` on create (lowercase, non-[a-z0-9] → `-`,
 *     collapse, trim) and is scoped to clientId. Collisions get a suffix
 *     (`-2`, `-3`, …).
 *   - `path` is the `/`-joined chain of ancestor slugs ending with the topic's
 *     own slug — e.g. `/operations/hiring/engineering`. Rename DOES NOT change
 *     slug (stable URLs), so a name change is a no-op on path.
 *   - move/merge recompute the affected subtree's path atomically.
 *
 * Audit: create/update/move/merge/delete write to brain_audit_logs.
 * Attach/detach intentionally do NOT audit — too chatty (see PLAN.md).
 *
 * Phase 1 brain-restructure (Wave 2b). See .planning/brain-restructure/PLAN.md.
 */

import { db } from '@/lib/db';
import {
  brainTopics,
  brainEntityTopics,
  brainAuditLogs,
  brainNotes,
  brainMeetings,
  brainTasks,
  brainDecisions,
  brainRelationshipOverlays,
  type BrainTopicEntityType,
} from '@/lib/db/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { logAudit } from './audit';

export type BrainTopic = typeof brainTopics.$inferSelect;

/** Drizzle transaction handle — extracted from db.transaction's callback signature. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Drizzle db OR a transaction handle. Used by helpers that may be called from
 * inside review.ts's transaction OR standalone. */
type DbOrTx = typeof db | Tx;

/**
 * Tx-safe audit insert. Calling `logAudit` (which uses the module-global `db`)
 * from inside a `db.transaction(...)` callback DEADLOCKS — the postgres-js
 * pool is `max: 1`, so a fresh `db.insert(...)` request waits forever for the
 * outer transaction to release the connection it already holds. Inside a tx,
 * use this helper with the active `tx` handle instead.
 */
async function txAudit(conn: DbOrTx, args: {
  clientId: number;
  actorId: number | null;
  action: string;
  entityType: string;
  entityId?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await conn.insert(brainAuditLogs).values({
    clientId: args.clientId,
    actorId: args.actorId,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId ?? null,
    metadata: args.metadata ?? {},
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a URL-safe slug from a topic name. Lowercases, replaces any run of
 * non-[a-z0-9] with `-`, then trims leading/trailing dashes. Empty results
 * fall back to `topic` so we never produce an empty slug.
 */
export function deriveSlug(name: string): string {
  const cleaned = name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 150);
  return cleaned || 'topic';
}

/**
 * Find a slug that's unique among `brain_topics` for `(clientId, slug)`. If
 * `baseSlug` collides, suffix `-2`, `-3`, … up to a sane cap. The unique
 * index will still defend against a race, but this loop keeps the common
 * path collision-free.
 */
async function uniqueSlugForClient(conn: DbOrTx, clientId: number, baseSlug: string): Promise<string> {
  let slug = baseSlug;
  for (let i = 2; i < 1000; i++) {
    const [hit] = await conn.select({ id: brainTopics.id }).from(brainTopics)
      .where(and(eq(brainTopics.clientId, clientId), eq(brainTopics.slug, slug)))
      .limit(1);
    if (!hit) return slug;
    slug = `${baseSlug}-${i}`;
  }
  // Extremely unlikely, but better than infinite-loop.
  return `${baseSlug}-${Date.now().toString(36)}`;
}

/** Build a `/`-joined path from parent path + own slug. Parent path of null
 *  means a root topic — just `/<slug>`. */
function buildPath(parentPath: string | null, slug: string): string {
  if (!parentPath || parentPath === '/') return `/${slug}`;
  return `${parentPath}/${slug}`;
}

// ─── reads ───────────────────────────────────────────────────────────────────

/** Flat list, ordered by `path` (so children sort under their parents). */
export async function listTopics(clientId: number): Promise<BrainTopic[]> {
  return db.select().from(brainTopics)
    .where(eq(brainTopics.clientId, clientId))
    .orderBy(asc(brainTopics.path));
}

export interface BrainTopicTreeNode extends BrainTopic {
  childCount: number;
  entityCount: number;
  children: BrainTopicTreeNode[];
}

/**
 * Build a nested tree from the flat list. `childCount` and `entityCount` are
 * aggregated per node. `entityCount` reflects rows in `brain_entity_topics`
 * for that topic id (own-node only — descendants are not summed in).
 */
export async function getTopicTree(clientId: number): Promise<BrainTopicTreeNode[]> {
  const rows = await listTopics(clientId);
  if (rows.length === 0) return [];

  // Per-topic entity counts via group-by on brain_entity_topics.
  const counts = await db.select({
    topicId: brainEntityTopics.topicId,
    count: sql<number>`count(*)::int`,
  }).from(brainEntityTopics)
    .where(eq(brainEntityTopics.clientId, clientId))
    .groupBy(brainEntityTopics.topicId);
  const countByTopic = new Map<number, number>();
  for (const r of counts) countByTopic.set(r.topicId, Number(r.count));

  const byId = new Map<number, BrainTopicTreeNode>();
  for (const r of rows) {
    byId.set(r.id, {
      ...r,
      childCount: 0,
      entityCount: countByTopic.get(r.id) ?? 0,
      children: [],
    });
  }

  const roots: BrainTopicTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId != null && byId.has(node.parentId)) {
      const parent = byId.get(node.parentId)!;
      parent.children.push(node);
      parent.childCount += 1;
    } else {
      roots.push(node);
    }
  }

  const sortFn = (a: BrainTopicTreeNode, b: BrainTopicTreeNode) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  };
  const sortTree = (nodes: BrainTopicTreeNode[]) => {
    nodes.sort(sortFn);
    for (const n of nodes) sortTree(n.children);
  };
  sortTree(roots);
  return roots;
}

export interface BrainTopicWithBreadcrumb extends BrainTopic {
  /** Ancestor chain from root → immediate parent (does NOT include the topic itself). */
  breadcrumb: BrainTopic[];
}

/** Single topic + ancestor chain. Returns null if not found / cross-tenant. */
export async function getTopicById(clientId: number, id: number): Promise<BrainTopicWithBreadcrumb | null> {
  const [row] = await db.select().from(brainTopics)
    .where(and(eq(brainTopics.id, id), eq(brainTopics.clientId, clientId)))
    .limit(1);
  if (!row) return null;

  const breadcrumb: BrainTopic[] = [];
  let cursor: BrainTopic | undefined = row;
  // Walk up parents. Cap iterations to a sane depth so a corrupt cycle can't
  // hang the request.
  for (let depth = 0; depth < 50; depth++) {
    if (!cursor?.parentId) break;
    const [parent] = await db.select().from(brainTopics)
      .where(and(eq(brainTopics.id, cursor.parentId), eq(brainTopics.clientId, clientId)))
      .limit(1);
    if (!parent) break;
    breadcrumb.unshift(parent);
    cursor = parent;
  }

  return { ...row, breadcrumb };
}

// ─── writes ──────────────────────────────────────────────────────────────────

export interface CreateTopicInput {
  name: string;
  parentId?: number | null;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
  derivedFromTag?: string | null;
}

/**
 * Create a topic. Auto-derives slug + path. Slug is unique per (clientId, slug);
 * on collision, suffix `-2`, `-3`, … so `createTopic` is safe to call in a
 * loop (used by `importTopicsFromTags`).
 */
export async function createTopic(
  clientId: number,
  actorId: number | null,
  input: CreateTopicInput,
  opts: { tx?: DbOrTx } = {},
): Promise<BrainTopic> {
  const conn = opts.tx ?? db;
  const name = input.name.trim().slice(0, 150);
  if (!name) throw new Error('createTopic: name is required');

  // Resolve parent (and tenant-check) so we can build the path off its path.
  let parentPath: string | null = null;
  let parentId: number | null = null;
  if (input.parentId != null) {
    const [parent] = await conn.select({ id: brainTopics.id, path: brainTopics.path }).from(brainTopics)
      .where(and(eq(brainTopics.id, input.parentId), eq(brainTopics.clientId, clientId)))
      .limit(1);
    if (!parent) throw new Error(`createTopic: parent ${input.parentId} not found for this client`);
    parentId = parent.id;
    parentPath = parent.path;
  }

  const baseSlug = deriveSlug(name);
  const slug = await uniqueSlugForClient(conn, clientId, baseSlug);
  const path = buildPath(parentPath, slug);

  const [created] = await conn.insert(brainTopics).values({
    clientId,
    parentId,
    name,
    slug,
    path,
    description: input.description ?? null,
    color: input.color ?? null,
    icon: input.icon ?? null,
    sortOrder: input.sortOrder ?? 0,
    derivedFromTag: input.derivedFromTag ?? null,
    createdBy: actorId,
  }).returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_topic.create',
    entityType: 'brain_topic',
    entityId: created.id,
    metadata: { name: created.name, slug: created.slug, path: created.path, parentId: created.parentId },
  });

  return created;
}

export interface UpdateTopicPatch {
  name?: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

/**
 * Update a topic's metadata. NB: rename does NOT change slug (stable URLs);
 * to change slug, delete-and-recreate. Path is materialized off slug, so a
 * rename also leaves path untouched. parentId changes go through {@link moveTopic}.
 */
export async function updateTopic(
  clientId: number,
  actorId: number | null,
  id: number,
  patch: UpdateTopicPatch,
): Promise<BrainTopic | null> {
  const [before] = await db.select().from(brainTopics)
    .where(and(eq(brainTopics.id, id), eq(brainTopics.clientId, clientId)))
    .limit(1);
  if (!before) return null;

  const set: Partial<typeof brainTopics.$inferInsert> = { updatedAt: new Date() };
  const changedFields: string[] = [];
  if (patch.name !== undefined) {
    const next = patch.name.trim().slice(0, 150);
    if (next && next !== before.name) {
      set.name = next;
      changedFields.push('name');
    }
  }
  if (patch.description !== undefined && patch.description !== before.description) {
    set.description = patch.description;
    changedFields.push('description');
  }
  if (patch.color !== undefined && patch.color !== before.color) {
    set.color = patch.color;
    changedFields.push('color');
  }
  if (patch.icon !== undefined && patch.icon !== before.icon) {
    set.icon = patch.icon;
    changedFields.push('icon');
  }
  if (patch.sortOrder !== undefined && patch.sortOrder !== before.sortOrder) {
    set.sortOrder = patch.sortOrder;
    changedFields.push('sortOrder');
  }

  if (changedFields.length === 0) return before;

  const [updated] = await db.update(brainTopics).set(set)
    .where(and(eq(brainTopics.id, id), eq(brainTopics.clientId, clientId)))
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_topic.update',
    entityType: 'brain_topic',
    entityId: id,
    metadata: { changedFields },
  });

  return updated ?? null;
}

/**
 * Re-parent a topic. Refuses to create a cycle (newParent must not be a
 * descendant of `id`). Recomputes the affected subtree's `path` in a single
 * UPDATE per row of the subtree, all inside a transaction.
 */
export async function moveTopic(
  clientId: number,
  actorId: number | null,
  id: number,
  newParentId: number | null,
): Promise<BrainTopic | null> {
  return db.transaction(async (tx) => {
    const [node] = await tx.select().from(brainTopics)
      .where(and(eq(brainTopics.id, id), eq(brainTopics.clientId, clientId)))
      .limit(1);
    if (!node) return null;

    let newParentPath: string | null = null;
    if (newParentId != null) {
      if (newParentId === id) throw new Error('moveTopic: cannot parent a topic to itself');
      const [parent] = await tx.select().from(brainTopics)
        .where(and(eq(brainTopics.id, newParentId), eq(brainTopics.clientId, clientId)))
        .limit(1);
      if (!parent) throw new Error(`moveTopic: parent ${newParentId} not found for this client`);
      // Cycle guard: newParent must not be `node` or any of its descendants.
      // We detect via the materialized path — a descendant's path always
      // begins with `${node.path}/`.
      if (parent.path === node.path || parent.path.startsWith(`${node.path}/`)) {
        throw new Error('moveTopic: cannot move a topic under one of its own descendants');
      }
      newParentPath = parent.path;
    }

    const oldPath = node.path;
    const newPath = buildPath(newParentPath, node.slug);
    if (oldPath === newPath && node.parentId === newParentId) {
      // No-op move.
      return node;
    }

    // Update the node itself.
    await tx.update(brainTopics)
      .set({ parentId: newParentId, path: newPath, updatedAt: new Date() })
      .where(and(eq(brainTopics.id, id), eq(brainTopics.clientId, clientId)));

    // Rewrite descendants' paths. Match on the old prefix `${oldPath}/` so we
    // don't accidentally touch a sibling topic whose path shares the same
    // first few chars (e.g. `/foo` vs `/foo-bar`). Per-row in JS rather than
    // a single SQL UPDATE — `substring(text from N)` with parameterized N is
    // a sharp edge in postgres-js's bigint binding; the loop is N+1 round
    // trips in the worst case (root move of a deep tree) which is fine here.
    const likePattern = `${oldPath}/%`;
    const descendants = await tx.select({
      id: brainTopics.id,
      path: brainTopics.path,
    }).from(brainTopics)
      .where(and(
        eq(brainTopics.clientId, clientId),
        sql`brain_topics.path LIKE ${likePattern}`,
      ));
    const now = new Date();
    for (const d of descendants) {
      const rewritten = newPath + d.path.slice(oldPath.length);
      await tx.update(brainTopics)
        .set({ path: rewritten, updatedAt: now })
        .where(and(eq(brainTopics.id, d.id), eq(brainTopics.clientId, clientId)));
    }
    await txAudit(tx, {
      clientId,
      actorId,
      action: 'brain_topic.move',
      entityType: 'brain_topic',
      entityId: id,
      metadata: { from: { parentId: node.parentId, path: oldPath }, to: { parentId: newParentId, path: newPath } },
    });

    const [after] = await tx.select().from(brainTopics)
      .where(and(eq(brainTopics.id, id), eq(brainTopics.clientId, clientId)))
      .limit(1);
    return after ?? null;
  });
}

/**
 * Merge `sourceId` into `targetId`:
 *   1. Reattach all `brain_entity_topics` rows from source to target,
 *      skipping any that would collide with an existing (entity_type, entity_id,
 *      target_topic_id) row.
 *   2. Reparent source's children under target (recomputes their paths).
 *   3. Delete source.
 *
 * Transactional. Both topics must belong to the same client.
 */
export async function mergeTopic(
  clientId: number,
  actorId: number | null,
  sourceId: number,
  targetId: number,
): Promise<{ targetId: number; reattached: number; reparented: number; deletedSourceId: number } | null> {
  if (sourceId === targetId) throw new Error('mergeTopic: source and target are the same');
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(brainTopics)
      .where(and(eq(brainTopics.id, sourceId), eq(brainTopics.clientId, clientId))).limit(1);
    const [target] = await tx.select().from(brainTopics)
      .where(and(eq(brainTopics.id, targetId), eq(brainTopics.clientId, clientId))).limit(1);
    if (!source || !target) return null;

    // Refuse to merge a topic into one of its own descendants — that would
    // create an orphan path subtree we'd have to special-case to rewrite.
    if (target.path === source.path || target.path.startsWith(`${source.path}/`)) {
      throw new Error('mergeTopic: cannot merge a topic into one of its own descendants');
    }

    // 1. Reattach entity links. For each source row, move it to target IFF
    //    no row already exists for (target, entity_type, entity_id) — that
    //    would violate the unique index. Done in two steps using Drizzle:
    //    (a) read source rows, (b) read existing target rows, (c) update or
    //    delete based on overlap. This keeps it portable across postgres-js
    //    execute return shapes.
    const sourceRows = await tx.select({
      id: brainEntityTopics.id,
      entityType: brainEntityTopics.entityType,
      entityId: brainEntityTopics.entityId,
    }).from(brainEntityTopics)
      .where(and(eq(brainEntityTopics.clientId, clientId), eq(brainEntityTopics.topicId, sourceId)));

    const targetRows = await tx.select({
      entityType: brainEntityTopics.entityType,
      entityId: brainEntityTopics.entityId,
    }).from(brainEntityTopics)
      .where(and(eq(brainEntityTopics.clientId, clientId), eq(brainEntityTopics.topicId, targetId)));
    const targetKeys = new Set(targetRows.map((r) => `${r.entityType}:${r.entityId}`));

    let reattachedCount = 0;
    const dupSourceIds: number[] = [];
    for (const row of sourceRows) {
      const k = `${row.entityType}:${row.entityId}`;
      if (targetKeys.has(k)) {
        dupSourceIds.push(row.id);
      } else {
        await tx.update(brainEntityTopics)
          .set({ topicId: targetId })
          .where(eq(brainEntityTopics.id, row.id));
        targetKeys.add(k);
        reattachedCount += 1;
      }
    }
    if (dupSourceIds.length > 0) {
      await tx.delete(brainEntityTopics)
        .where(and(eq(brainEntityTopics.clientId, clientId), inArray(brainEntityTopics.id, dupSourceIds)));
    }

    // 2. Reparent source's children under target. Use moveTopic-style path
    //    rewrite per-child so descendants of those children stay consistent.
    const children = await tx.select().from(brainTopics)
      .where(and(eq(brainTopics.clientId, clientId), eq(brainTopics.parentId, sourceId)));
    let reparented = 0;
    for (const child of children) {
      const oldPath = child.path;
      const newPath = buildPath(target.path, child.slug);
      await tx.update(brainTopics)
        .set({ parentId: targetId, path: newPath, updatedAt: new Date() })
        .where(and(eq(brainTopics.id, child.id), eq(brainTopics.clientId, clientId)));
      const childDescendants = await tx.select({
        id: brainTopics.id,
        path: brainTopics.path,
      }).from(brainTopics)
        .where(and(
          eq(brainTopics.clientId, clientId),
          sql`brain_topics.path LIKE ${`${oldPath}/%`}`,
        ));
      const now = new Date();
      for (const d of childDescendants) {
        const rewritten = newPath + d.path.slice(oldPath.length);
        await tx.update(brainTopics)
          .set({ path: rewritten, updatedAt: now })
          .where(and(eq(brainTopics.id, d.id), eq(brainTopics.clientId, clientId)));
      }
      reparented += 1;
    }

    // 3. Delete the source.
    await tx.delete(brainTopics)
      .where(and(eq(brainTopics.id, sourceId), eq(brainTopics.clientId, clientId)));

    await txAudit(tx, {
      clientId,
      actorId,
      action: 'brain_topic.merge',
      entityType: 'brain_topic',
      entityId: targetId,
      metadata: {
        sourceId,
        sourceSlug: source.slug,
        targetSlug: target.slug,
        reattached: reattachedCount,
        reparented,
      },
    });

    return { targetId, reattached: reattachedCount, reparented, deletedSourceId: sourceId };
  });
}

/**
 * Delete a topic.
 *
 * Semantics:
 *   - REFUSES if the topic has any children, regardless of `force`. The caller
 *     should either delete children first or use `mergeTopic` to fold them
 *     elsewhere. (Without this rule, naive `force` would silently orphan a
 *     subtree to the root and we'd lose hierarchy intent.)
 *   - REFUSES if any `brain_entity_topics` rows reference it, unless `force=true`,
 *     in which case those join rows are dropped first.
 *   - Audits `brain_topic.delete`.
 */
export async function deleteTopic(
  clientId: number,
  actorId: number | null,
  id: number,
  opts: { force?: boolean } = {},
): Promise<{ deleted: boolean; reason?: string }> {
  const [topic] = await db.select().from(brainTopics)
    .where(and(eq(brainTopics.id, id), eq(brainTopics.clientId, clientId)))
    .limit(1);
  if (!topic) return { deleted: false, reason: 'not_found' };

  const [childRow] = await db.select({ id: brainTopics.id }).from(brainTopics)
    .where(and(eq(brainTopics.clientId, clientId), eq(brainTopics.parentId, id)))
    .limit(1);
  if (childRow) {
    return { deleted: false, reason: 'has_children' };
  }

  const [entityRow] = await db.select({ id: brainEntityTopics.id }).from(brainEntityTopics)
    .where(and(eq(brainEntityTopics.clientId, clientId), eq(brainEntityTopics.topicId, id)))
    .limit(1);
  if (entityRow && !opts.force) {
    return { deleted: false, reason: 'has_entities' };
  }

  return db.transaction(async (tx) => {
    if (entityRow && opts.force) {
      await tx.delete(brainEntityTopics)
        .where(and(eq(brainEntityTopics.clientId, clientId), eq(brainEntityTopics.topicId, id)));
    }
    await tx.delete(brainTopics)
      .where(and(eq(brainTopics.id, id), eq(brainTopics.clientId, clientId)));

    await txAudit(tx, {
      clientId,
      actorId,
      action: 'brain_topic.delete',
      entityType: 'brain_topic',
      entityId: id,
      metadata: { slug: topic.slug, path: topic.path, force: opts.force === true },
    });

    return { deleted: true };
  });
}

// ─── attach/detach ───────────────────────────────────────────────────────────

export interface AttachTopicsArgs {
  clientId: number;
  actorId: number | null;
  targetEntityType: BrainTopicEntityType;
  targetEntityId: number;
  topicIds: number[];
}

export interface AttachTopicsResult {
  attached: number;
  alreadyAttached: number;
  /** ids of the rows actually inserted, in insert order; [] if all were dupes. */
  insertedRowIds: number[];
}

/**
 * Bulk-attach topics to an entity. Idempotent: rows that already exist
 * (per the `(entity_type, entity_id, topic_id)` unique index) are skipped.
 * Tenant-checks every topic id against `clientId` — cross-tenant topic ids
 * are silently dropped (the dispatcher should validate upstream, but this
 * defends the DB regardless).
 *
 * Accepts a tx OR the default db so it can be called from inside review.ts's
 * approval transaction.
 *
 * Does NOT audit (per PLAN.md — attach/detach are too chatty).
 */
export async function attachTopics(
  txOrDb: DbOrTx,
  args: AttachTopicsArgs,
): Promise<AttachTopicsResult> {
  const { clientId, actorId, targetEntityType, targetEntityId, topicIds } = args;
  const conn = txOrDb;
  const uniqIds = Array.from(new Set(topicIds.filter((n) => Number.isFinite(n))));
  if (uniqIds.length === 0) return { attached: 0, alreadyAttached: 0, insertedRowIds: [] };

  // Tenant-check: drop any topic id that doesn't belong to this client.
  const valid = await conn.select({ id: brainTopics.id }).from(brainTopics)
    .where(and(eq(brainTopics.clientId, clientId), inArray(brainTopics.id, uniqIds)));
  const validIds = new Set(valid.map((r) => r.id));

  // Find which of the requested topic ids already have a row for this entity.
  const existing = await conn.select({ topicId: brainEntityTopics.topicId }).from(brainEntityTopics)
    .where(and(
      eq(brainEntityTopics.clientId, clientId),
      eq(brainEntityTopics.entityType, targetEntityType),
      eq(brainEntityTopics.entityId, targetEntityId),
      inArray(brainEntityTopics.topicId, uniqIds),
    ));
  const existingTopicIds = new Set(existing.map((r) => r.topicId));

  const toInsert = uniqIds.filter((tid) => validIds.has(tid) && !existingTopicIds.has(tid));
  if (toInsert.length === 0) {
    return { attached: 0, alreadyAttached: existingTopicIds.size, insertedRowIds: [] };
  }

  const inserted = await conn.insert(brainEntityTopics).values(
    toInsert.map((tid) => ({
      clientId,
      topicId: tid,
      entityType: targetEntityType,
      entityId: targetEntityId,
      createdBy: actorId,
    })),
  ).returning({ id: brainEntityTopics.id });

  return {
    attached: inserted.length,
    alreadyAttached: existingTopicIds.size,
    insertedRowIds: inserted.map((r) => r.id),
  };
}

export interface DetachTopicsArgs {
  targetEntityType: BrainTopicEntityType;
  targetEntityId: number;
  topicIds: number[];
}

/** Bulk-detach. Tenant-scoped, no-op if no rows match. Does not audit. */
export async function detachTopics(
  clientId: number,
  _actorId: number | null,
  args: DetachTopicsArgs,
): Promise<{ detached: number }> {
  const uniqIds = Array.from(new Set(args.topicIds.filter((n) => Number.isFinite(n))));
  if (uniqIds.length === 0) return { detached: 0 };

  const res = await db.delete(brainEntityTopics)
    .where(and(
      eq(brainEntityTopics.clientId, clientId),
      eq(brainEntityTopics.entityType, args.targetEntityType),
      eq(brainEntityTopics.entityId, args.targetEntityId),
      inArray(brainEntityTopics.topicId, uniqIds),
    ))
    .returning({ id: brainEntityTopics.id });

  return { detached: res.length };
}

// ─── list-entities ───────────────────────────────────────────────────────────

export interface ListEntitiesForTopicRow {
  entityType: BrainTopicEntityType;
  entityId: number;
  title: string;
}

export interface ListEntitiesForTopicResult {
  /** Flat list of rows for the topic, sorted by entityType then title. */
  items: ListEntitiesForTopicRow[];
  /** Same rows grouped by entityType — convenient for tabbed UI. */
  byType: Record<BrainTopicEntityType, ListEntitiesForTopicRow[]>;
}

/**
 * List the entities attached to a topic. Slim by default — returns just
 * `{ entityType, entityId, title }`. Joins to each entity's table to fetch
 * a display title; rows whose target was deleted are dropped (defensive — the
 * polymorphic join is not FK-enforced for tasks/decisions/etc.).
 */
export async function listEntitiesForTopic(
  clientId: number,
  topicId: number,
): Promise<ListEntitiesForTopicResult> {
  // Sanity check tenancy.
  const [t] = await db.select({ id: brainTopics.id }).from(brainTopics)
    .where(and(eq(brainTopics.id, topicId), eq(brainTopics.clientId, clientId)))
    .limit(1);
  if (!t) {
    return {
      items: [],
      byType: { note: [], meeting: [], task: [], decision: [], relationship_overlay: [] },
    };
  }

  const joinRows = await db.select({
    entityType: brainEntityTopics.entityType,
    entityId: brainEntityTopics.entityId,
  }).from(brainEntityTopics)
    .where(and(eq(brainEntityTopics.clientId, clientId), eq(brainEntityTopics.topicId, topicId)));

  if (joinRows.length === 0) {
    return {
      items: [],
      byType: { note: [], meeting: [], task: [], decision: [], relationship_overlay: [] },
    };
  }

  // Group ids by entityType so we can fetch titles in 5 queries instead of N.
  const byTypeIds: Record<BrainTopicEntityType, number[]> = {
    note: [], meeting: [], task: [], decision: [], relationship_overlay: [],
  };
  for (const r of joinRows) byTypeIds[r.entityType].push(r.entityId);

  const titlesByEntity: Record<BrainTopicEntityType, Map<number, string>> = {
    note: new Map(), meeting: new Map(), task: new Map(),
    decision: new Map(), relationship_overlay: new Map(),
  };

  if (byTypeIds.note.length) {
    const rs = await db.select({ id: brainNotes.id, title: brainNotes.title }).from(brainNotes)
      .where(and(eq(brainNotes.clientId, clientId), inArray(brainNotes.id, byTypeIds.note)));
    for (const r of rs) titlesByEntity.note.set(r.id, r.title);
  }
  if (byTypeIds.meeting.length) {
    const rs = await db.select({ id: brainMeetings.id, title: brainMeetings.title }).from(brainMeetings)
      .where(and(eq(brainMeetings.clientId, clientId), inArray(brainMeetings.id, byTypeIds.meeting)));
    for (const r of rs) titlesByEntity.meeting.set(r.id, r.title);
  }
  if (byTypeIds.task.length) {
    const rs = await db.select({ id: brainTasks.id, title: brainTasks.title }).from(brainTasks)
      .where(and(eq(brainTasks.clientId, clientId), inArray(brainTasks.id, byTypeIds.task)));
    for (const r of rs) titlesByEntity.task.set(r.id, r.title);
  }
  if (byTypeIds.decision.length) {
    const rs = await db.select({ id: brainDecisions.id, title: brainDecisions.title }).from(brainDecisions)
      .where(and(eq(brainDecisions.clientId, clientId), inArray(brainDecisions.id, byTypeIds.decision)));
    for (const r of rs) titlesByEntity.decision.set(r.id, r.title);
  }
  if (byTypeIds.relationship_overlay.length) {
    const rs = await db.select({
      id: brainRelationshipOverlays.id,
      summary: brainRelationshipOverlays.summary,
      relationshipType: brainRelationshipOverlays.relationshipType,
    }).from(brainRelationshipOverlays)
      .where(and(eq(brainRelationshipOverlays.clientId, clientId), inArray(brainRelationshipOverlays.id, byTypeIds.relationship_overlay)));
    for (const r of rs) {
      const title = r.summary?.trim() ? r.summary.slice(0, 120) : `Relationship #${r.id} (${r.relationshipType})`;
      titlesByEntity.relationship_overlay.set(r.id, title);
    }
  }

  const items: ListEntitiesForTopicRow[] = [];
  for (const r of joinRows) {
    const title = titlesByEntity[r.entityType].get(r.entityId);
    if (title == null) continue; // dangling join row — drop
    items.push({ entityType: r.entityType, entityId: r.entityId, title });
  }
  items.sort((a, b) => {
    if (a.entityType !== b.entityType) return a.entityType.localeCompare(b.entityType);
    return a.title.localeCompare(b.title);
  });

  const byType: Record<BrainTopicEntityType, ListEntitiesForTopicRow[]> = {
    note: [], meeting: [], task: [], decision: [], relationship_overlay: [],
  };
  for (const row of items) byType[row.entityType].push(row);

  return { items, byType };
}

// ─── import-from-tags ────────────────────────────────────────────────────────

export interface ImportTopicsFromTagsOpts {
  /** Only import tags whose first segment matches this prefix (e.g. 'kb'). */
  tagPrefix?: string;
  /** When true, return a report without writing any rows. */
  dryRun?: boolean;
}

export interface ImportTopicsFromTagsReport {
  topicsCreated: number;
  notesAttached: number;
  perTopic: Array<{ topicId: number | null; path: string; noteCount: number; created: boolean }>;
  dryRun: boolean;
}

/**
 * Import topics from `brain_notes.tags`. Tags containing `/` become a
 * hierarchical chain (e.g. `kb/marketing/seo` → `kb` → `marketing` → `seo`).
 * For each note that bears a given tag, attaches the leaf topic of that tag's
 * chain. Idempotent: re-running creates no duplicate topics or join rows.
 *
 * Note on slug derivation: each segment is slugified independently, so a tag
 * like `Marketing/SEO` becomes the chain `marketing` → `seo`. The first
 * topic created for a tag stamps `derivedFromTag` with the full original tag
 * string for traceability.
 */
export async function importTopicsFromTags(
  clientId: number,
  actorId: number | null,
  opts: ImportTopicsFromTagsOpts = {},
): Promise<ImportTopicsFromTagsReport> {
  const tagPrefix = opts.tagPrefix?.trim();
  const dryRun = opts.dryRun === true;

  // Pull every distinct tag string for this tenant's notes. Mirrors the
  // shape used by listAllTags but does it server-side per tag-prefix filter.
  const rows = await db.execute<{ tag: string }>(sql`
    SELECT DISTINCT jsonb_array_elements_text(brain_notes.tags::jsonb) AS tag
    FROM ${brainNotes}
    WHERE brain_notes.client_id = ${clientId}
      AND brain_notes.deleted_at IS NULL
      AND jsonb_typeof(brain_notes.tags::jsonb) = 'array'
      AND jsonb_array_length(brain_notes.tags::jsonb) > 0
  `);
  const allTags = (rows as unknown as Array<{ tag: string }>).map((r) => r.tag).filter(Boolean);
  const filtered = tagPrefix
    ? allTags.filter((t) => t === tagPrefix || t.startsWith(`${tagPrefix}/`))
    : allTags;

  const perTopic: ImportTopicsFromTagsReport['perTopic'] = [];
  let topicsCreated = 0;
  let notesAttached = 0;

  // Cache topics we've resolved (or created) during this run by path so the
  // chain-traversal for sibling tags doesn't re-query / re-create the parent.
  const topicsByPath = new Map<string, BrainTopic>();
  // Seed with existing topics for this tenant.
  const existing = await db.select().from(brainTopics).where(eq(brainTopics.clientId, clientId));
  for (const t of existing) topicsByPath.set(t.path, t);

  for (const tag of filtered) {
    // Split into segments. Skip empty tag and segments produced by trailing/
    // leading slashes (e.g. tag = `kb//x` → ['kb','x']).
    const segments = tag.split('/').map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) continue;

    // Walk the chain, find-or-create each segment under the previous one.
    let parentId: number | null = null;
    let parentPath: string | null = null;
    let leaf: BrainTopic | null = null;
    let chainCreatedAny = false;

    for (let i = 0; i < segments.length; i++) {
      const segName = segments[i];
      const segSlug = deriveSlug(segName);
      const candidatePath = buildPath(parentPath, segSlug);

      let node = topicsByPath.get(candidatePath);
      if (!node) {
        if (dryRun) {
          // Don't write — fabricate a placeholder so chain-walking continues.
          node = {
            id: -1, clientId, parentId, name: segName, slug: segSlug, path: candidatePath,
            description: null, color: null, icon: null, sortOrder: 0,
            derivedFromTag: i === segments.length - 1 ? tag : null,
            createdBy: actorId, createdAt: new Date(), updatedAt: new Date(),
          };
          topicsByPath.set(candidatePath, node);
          chainCreatedAny = true;
          topicsCreated += 1;
        } else {
          const created = await createTopic(clientId, actorId, {
            name: segName,
            parentId,
            derivedFromTag: i === segments.length - 1 ? tag : null,
          });
          // The slug may have been suffixed for collision — re-key on the
          // ACTUAL path Drizzle returned, not the candidate.
          topicsByPath.set(created.path, created);
          node = created;
          chainCreatedAny = true;
          topicsCreated += 1;
        }
      }
      parentId = node.id;
      parentPath = node.path;
      leaf = node;
    }

    if (!leaf) continue;

    // Attach this tag's notes to the leaf topic. attachTopics is per-entity,
    // so we loop note-by-note — idempotent via the unique index, so re-runs
    // contribute 0 to the count.
    const noteIds = await db.select({ id: brainNotes.id }).from(brainNotes)
      .where(and(
        eq(brainNotes.clientId, clientId),
        sql`${brainNotes.tags}::jsonb @> ${JSON.stringify([tag])}::jsonb`,
      ));
    let attachedForTag = 0;
    if (noteIds.length > 0 && !dryRun && leaf.id > 0) {
      for (const n of noteIds) {
        const res = await attachTopics(db, {
          clientId,
          actorId,
          targetEntityType: 'note',
          targetEntityId: n.id,
          topicIds: [leaf.id],
        });
        attachedForTag += res.attached;
        notesAttached += res.attached;
      }
    } else if (noteIds.length > 0 && dryRun) {
      // In dryRun we can't know which are already attached without scanning;
      // approximate by counting all notes that would be touched. Re-running
      // a real import on top is still idempotent.
      attachedForTag = noteIds.length;
      notesAttached += noteIds.length;
    }

    perTopic.push({
      topicId: leaf.id > 0 ? leaf.id : null,
      path: leaf.path,
      noteCount: attachedForTag,
      created: chainCreatedAny,
    });
  }

  return { topicsCreated, notesAttached, perTopic, dryRun };
}
