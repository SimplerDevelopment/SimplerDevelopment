/**
 * Brain org-units — hierarchical teams / departments / squads.
 *
 * Path model
 * ─────────
 * Each unit has a denormalized `path` like `/eng/platform/runtime`. Slug is
 * auto-derived from name on create (lowercase, alphanumeric, dash-separated;
 * per-tenant collisions get a `-2`, `-3`, … suffix). Slug + path are stable
 * for the unit's lifetime: renames do NOT change the slug (stable URLs).
 *
 * The `path` column lets us answer "give me the subtree under /eng" in one
 * query (`WHERE path LIKE '/eng/%' OR path = '/eng'`). Reparenting (`moveOrgUnit`)
 * rewrites the path prefix for the moved unit AND every descendant — done
 * per-row inside a transaction, in JS, mirroring the topic-ltree pattern from
 * the sibling brain-restructure branch. We deliberately do NOT use SQL
 * `substring(path from $param)` because postgres-js has bigint binding issues
 * for the offset argument and we end up with a silently broken path-sync.
 *
 * Audit-in-tx deadlock
 * ────────────────────
 * `lib/db` is pinned to `max: 1`. Calling `logAudit` from inside a
 * `db.transaction(...)` deadlocks (the audit insert waits for the same
 * connection the transaction is holding). So path-sync write paths
 * (move / merge / delete-with-cascade) commit the tx FIRST and write a single
 * audit row AFTER. Granularity is fine for the org-unit use case.
 */

import { db } from '@/lib/db';
import {
  brainOrgUnits,
  brainPersonOrgUnits,
  brainPeople,
} from '@/lib/db/schema';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { logAudit } from './audit';

// ─── Types ──────────────────────────────────────────────────────────────────

export type BrainOrgUnit = typeof brainOrgUnits.$inferSelect;

export interface BrainOrgUnitTreeNode extends BrainOrgUnit {
  children: BrainOrgUnitTreeNode[];
  memberCount: number;
}

export interface OrgUnitMemberSummary {
  personId: number;
  fullName: string;
  title: string | null;
  primary: boolean;
  roleInUnit: string | null;
}

export interface OrgUnitAncestor {
  id: number;
  name: string;
  slug: string;
}

export interface BrainOrgUnitWithDetails {
  unit: BrainOrgUnit;
  ancestors: OrgUnitAncestor[];
  members: OrgUnitMemberSummary[];
}

export interface CreateOrgUnitInput {
  name: string;
  parentId?: number | null;
  description?: string | null;
  leadPersonId?: number | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export interface UpdateOrgUnitInput {
  name?: string;
  description?: string | null;
  leadPersonId?: number | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export interface AddMemberArgs {
  orgUnitId: number;
  personId: number;
  primary?: boolean;
  roleInUnit?: string | null;
}

// ─── Pure helpers (unit-testable, no DB) ────────────────────────────────────

/**
 * Lowercase + ASCII-fold + dash-separate. Collapses any non-alphanumeric run
 * into a single dash and trims leading/trailing dashes. Empty result falls
 * back to `'unit'` so we always return a non-empty token.
 */
export function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > 0 ? base.slice(0, 140) : 'unit';
}

/**
 * Given a base slug and the set of slugs already in use for this tenant,
 * return a non-conflicting variant — `base`, `base-2`, `base-3`, …
 */
export function nextAvailableSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/**
 * Build a unit's path from its parent's path + its own slug. Parent path
 * `null` means root.
 */
export function buildPath(parentPath: string | null, slug: string): string {
  if (!parentPath) return `/${slug}`;
  return `${parentPath}/${slug}`;
}

/**
 * Rewrite a subtree path when its root moves from `oldRoot` → `newRoot`.
 * Used by `moveOrgUnit` to compute the new path for every descendant.
 *
 *   rewriteSubtreePath('/eng/platform/runtime', '/eng/platform', '/infra/platform')
 *     → '/infra/platform/runtime'
 *
 * Throws if `path` is not under `oldRoot` — that's a caller bug.
 */
export function rewriteSubtreePath(path: string, oldRoot: string, newRoot: string): string {
  if (path === oldRoot) return newRoot;
  if (path.startsWith(`${oldRoot}/`)) {
    return `${newRoot}${path.slice(oldRoot.length)}`;
  }
  throw new Error(`rewriteSubtreePath: path ${path} is not under ${oldRoot}`);
}

/**
 * Cycle guard for `moveOrgUnit`: refuse if the proposed new parent is the
 * unit itself OR any of its descendants. Pure — caller supplies the list of
 * (id, path) pairs from the moving subtree.
 */
export function wouldCreateCycle(
  movingUnitId: number,
  newParentId: number | null,
  subtree: ReadonlyArray<{ id: number }>,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === movingUnitId) return true;
  return subtree.some((row) => row.id === newParentId);
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

async function getTakenSlugs(clientId: number): Promise<Set<string>> {
  const rows = await db
    .select({ slug: brainOrgUnits.slug })
    .from(brainOrgUnits)
    .where(eq(brainOrgUnits.clientId, clientId));
  return new Set(rows.map((r) => r.slug));
}

async function loadUnitOwned(clientId: number, id: number): Promise<BrainOrgUnit | null> {
  const [row] = await db
    .select()
    .from(brainOrgUnits)
    .where(and(eq(brainOrgUnits.clientId, clientId), eq(brainOrgUnits.id, id)))
    .limit(1);
  return row ?? null;
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listOrgUnits(clientId: number): Promise<BrainOrgUnit[]> {
  return db
    .select()
    .from(brainOrgUnits)
    .where(eq(brainOrgUnits.clientId, clientId))
    .orderBy(asc(brainOrgUnits.path));
}

export async function getOrgUnitTree(clientId: number): Promise<BrainOrgUnitTreeNode[]> {
  // Flat fetch, then assemble in JS. memberCount is loaded in one
  // correlated query keyed by org_unit_id — hard-code the outer table.column
  // because `${brainPersonOrgUnits.orgUnitId}` emits unqualified `org_unit_id`
  // which would silently collide with the outer table's alias.
  const flat = await listOrgUnits(clientId);

  // memberCount per unit — one cheap GROUP BY.
  const memberCountRows = await db
    .select({
      orgUnitId: brainPersonOrgUnits.orgUnitId,
      count: sql<number>`count(*)::int`,
    })
    .from(brainPersonOrgUnits)
    .where(eq(brainPersonOrgUnits.clientId, clientId))
    .groupBy(brainPersonOrgUnits.orgUnitId);

  const countByUnit = new Map<number, number>();
  for (const r of memberCountRows) countByUnit.set(r.orgUnitId, Number(r.count));

  const byId = new Map<number, BrainOrgUnitTreeNode>();
  for (const u of flat) {
    byId.set(u.id, { ...u, children: [], memberCount: countByUnit.get(u.id) ?? 0 });
  }

  const roots: BrainOrgUnitTreeNode[] = [];
  for (const u of flat) {
    const node = byId.get(u.id)!;
    if (u.parentId == null) {
      roots.push(node);
    } else {
      const parent = byId.get(u.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node); // orphan defense — surface rather than swallow
    }
  }

  // Sort children by sortOrder, then name. Roots are already path-ordered
  // from listOrgUnits but re-sort to keep order stable post-tree-assembly.
  const sortChildren = (nodes: BrainOrgUnitTreeNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

export async function getOrgUnitById(
  clientId: number,
  id: number,
): Promise<BrainOrgUnitWithDetails | null> {
  const unit = await loadUnitOwned(clientId, id);
  if (!unit) return null;

  // Ancestors — walk parent chain via path segments. The path is
  // /a/b/c → ancestor slugs ['a', 'b']. Re-resolve to ids in one query.
  const segments = unit.path.split('/').filter((s) => s.length > 0);
  const ancestorSlugs = segments.slice(0, -1); // drop self
  let ancestors: OrgUnitAncestor[] = [];
  if (ancestorSlugs.length > 0) {
    const ancestorRows = await db
      .select({ id: brainOrgUnits.id, name: brainOrgUnits.name, slug: brainOrgUnits.slug, path: brainOrgUnits.path })
      .from(brainOrgUnits)
      .where(and(
        eq(brainOrgUnits.clientId, clientId),
        sql`${brainOrgUnits.slug} = ANY(${ancestorSlugs}::text[])`,
      ));
    // Match by full path prefix to disambiguate same-slug-different-branch
    // collisions (rare in practice — slugs are unique per tenant — but the
    // schema doesn't enforce path uniqueness, only slug uniqueness, so be
    // safe). Order them by slug position in `segments`.
    const ancestorPaths = segments.slice(0, -1).map((_, i) => `/${segments.slice(0, i + 1).join('/')}`);
    const byPath = new Map(ancestorRows.map((r) => [r.path, r] as const));
    ancestors = ancestorPaths
      .map((p) => byPath.get(p))
      .filter((r): r is { id: number; name: string; slug: string; path: string } => Boolean(r))
      .map(({ id: aid, name, slug }) => ({ id: aid, name, slug }));
  }

  // Members — join brain_person_org_units → brain_people. Tenant-scoped.
  const memberRows = await db
    .select({
      personId: brainPersonOrgUnits.personId,
      fullName: brainPeople.fullName,
      title: brainPeople.title,
      primary: brainPersonOrgUnits.primary,
      roleInUnit: brainPersonOrgUnits.roleInUnit,
    })
    .from(brainPersonOrgUnits)
    .innerJoin(brainPeople, eq(brainPeople.id, brainPersonOrgUnits.personId))
    .where(and(
      eq(brainPersonOrgUnits.clientId, clientId),
      eq(brainPersonOrgUnits.orgUnitId, id),
    ))
    .orderBy(asc(brainPeople.fullName));

  return {
    unit,
    ancestors,
    members: memberRows.map((r) => ({
      personId: r.personId,
      fullName: r.fullName,
      title: r.title,
      primary: r.primary,
      roleInUnit: r.roleInUnit,
    })),
  };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export async function createOrgUnit(
  clientId: number,
  actorId: number | null,
  input: CreateOrgUnitInput,
): Promise<BrainOrgUnit> {
  const name = input.name.trim();
  if (!name) throw new Error('Org unit name is required.');

  // Verify parent (if any) belongs to client.
  let parentPath: string | null = null;
  if (input.parentId != null) {
    const parent = await loadUnitOwned(clientId, input.parentId);
    if (!parent) throw new Error(`Parent org unit ${input.parentId} not found for this tenant.`);
    parentPath = parent.path;
  }

  // Verify leadPersonId (if set) belongs to client.
  if (input.leadPersonId != null) {
    const [person] = await db
      .select({ id: brainPeople.id })
      .from(brainPeople)
      .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.id, input.leadPersonId)))
      .limit(1);
    if (!person) throw new Error(`Lead person ${input.leadPersonId} not found for this tenant.`);
  }

  const baseSlug = slugifyName(name);
  const taken = await getTakenSlugs(clientId);
  const slug = nextAvailableSlug(baseSlug, taken);
  const path = buildPath(parentPath, slug);

  const [created] = await db
    .insert(brainOrgUnits)
    .values({
      clientId,
      parentId: input.parentId ?? null,
      name: name.slice(0, 150),
      slug,
      path,
      description: input.description ?? null,
      leadPersonId: input.leadPersonId ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      sortOrder: input.sortOrder ?? 0,
      createdBy: actorId,
    })
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_org_unit.create',
    entityType: 'brain_org_unit',
    entityId: created.id,
    metadata: { name: created.name, slug: created.slug, path: created.path, parentId: created.parentId },
  });

  return created;
}

export async function updateOrgUnit(
  clientId: number,
  actorId: number | null,
  id: number,
  patch: UpdateOrgUnitInput,
): Promise<BrainOrgUnit | null> {
  const before = await loadUnitOwned(clientId, id);
  if (!before) return null;

  // Verify leadPersonId (if set) belongs to client.
  if (patch.leadPersonId != null) {
    const [person] = await db
      .select({ id: brainPeople.id })
      .from(brainPeople)
      .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.id, patch.leadPersonId)))
      .limit(1);
    if (!person) throw new Error(`Lead person ${patch.leadPersonId} not found for this tenant.`);
  }

  const next: Partial<typeof brainOrgUnits.$inferInsert> = { updatedAt: new Date() };
  // Name change does NOT affect slug or path — URLs stay stable.
  if (patch.name !== undefined) next.name = patch.name.trim().slice(0, 150);
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.leadPersonId !== undefined) next.leadPersonId = patch.leadPersonId;
  if (patch.color !== undefined) next.color = patch.color;
  if (patch.icon !== undefined) next.icon = patch.icon;
  if (patch.sortOrder !== undefined) next.sortOrder = patch.sortOrder;

  const [updated] = await db
    .update(brainOrgUnits)
    .set(next)
    .where(and(eq(brainOrgUnits.id, id), eq(brainOrgUnits.clientId, clientId)))
    .returning();

  if (updated) {
    await logAudit({
      clientId,
      actorId,
      action: 'brain_org_unit.update',
      entityType: 'brain_org_unit',
      entityId: id,
      metadata: { changedFields: Object.keys(patch) },
    });
  }
  return updated ?? null;
}

/**
 * Re-parent a unit. Rewrites the subtree's path prefix in one transaction;
 * audit row is written AFTER commit (audit-in-tx would deadlock — see file
 * header).
 */
export async function moveOrgUnit(
  clientId: number,
  actorId: number | null,
  id: number,
  newParentId: number | null,
): Promise<BrainOrgUnit | null> {
  const moving = await loadUnitOwned(clientId, id);
  if (!moving) return null;

  // No-op if parent unchanged.
  if ((moving.parentId ?? null) === (newParentId ?? null)) return moving;

  // Resolve new parent (if any) and verify tenancy.
  let newParentPath: string | null = null;
  if (newParentId != null) {
    const newParent = await loadUnitOwned(clientId, newParentId);
    if (!newParent) throw new Error(`Parent org unit ${newParentId} not found for this tenant.`);
    newParentPath = newParent.path;
  }

  // Load full subtree (moving unit + descendants) up front so we can cycle-
  // guard and recompute paths in JS.
  const subtree = await db
    .select({ id: brainOrgUnits.id, path: brainOrgUnits.path })
    .from(brainOrgUnits)
    .where(and(
      eq(brainOrgUnits.clientId, clientId),
      sql`(${brainOrgUnits.path} = ${moving.path} OR ${brainOrgUnits.path} LIKE ${`${moving.path}/%`})`,
    ));

  if (wouldCreateCycle(id, newParentId, subtree)) {
    throw new Error('Cannot move org unit under itself or one of its descendants.');
  }

  const newOwnPath = buildPath(newParentPath, moving.slug);
  const oldPath = moving.path;

  await db.transaction(async (tx) => {
    // Update the moving unit (parentId + path).
    await tx
      .update(brainOrgUnits)
      .set({ parentId: newParentId, path: newOwnPath, updatedAt: new Date() })
      .where(and(eq(brainOrgUnits.id, id), eq(brainOrgUnits.clientId, clientId)));

    // Update every descendant path. Per-row in JS, not a SQL substring —
    // postgres-js bigint binding issues with `substring(text from $param)`
    // make the single-UPDATE approach unsafe.
    for (const row of subtree) {
      if (row.id === id) continue;
      const rewritten = rewriteSubtreePath(row.path, oldPath, newOwnPath);
      await tx
        .update(brainOrgUnits)
        .set({ path: rewritten, updatedAt: new Date() })
        .where(and(eq(brainOrgUnits.id, row.id), eq(brainOrgUnits.clientId, clientId)));
    }
  });

  await logAudit({
    clientId,
    actorId,
    action: 'brain_org_unit.move',
    entityType: 'brain_org_unit',
    entityId: id,
    metadata: {
      oldParentId: moving.parentId,
      newParentId,
      oldPath,
      newPath: newOwnPath,
      descendantsRewritten: subtree.length - 1,
    },
  });

  const [after] = await db
    .select()
    .from(brainOrgUnits)
    .where(and(eq(brainOrgUnits.id, id), eq(brainOrgUnits.clientId, clientId)))
    .limit(1);
  return after ?? null;
}

/**
 * Merge `sourceId` into `targetId`: reattach members + children, then delete
 * source. Member dedupe via ON CONFLICT-style read-then-skip (the junction's
 * unique index would otherwise abort the tx).
 */
export async function mergeOrgUnits(
  clientId: number,
  actorId: number | null,
  sourceId: number,
  targetId: number,
): Promise<BrainOrgUnit | null> {
  if (sourceId === targetId) throw new Error('Cannot merge an org unit into itself.');

  const source = await loadUnitOwned(clientId, sourceId);
  if (!source) return null;
  const target = await loadUnitOwned(clientId, targetId);
  if (!target) throw new Error(`Target org unit ${targetId} not found for this tenant.`);

  // Refuse if target is a descendant of source — would orphan target's
  // subtree under the about-to-be-deleted source.
  if (target.path === source.path || target.path.startsWith(`${source.path}/`)) {
    throw new Error('Cannot merge an org unit into one of its own descendants.');
  }

  // Existing members of target — used to skip dupes when reattaching.
  const targetMembers = await db
    .select({ personId: brainPersonOrgUnits.personId })
    .from(brainPersonOrgUnits)
    .where(and(
      eq(brainPersonOrgUnits.clientId, clientId),
      eq(brainPersonOrgUnits.orgUnitId, targetId),
    ));
  const targetMemberIds = new Set(targetMembers.map((r) => r.personId));

  const sourceMembers = await db
    .select({ personId: brainPersonOrgUnits.personId, primary: brainPersonOrgUnits.primary, roleInUnit: brainPersonOrgUnits.roleInUnit })
    .from(brainPersonOrgUnits)
    .where(and(
      eq(brainPersonOrgUnits.clientId, clientId),
      eq(brainPersonOrgUnits.orgUnitId, sourceId),
    ));

  // Children of source — re-parent under target. Capture their old paths so
  // we can rewrite their subtrees.
  const sourceChildren = await db
    .select({ id: brainOrgUnits.id, path: brainOrgUnits.path, slug: brainOrgUnits.slug })
    .from(brainOrgUnits)
    .where(and(
      eq(brainOrgUnits.clientId, clientId),
      eq(brainOrgUnits.parentId, sourceId),
    ));

  // Pre-compute path rewrites for source children + their descendants.
  // For each child, the new own-path is `${target.path}/${child.slug}`.
  // Then their descendants get rewritten relative to that.
  const allDescendants = await db
    .select({ id: brainOrgUnits.id, path: brainOrgUnits.path })
    .from(brainOrgUnits)
    .where(and(
      eq(brainOrgUnits.clientId, clientId),
      sql`(${brainOrgUnits.path} LIKE ${`${source.path}/%`})`,
    ));

  await db.transaction(async (tx) => {
    // 1. Move children rows: parentId → targetId.
    for (const child of sourceChildren) {
      const newChildPath = buildPath(target.path, child.slug);
      await tx
        .update(brainOrgUnits)
        .set({ parentId: targetId, path: newChildPath, updatedAt: new Date() })
        .where(and(eq(brainOrgUnits.id, child.id), eq(brainOrgUnits.clientId, clientId)));
    }

    // 2. Rewrite deeper descendants (everything strictly below the moved
    // children). Each `allDescendants` row whose path was previously
    // `${source.path}/${child.slug}/…` becomes `${target.path}/${child.slug}/…`.
    for (const desc of allDescendants) {
      // Skip rows we already rewrote in step 1.
      if (sourceChildren.some((c) => c.id === desc.id)) continue;
      const rewritten = rewriteSubtreePath(desc.path, source.path, target.path);
      await tx
        .update(brainOrgUnits)
        .set({ path: rewritten, updatedAt: new Date() })
        .where(and(eq(brainOrgUnits.id, desc.id), eq(brainOrgUnits.clientId, clientId)));
    }

    // 3. Reattach members — skip rows that would conflict with target's
    // existing members on the (personId, orgUnitId) unique index.
    for (const m of sourceMembers) {
      if (targetMemberIds.has(m.personId)) {
        // Already member of target. Drop the source row — keep target's.
        await tx
          .delete(brainPersonOrgUnits)
          .where(and(
            eq(brainPersonOrgUnits.clientId, clientId),
            eq(brainPersonOrgUnits.orgUnitId, sourceId),
            eq(brainPersonOrgUnits.personId, m.personId),
          ));
      } else {
        await tx
          .update(brainPersonOrgUnits)
          .set({ orgUnitId: targetId })
          .where(and(
            eq(brainPersonOrgUnits.clientId, clientId),
            eq(brainPersonOrgUnits.orgUnitId, sourceId),
            eq(brainPersonOrgUnits.personId, m.personId),
          ));
      }
    }

    // 4. Delete the source unit.
    await tx
      .delete(brainOrgUnits)
      .where(and(eq(brainOrgUnits.id, sourceId), eq(brainOrgUnits.clientId, clientId)));
  });

  await logAudit({
    clientId,
    actorId,
    action: 'brain_org_unit.merge',
    entityType: 'brain_org_unit',
    entityId: targetId,
    metadata: {
      sourceId,
      sourceName: source.name,
      sourceSlug: source.slug,
      sourcePath: source.path,
      targetPath: target.path,
      childrenMoved: sourceChildren.length,
      membersMoved: sourceMembers.length,
    },
  });

  return loadUnitOwned(clientId, targetId);
}

export async function deleteOrgUnit(
  clientId: number,
  actorId: number | null,
  id: number,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  const before = await loadUnitOwned(clientId, id);
  if (!before) return false;

  const [memberRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(brainPersonOrgUnits)
    .where(and(
      eq(brainPersonOrgUnits.clientId, clientId),
      eq(brainPersonOrgUnits.orgUnitId, id),
    ));
  const memberCount = Number(memberRow?.count ?? 0);

  const childRows = await db
    .select({ id: brainOrgUnits.id, slug: brainOrgUnits.slug, path: brainOrgUnits.path })
    .from(brainOrgUnits)
    .where(and(
      eq(brainOrgUnits.clientId, clientId),
      eq(brainOrgUnits.parentId, id),
    ));

  if ((memberCount > 0 || childRows.length > 0) && !opts.force) {
    throw new Error(
      `Org unit has ${memberCount} member(s) and ${childRows.length} child unit(s). Pass force=true to cascade.`,
    );
  }

  // Cascade target for children: the deleted unit's parent (so the subtree
  // collapses one level), or null (becomes a root) if the deleted unit was
  // already a root.
  const newParentId = before.parentId;
  const newParentPath: string | null = newParentId == null
    ? null
    : (await loadUnitOwned(clientId, newParentId))?.path ?? null;

  // Collect descendants for path rewrite. Need them BEFORE the delete.
  const subtree = await db
    .select({ id: brainOrgUnits.id, path: brainOrgUnits.path })
    .from(brainOrgUnits)
    .where(and(
      eq(brainOrgUnits.clientId, clientId),
      sql`(${brainOrgUnits.path} LIKE ${`${before.path}/%`})`,
    ));

  await db.transaction(async (tx) => {
    // Detach all members of the deleted unit.
    if (memberCount > 0) {
      await tx
        .delete(brainPersonOrgUnits)
        .where(and(
          eq(brainPersonOrgUnits.clientId, clientId),
          eq(brainPersonOrgUnits.orgUnitId, id),
        ));
    }

    // Re-parent children of the deleted unit to its parent (or root). Their
    // paths shift up one level.
    for (const child of childRows) {
      const newChildPath = buildPath(newParentPath, child.slug);
      await tx
        .update(brainOrgUnits)
        .set({ parentId: newParentId, path: newChildPath, updatedAt: new Date() })
        .where(and(eq(brainOrgUnits.id, child.id), eq(brainOrgUnits.clientId, clientId)));
    }

    // Deeper descendants — rewrite path prefix from `before.path/...` to
    // either `newParentPath/...` (subtree collapses) or `/...` (became root
    // subtree).
    for (const desc of subtree) {
      if (childRows.some((c) => c.id === desc.id)) continue;
      const rewritten = rewriteSubtreePath(
        desc.path,
        before.path,
        newParentPath ?? '',
      );
      await tx
        .update(brainOrgUnits)
        .set({ path: rewritten, updatedAt: new Date() })
        .where(and(eq(brainOrgUnits.id, desc.id), eq(brainOrgUnits.clientId, clientId)));
    }

    // Finally drop the unit itself.
    await tx
      .delete(brainOrgUnits)
      .where(and(eq(brainOrgUnits.id, id), eq(brainOrgUnits.clientId, clientId)));
  });

  await logAudit({
    clientId,
    actorId,
    action: 'brain_org_unit.delete',
    entityType: 'brain_org_unit',
    entityId: id,
    metadata: {
      name: before.name,
      slug: before.slug,
      path: before.path,
      force: opts.force === true,
      memberCount,
      childrenReparented: childRows.length,
    },
  });

  return true;
}

// ─── Membership ─────────────────────────────────────────────────────────────

export async function addMember(
  clientId: number,
  actorId: number | null,
  args: AddMemberArgs,
): Promise<BrainPersonOrgUnitRow> {
  const unit = await loadUnitOwned(clientId, args.orgUnitId);
  if (!unit) throw new Error(`Org unit ${args.orgUnitId} not found for this tenant.`);

  const [person] = await db
    .select({ id: brainPeople.id })
    .from(brainPeople)
    .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.id, args.personId)))
    .limit(1);
  if (!person) throw new Error(`Person ${args.personId} not found for this tenant.`);

  const primary = args.primary === true;
  const roleInUnit = args.roleInUnit ?? null;

  let resultRow: BrainPersonOrgUnitRow;

  await db.transaction(async (tx) => {
    // Upsert via PG's ON CONFLICT on (personId, orgUnitId) unique index.
    const [upserted] = await tx
      .insert(brainPersonOrgUnits)
      .values({
        clientId,
        personId: args.personId,
        orgUnitId: args.orgUnitId,
        primary,
        roleInUnit,
      })
      .onConflictDoUpdate({
        target: [brainPersonOrgUnits.personId, brainPersonOrgUnits.orgUnitId],
        set: { primary, roleInUnit },
      })
      .returning();
    resultRow = upserted;

    // If this membership is primary, flip primary=false on all OTHER
    // memberships for this person (app-layer invariant — at most one
    // primary per person).
    if (primary) {
      await tx
        .update(brainPersonOrgUnits)
        .set({ primary: false })
        .where(and(
          eq(brainPersonOrgUnits.clientId, clientId),
          eq(brainPersonOrgUnits.personId, args.personId),
          ne(brainPersonOrgUnits.orgUnitId, args.orgUnitId),
        ));
    }
  });

  await logAudit({
    clientId,
    actorId,
    action: 'brain_org_unit.add_member',
    entityType: 'brain_org_unit',
    entityId: args.orgUnitId,
    metadata: { personId: args.personId, primary, roleInUnit },
  });

  return resultRow!;
}

export async function removeMember(
  clientId: number,
  actorId: number | null,
  args: { orgUnitId: number; personId: number },
): Promise<boolean> {
  const res = await db
    .delete(brainPersonOrgUnits)
    .where(and(
      eq(brainPersonOrgUnits.clientId, clientId),
      eq(brainPersonOrgUnits.orgUnitId, args.orgUnitId),
      eq(brainPersonOrgUnits.personId, args.personId),
    ))
    .returning({ id: brainPersonOrgUnits.id });

  if (res.length === 0) return false;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_org_unit.remove_member',
    entityType: 'brain_org_unit',
    entityId: args.orgUnitId,
    metadata: { personId: args.personId },
  });
  return true;
}

/**
 * Mark `orgUnitId` as the primary membership for `personId`. All other
 * memberships for the person have primary set to false in the same tx.
 * Returns false when the (person, unit) pair doesn't exist.
 */
export async function setPrimaryUnit(
  clientId: number,
  actorId: number | null,
  personId: number,
  orgUnitId: number,
): Promise<boolean> {
  const [existing] = await db
    .select({ id: brainPersonOrgUnits.id })
    .from(brainPersonOrgUnits)
    .where(and(
      eq(brainPersonOrgUnits.clientId, clientId),
      eq(brainPersonOrgUnits.personId, personId),
      eq(brainPersonOrgUnits.orgUnitId, orgUnitId),
    ))
    .limit(1);
  if (!existing) return false;

  await db.transaction(async (tx) => {
    await tx
      .update(brainPersonOrgUnits)
      .set({ primary: false })
      .where(and(
        eq(brainPersonOrgUnits.clientId, clientId),
        eq(brainPersonOrgUnits.personId, personId),
        ne(brainPersonOrgUnits.orgUnitId, orgUnitId),
      ));
    await tx
      .update(brainPersonOrgUnits)
      .set({ primary: true })
      .where(and(
        eq(brainPersonOrgUnits.clientId, clientId),
        eq(brainPersonOrgUnits.personId, personId),
        eq(brainPersonOrgUnits.orgUnitId, orgUnitId),
      ));
  });

  await logAudit({
    clientId,
    actorId,
    action: 'brain_org_unit.set_primary',
    entityType: 'brain_org_unit',
    entityId: orgUnitId,
    metadata: { personId },
  });
  return true;
}

// ─── Re-exported row type for membership writes ─────────────────────────────

type BrainPersonOrgUnitRow = typeof brainPersonOrgUnits.$inferSelect;
