/**
 * Brain People + Expertise — Phase 4 backend.
 *
 * Responsibilities:
 *   - CRUD on internal people (employees / advisors / contractors). People are
 *     distinct from CRM contacts (external).
 *   - Expertise-tag namespace (flat, per-tenant) with merge support.
 *   - "Who knows X?" search — resolves a free-text query to candidate expertise
 *     tags and ranks people by tag-match count, level, and primary-unit bonus.
 *
 * Audit pattern guide (load-bearing — see KNOWN PITFALL in spec):
 *   `lib/db` is pinned to `max: 1`. Calling `logAudit(...)` inside
 *   `db.transaction(...)` deadlocks because logAudit acquires the only
 *   connection from the outside.
 *
 *   Pattern A — single-mutation paths: do the write, then `await logAudit(...)`
 *   AFTER the write commits. Used by create / update / delete / attach / detach
 *   functions here.
 *
 *   Pattern B — multi-mutation atomic paths: open `db.transaction`, do every
 *   write via `tx`, and write the audit row by `tx.insert(brainAuditLogs)` —
 *   never `logAudit`. Used by mergeExpertiseTags (re-attach + delete must be
 *   atomic).
 */
import { db } from '@/lib/db';
import {
  brainPeople,
  brainOrgUnits,
  brainPersonOrgUnits,
  brainExpertiseTags,
  brainPersonExpertise,
  brainAuditLogs,
  clientMembers,
  type BrainPerson as BrainPersonRow,
  type BrainPersonStatus,
  type BrainExpertiseTag as BrainExpertiseTagRow,
} from '@/lib/db/schema';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { logAudit } from './audit';

// ─── EXPORTED TYPES ──────────────────────────────────────────────────────────

export type BrainPerson = BrainPersonRow;
export type BrainExpertiseTag = BrainExpertiseTagRow;

export interface ListPeopleOpts {
  status?: BrainPersonStatus | BrainPersonStatus[];
  /** Filter to people who belong to this org unit (any membership, primary or secondary). */
  orgUnitId?: number;
  /** Filter to people who have this expertise tag. */
  expertiseTagId?: number;
  /** Filter to direct reports of this person. */
  managerId?: number;
  /** Substring (case-insensitive) match across fullName / email / title. */
  search?: string;
  limit?: number;
  offset?: number;
}

export interface PersonOrgUnitSummary {
  id: number;
  name: string;
  path: string;
  primary: boolean;
  roleInUnit: string | null;
}

export interface PersonExpertiseSummary {
  tagId: number;
  name: string;
  level: number | null;
}

export interface PersonRelationSummary {
  id: number;
  fullName: string;
  title: string | null;
}

export interface PersonListRow {
  id: number;
  fullName: string;
  email: string | null;
  title: string | null;
  status: BrainPersonStatus;
  managerId: number | null;
  primaryOrgUnit: { id: number; name: string } | null;
}

export interface PersonWithRelations {
  person: BrainPerson;
  manager: PersonRelationSummary | null;
  directReports: PersonRelationSummary[];
  orgUnits: PersonOrgUnitSummary[];
  expertise: PersonExpertiseSummary[];
}

export interface CreatePersonInput {
  fullName: string;
  email?: string | null;
  userId?: number | null;
  managerId?: number | null;
  title?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  status?: BrainPersonStatus;
  notes?: string | null;
  profileUrls?: { label: string; url: string }[];
}

export interface UpdatePersonInput {
  fullName?: string;
  email?: string | null;
  managerId?: number | null;
  title?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  status?: BrainPersonStatus;
  notes?: string | null;
  profileUrls?: { label: string; url: string }[];
}

export interface ListExpertiseTagsOpts {
  search?: string;
  source?: string;
  limit?: number;
  offset?: number;
}

export interface ExpertiseTagListRow {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  source: string;
  peopleCount: number;
}

export interface ExpertiseTagWithPeople {
  tag: BrainExpertiseTag;
  people: { id: number; fullName: string; title: string | null; level: number | null }[];
}

export interface CreateExpertiseTagInput {
  name: string;
  description?: string | null;
  source?: string;
}

export interface UpdateExpertiseTagInput {
  name?: string;
  description?: string | null;
}

export interface WhoKnowsPersonResult {
  personId: number;
  fullName: string;
  title: string | null;
  primaryOrgUnit: { id: number; name: string } | null;
  matchedTags: { id: number; name: string; level: number | null }[];
  score: number;
}

export interface WhoKnowsResult {
  tagMatches: { id: number; name: string }[];
  people: WhoKnowsPersonResult[];
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function clampLimit(n: number | undefined, cap: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.floor(n), cap));
}

function nonNegOffset(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'tag';
}

async function userBelongsToClient(userId: number, clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: clientMembers.id })
    .from(clientMembers)
    .where(and(eq(clientMembers.userId, userId), eq(clientMembers.clientId, clientId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Walk the descendant chain of `rootPersonId` via the directReports edge
 * (managerId === rootPersonId). Returns the set of all descendant ids,
 * capped at 50 hops to defend against cycles in legacy data.
 */
async function collectDescendants(clientId: number, rootPersonId: number): Promise<Set<number>> {
  const descendants = new Set<number>();
  let frontier = [rootPersonId];
  let hops = 0;
  while (frontier.length > 0 && hops < 50) {
    const rows = await db
      .select({ id: brainPeople.id })
      .from(brainPeople)
      .where(and(eq(brainPeople.clientId, clientId), inArray(brainPeople.managerId, frontier)));
    const next: number[] = [];
    for (const r of rows) {
      if (!descendants.has(r.id)) {
        descendants.add(r.id);
        next.push(r.id);
      }
    }
    frontier = next;
    hops++;
  }
  return descendants;
}

/**
 * Cycle guard for managerId. A new manager assignment is illegal if:
 *   - newManagerId === personId
 *   - newManagerId is in the descendant chain of personId
 *
 * Exported for unit testing.
 */
export async function wouldCreateManagerCycle(
  clientId: number,
  personId: number,
  newManagerId: number,
): Promise<boolean> {
  if (newManagerId === personId) return true;
  const descendants = await collectDescendants(clientId, personId);
  return descendants.has(newManagerId);
}

// ─── PEOPLE: READS ───────────────────────────────────────────────────────────

export async function listPeople(
  clientId: number,
  opts: ListPeopleOpts = {},
): Promise<PersonListRow[]> {
  const limit = clampLimit(opts.limit, 100, 50);
  const offset = nonNegOffset(opts.offset);

  const conds = [eq(brainPeople.clientId, clientId)];
  if (opts.status) {
    if (Array.isArray(opts.status)) {
      if (opts.status.length > 0) conds.push(inArray(brainPeople.status, opts.status));
    } else {
      conds.push(eq(brainPeople.status, opts.status));
    }
  }
  if (opts.managerId !== undefined) conds.push(eq(brainPeople.managerId, opts.managerId));
  if (opts.search && opts.search.trim()) {
    const q = `%${opts.search.trim()}%`;
    const searchCond = or(
      sql`${brainPeople.fullName} ILIKE ${q}`,
      sql`${brainPeople.email} ILIKE ${q}`,
      sql`${brainPeople.title} ILIKE ${q}`,
    );
    if (searchCond) conds.push(searchCond);
  }

  // Join filters: orgUnit + expertiseTag use EXISTS subqueries so the base
  // SELECT stays slim and DISTINCT-free.
  if (opts.orgUnitId !== undefined) {
    const ou = opts.orgUnitId;
    conds.push(sql`EXISTS (
      SELECT 1 FROM brain_person_org_units pou
      WHERE pou.person_id = brain_people.id
        AND pou.org_unit_id = ${ou}
        AND pou.client_id = ${clientId}
    )`);
  }
  if (opts.expertiseTagId !== undefined) {
    const tagId = opts.expertiseTagId;
    conds.push(sql`EXISTS (
      SELECT 1 FROM brain_person_expertise pex
      WHERE pex.person_id = brain_people.id
        AND pex.expertise_tag_id = ${tagId}
        AND pex.client_id = ${clientId}
    )`);
  }

  const rows = await db
    .select({
      id: brainPeople.id,
      fullName: brainPeople.fullName,
      email: brainPeople.email,
      title: brainPeople.title,
      status: brainPeople.status,
      managerId: brainPeople.managerId,
    })
    .from(brainPeople)
    .where(and(...conds))
    .orderBy(asc(brainPeople.fullName))
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) return [];

  // Pull primary org-unit for each row in one batch.
  const ids = rows.map((r) => r.id);
  const primaryRows = await db
    .select({
      personId: brainPersonOrgUnits.personId,
      orgUnitId: brainPersonOrgUnits.orgUnitId,
      orgUnitName: brainOrgUnits.name,
    })
    .from(brainPersonOrgUnits)
    .innerJoin(brainOrgUnits, eq(brainOrgUnits.id, brainPersonOrgUnits.orgUnitId))
    .where(and(
      eq(brainPersonOrgUnits.clientId, clientId),
      eq(brainPersonOrgUnits.primary, true),
      inArray(brainPersonOrgUnits.personId, ids),
    ));
  const primaryByPerson = new Map<number, { id: number; name: string }>();
  for (const p of primaryRows) {
    primaryByPerson.set(p.personId, { id: p.orgUnitId, name: p.orgUnitName });
  }

  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    title: r.title,
    status: r.status as BrainPersonStatus,
    managerId: r.managerId,
    primaryOrgUnit: primaryByPerson.get(r.id) ?? null,
  }));
}

export async function getPersonById(
  clientId: number,
  id: number,
): Promise<PersonWithRelations | null> {
  const [person] = await db
    .select()
    .from(brainPeople)
    .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.id, id)))
    .limit(1);
  if (!person) return null;

  // Manager — slim summary.
  let manager: PersonRelationSummary | null = null;
  if (person.managerId !== null) {
    const [m] = await db
      .select({ id: brainPeople.id, fullName: brainPeople.fullName, title: brainPeople.title })
      .from(brainPeople)
      .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.id, person.managerId)))
      .limit(1);
    if (m) manager = m;
  }

  // Direct reports — slim summary.
  const directReports = await db
    .select({ id: brainPeople.id, fullName: brainPeople.fullName, title: brainPeople.title })
    .from(brainPeople)
    .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.managerId, id)))
    .orderBy(asc(brainPeople.fullName));

  // Org units the person belongs to.
  const orgUnitRows = await db
    .select({
      id: brainOrgUnits.id,
      name: brainOrgUnits.name,
      path: brainOrgUnits.path,
      primary: brainPersonOrgUnits.primary,
      roleInUnit: brainPersonOrgUnits.roleInUnit,
    })
    .from(brainPersonOrgUnits)
    .innerJoin(brainOrgUnits, eq(brainOrgUnits.id, brainPersonOrgUnits.orgUnitId))
    .where(and(
      eq(brainPersonOrgUnits.clientId, clientId),
      eq(brainPersonOrgUnits.personId, id),
    ))
    .orderBy(desc(brainPersonOrgUnits.primary), asc(brainOrgUnits.name));

  // Expertise tags.
  const expertiseRows = await db
    .select({
      tagId: brainExpertiseTags.id,
      name: brainExpertiseTags.name,
      level: brainPersonExpertise.level,
    })
    .from(brainPersonExpertise)
    .innerJoin(brainExpertiseTags, eq(brainExpertiseTags.id, brainPersonExpertise.expertiseTagId))
    .where(and(
      eq(brainPersonExpertise.clientId, clientId),
      eq(brainPersonExpertise.personId, id),
    ))
    .orderBy(asc(brainExpertiseTags.name));

  return {
    person,
    manager,
    directReports,
    orgUnits: orgUnitRows,
    expertise: expertiseRows,
  };
}

// ─── PEOPLE: WRITES (Pattern A — audit after commit) ─────────────────────────

export async function createPerson(
  clientId: number,
  actorId: number | null,
  input: CreatePersonInput,
): Promise<BrainPerson> {
  const fullName = (input.fullName ?? '').trim().slice(0, 200);
  if (!fullName) throw new Error('fullName is required');

  if (typeof input.userId === 'number') {
    const ok = await userBelongsToClient(input.userId, clientId);
    if (!ok) throw new Error('userId does not belong to this tenant');
  }

  const [created] = await db.insert(brainPeople).values({
    clientId,
    fullName,
    email: input.email ?? null,
    userId: input.userId ?? null,
    managerId: input.managerId ?? null,
    title: input.title ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    status: input.status ?? 'active',
    notes: input.notes ?? null,
    profileUrls: input.profileUrls ?? [],
    source: 'manual',
    createdBy: actorId,
  }).returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_person.create',
    entityType: 'brain_person',
    entityId: created.id,
  });

  return created;
}

export async function updatePerson(
  clientId: number,
  actorId: number | null,
  id: number,
  patch: UpdatePersonInput,
): Promise<BrainPerson | null> {
  const before = await db
    .select()
    .from(brainPeople)
    .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.id, id)))
    .limit(1);
  if (!before[0]) return null;

  // Cycle guard for managerId.
  if (patch.managerId !== undefined && patch.managerId !== null) {
    if (await wouldCreateManagerCycle(clientId, id, patch.managerId)) {
      throw new Error('Manager change would create a reports-to cycle');
    }
  }

  const next: Partial<typeof brainPeople.$inferInsert> = { updatedAt: new Date() };
  if (patch.fullName !== undefined) next.fullName = patch.fullName.trim().slice(0, 200);
  if (patch.email !== undefined) next.email = patch.email;
  if (patch.managerId !== undefined) next.managerId = patch.managerId;
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.startDate !== undefined) next.startDate = patch.startDate;
  if (patch.endDate !== undefined) next.endDate = patch.endDate;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.notes !== undefined) next.notes = patch.notes;
  if (patch.profileUrls !== undefined) next.profileUrls = patch.profileUrls;

  const [updated] = await db.update(brainPeople)
    .set(next)
    .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.id, id)))
    .returning();

  if (updated) {
    await logAudit({
      clientId,
      actorId,
      action: 'brain_person.update',
      entityType: 'brain_person',
      entityId: id,
      metadata: { changedFields: Object.keys(patch) },
    });
  }
  return updated ?? null;
}

export async function deletePerson(
  clientId: number,
  actorId: number | null,
  id: number,
): Promise<boolean> {
  // Audit BEFORE delete so the entityId is still meaningful in the log row's
  // context (the row itself is gone after the DELETE).
  const [row] = await db
    .select({ id: brainPeople.id })
    .from(brainPeople)
    .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.id, id)))
    .limit(1);
  if (!row) return false;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_person.delete',
    entityType: 'brain_person',
    entityId: id,
  });

  // ON DELETE CASCADE on brain_person_org_units + brain_person_expertise.
  // Sibling rows that reference this person via managerId are SET NULL.
  const result = await db.delete(brainPeople)
    .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.id, id)))
    .returning({ id: brainPeople.id });

  return result.length > 0;
}

// ─── PERSON ↔ EXPERTISE (Pattern A) ──────────────────────────────────────────

export async function attachExpertise(
  clientId: number,
  actorId: number | null,
  personId: number,
  args: { expertiseTagId: number; level?: number | null },
): Promise<{ id: number; alreadyAttached: boolean }> {
  // Verify tenancy of both anchors before inserting.
  const [person] = await db
    .select({ id: brainPeople.id })
    .from(brainPeople)
    .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.id, personId)))
    .limit(1);
  if (!person) throw new Error('Person not found in this tenant');

  const [tag] = await db
    .select({ id: brainExpertiseTags.id })
    .from(brainExpertiseTags)
    .where(and(eq(brainExpertiseTags.clientId, clientId), eq(brainExpertiseTags.id, args.expertiseTagId)))
    .limit(1);
  if (!tag) throw new Error('Expertise tag not found in this tenant');

  const level = args.level ?? null;

  // Detect pre-existing row to surface `alreadyAttached`.
  const [existing] = await db
    .select({ id: brainPersonExpertise.id })
    .from(brainPersonExpertise)
    .where(and(
      eq(brainPersonExpertise.personId, personId),
      eq(brainPersonExpertise.expertiseTagId, args.expertiseTagId),
    ))
    .limit(1);

  if (existing) {
    // Update level if changed.
    await db.update(brainPersonExpertise)
      .set({ level })
      .where(eq(brainPersonExpertise.id, existing.id));
    await logAudit({
      clientId,
      actorId,
      action: 'brain_person.attach_expertise',
      entityType: 'brain_person',
      entityId: personId,
      metadata: { expertiseTagId: args.expertiseTagId, level, alreadyAttached: true },
    });
    return { id: existing.id, alreadyAttached: true };
  }

  const [created] = await db.insert(brainPersonExpertise).values({
    clientId,
    personId,
    expertiseTagId: args.expertiseTagId,
    level,
  }).returning({ id: brainPersonExpertise.id });

  await logAudit({
    clientId,
    actorId,
    action: 'brain_person.attach_expertise',
    entityType: 'brain_person',
    entityId: personId,
    metadata: { expertiseTagId: args.expertiseTagId, level, alreadyAttached: false },
  });

  return { id: created.id, alreadyAttached: false };
}

export async function detachExpertise(
  clientId: number,
  actorId: number | null,
  personId: number,
  expertiseTagId: number,
): Promise<boolean> {
  const deleted = await db.delete(brainPersonExpertise)
    .where(and(
      eq(brainPersonExpertise.clientId, clientId),
      eq(brainPersonExpertise.personId, personId),
      eq(brainPersonExpertise.expertiseTagId, expertiseTagId),
    ))
    .returning({ id: brainPersonExpertise.id });

  if (deleted.length === 0) return false;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_person.detach_expertise',
    entityType: 'brain_person',
    entityId: personId,
    metadata: { expertiseTagId },
  });
  return true;
}

// ─── EXPERTISE TAGS ──────────────────────────────────────────────────────────

export async function listExpertiseTags(
  clientId: number,
  opts: ListExpertiseTagsOpts = {},
): Promise<ExpertiseTagListRow[]> {
  const limit = clampLimit(opts.limit, 200, 100);
  const offset = nonNegOffset(opts.offset);

  const conds = [eq(brainExpertiseTags.clientId, clientId)];
  if (opts.source) conds.push(eq(brainExpertiseTags.source, opts.source));
  if (opts.search && opts.search.trim()) {
    const q = `%${opts.search.trim()}%`;
    const sc = or(
      sql`${brainExpertiseTags.name} ILIKE ${q}`,
      sql`${brainExpertiseTags.description} ILIKE ${q}`,
    );
    if (sc) conds.push(sc);
  }

  // NOTE: correlated subquery — outer ref MUST be hard-coded
  // `brain_expertise_tags.id`. Using `${brainExpertiseTags.id}` here would
  // emit `id` unqualified and bind to the inner table — silently zero counts.
  const rows = await db
    .select({
      id: brainExpertiseTags.id,
      name: brainExpertiseTags.name,
      slug: brainExpertiseTags.slug,
      description: brainExpertiseTags.description,
      source: brainExpertiseTags.source,
      peopleCount: sql<number>`(
        SELECT count(*)::int FROM brain_person_expertise
        WHERE brain_person_expertise.expertise_tag_id = brain_expertise_tags.id
          AND brain_person_expertise.client_id = ${clientId}
      )`,
    })
    .from(brainExpertiseTags)
    .where(and(...conds))
    .orderBy(asc(brainExpertiseTags.name))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    source: r.source,
    peopleCount: Number(r.peopleCount ?? 0),
  }));
}

export async function getExpertiseTagById(
  clientId: number,
  id: number,
): Promise<ExpertiseTagWithPeople | null> {
  const [tag] = await db
    .select()
    .from(brainExpertiseTags)
    .where(and(eq(brainExpertiseTags.clientId, clientId), eq(brainExpertiseTags.id, id)))
    .limit(1);
  if (!tag) return null;

  const people = await db
    .select({
      id: brainPeople.id,
      fullName: brainPeople.fullName,
      title: brainPeople.title,
      level: brainPersonExpertise.level,
    })
    .from(brainPersonExpertise)
    .innerJoin(brainPeople, eq(brainPeople.id, brainPersonExpertise.personId))
    .where(and(
      eq(brainPersonExpertise.clientId, clientId),
      eq(brainPersonExpertise.expertiseTagId, id),
    ))
    .orderBy(asc(brainPeople.fullName));

  return { tag, people };
}

export async function createExpertiseTag(
  clientId: number,
  actorId: number | null,
  input: CreateExpertiseTagInput,
): Promise<BrainExpertiseTag> {
  const name = (input.name ?? '').trim().slice(0, 100);
  if (!name) throw new Error('name is required');
  const slug = slugify(name);

  // Disambiguate if a tag with the same slug already exists (per-tenant).
  let finalSlug = slug;
  let counter = 2;
  while (true) {
    const [collision] = await db
      .select({ id: brainExpertiseTags.id })
      .from(brainExpertiseTags)
      .where(and(eq(brainExpertiseTags.clientId, clientId), eq(brainExpertiseTags.slug, finalSlug)))
      .limit(1);
    if (!collision) break;
    finalSlug = `${slug}-${counter}`.slice(0, 100);
    counter++;
    if (counter > 100) throw new Error('Could not allocate a unique slug');
  }

  const [created] = await db.insert(brainExpertiseTags).values({
    clientId,
    name,
    slug: finalSlug,
    description: input.description ?? null,
    source: input.source ?? 'manual',
  }).returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_expertise_tag.create',
    entityType: 'brain_expertise_tag',
    entityId: created.id,
  });

  return created;
}

export async function updateExpertiseTag(
  clientId: number,
  actorId: number | null,
  id: number,
  patch: UpdateExpertiseTagInput,
): Promise<BrainExpertiseTag | null> {
  const next: Partial<typeof brainExpertiseTags.$inferInsert> = {};
  if (patch.name !== undefined) next.name = patch.name.trim().slice(0, 100);
  if (patch.description !== undefined) next.description = patch.description;

  if (Object.keys(next).length === 0) {
    // Nothing to update — just return current row.
    const [row] = await db.select().from(brainExpertiseTags)
      .where(and(eq(brainExpertiseTags.clientId, clientId), eq(brainExpertiseTags.id, id)))
      .limit(1);
    return row ?? null;
  }

  const [updated] = await db.update(brainExpertiseTags)
    .set(next)
    .where(and(eq(brainExpertiseTags.clientId, clientId), eq(brainExpertiseTags.id, id)))
    .returning();

  if (updated) {
    await logAudit({
      clientId,
      actorId,
      action: 'brain_expertise_tag.update',
      entityType: 'brain_expertise_tag',
      entityId: id,
      metadata: { changedFields: Object.keys(patch) },
    });
  }
  return updated ?? null;
}

export async function deleteExpertiseTag(
  clientId: number,
  actorId: number | null,
  id: number,
  opts: { force?: boolean } = {},
): Promise<{ deleted: boolean; reason?: 'in_use' | 'not_found' }> {
  const [tag] = await db
    .select({ id: brainExpertiseTags.id })
    .from(brainExpertiseTags)
    .where(and(eq(brainExpertiseTags.clientId, clientId), eq(brainExpertiseTags.id, id)))
    .limit(1);
  if (!tag) return { deleted: false, reason: 'not_found' };

  if (!opts.force) {
    const [usage] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(brainPersonExpertise)
      .where(and(
        eq(brainPersonExpertise.clientId, clientId),
        eq(brainPersonExpertise.expertiseTagId, id),
      ));
    if (Number(usage?.count ?? 0) > 0) {
      return { deleted: false, reason: 'in_use' };
    }
  }

  // Audit before delete (entityId resolves while the row still exists).
  await logAudit({
    clientId,
    actorId,
    action: 'brain_expertise_tag.delete',
    entityType: 'brain_expertise_tag',
    entityId: id,
    metadata: { force: opts.force === true },
  });

  // CASCADE on brain_person_expertise drops the junctions when force=true.
  await db.delete(brainExpertiseTags)
    .where(and(eq(brainExpertiseTags.clientId, clientId), eq(brainExpertiseTags.id, id)));

  return { deleted: true };
}

/**
 * Merge `sourceId` into `targetId`. Re-attaches every brain_person_expertise
 * row from source → target (preserving level where target has no row yet),
 * then deletes the source tag.
 *
 * Pattern B — wrapped in `db.transaction` so the reattach + delete can't half-
 * apply. Audit written via `tx.insert(brainAuditLogs)` (NEVER `logAudit`),
 * because the connection pool is `max: 1`.
 */
export async function mergeExpertiseTags(
  clientId: number,
  actorId: number | null,
  sourceId: number,
  targetId: number,
): Promise<{ merged: true; reattached: number }> {
  if (sourceId === targetId) {
    throw new Error('Cannot merge a tag into itself');
  }

  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({ id: brainExpertiseTags.id })
      .from(brainExpertiseTags)
      .where(and(eq(brainExpertiseTags.clientId, clientId), eq(brainExpertiseTags.id, sourceId)))
      .limit(1);
    const [target] = await tx
      .select({ id: brainExpertiseTags.id })
      .from(brainExpertiseTags)
      .where(and(eq(brainExpertiseTags.clientId, clientId), eq(brainExpertiseTags.id, targetId)))
      .limit(1);
    if (!source) throw new Error('Source tag not found in this tenant');
    if (!target) throw new Error('Target tag not found in this tenant');

    // Collect source junction rows.
    const sourceLinks = await tx
      .select({
        id: brainPersonExpertise.id,
        personId: brainPersonExpertise.personId,
        level: brainPersonExpertise.level,
      })
      .from(brainPersonExpertise)
      .where(and(
        eq(brainPersonExpertise.clientId, clientId),
        eq(brainPersonExpertise.expertiseTagId, sourceId),
      ));

    let reattached = 0;
    for (const link of sourceLinks) {
      // Does target already have this person?
      const [existing] = await tx
        .select({ id: brainPersonExpertise.id, level: brainPersonExpertise.level })
        .from(brainPersonExpertise)
        .where(and(
          eq(brainPersonExpertise.clientId, clientId),
          eq(brainPersonExpertise.personId, link.personId),
          eq(brainPersonExpertise.expertiseTagId, targetId),
        ))
        .limit(1);

      if (existing) {
        // Keep target's existing row. If target has no level but source had
        // one, copy source's level over.
        if (existing.level === null && link.level !== null) {
          await tx.update(brainPersonExpertise)
            .set({ level: link.level })
            .where(eq(brainPersonExpertise.id, existing.id));
        }
        // Drop source's junction.
        await tx.delete(brainPersonExpertise)
          .where(eq(brainPersonExpertise.id, link.id));
      } else {
        // Re-point this junction at the target tag.
        await tx.update(brainPersonExpertise)
          .set({ expertiseTagId: targetId })
          .where(eq(brainPersonExpertise.id, link.id));
        reattached++;
      }
    }

    // Delete source tag (no junctions remain).
    await tx.delete(brainExpertiseTags)
      .where(and(eq(brainExpertiseTags.clientId, clientId), eq(brainExpertiseTags.id, sourceId)));

    // Pattern B audit — via tx.insert, NOT logAudit.
    await tx.insert(brainAuditLogs).values({
      clientId,
      actorId,
      action: 'brain_expertise_tag.merge',
      entityType: 'brain_expertise_tag',
      entityId: targetId,
      metadata: { sourceId, targetId, reattached, junctionsExamined: sourceLinks.length },
    });

    return { merged: true as const, reattached };
  });
}

// ─── WHO-KNOWS SEARCH ────────────────────────────────────────────────────────

/** Internal shape consumed by the pure scoring helper below. */
export interface WhoKnowsCandidateInput {
  personId: number;
  fullName: string;
  title: string | null;
  hasPrimaryOrgUnit: boolean;
  primaryOrgUnit: { id: number; name: string } | null;
  matchedTags: { id: number; name: string; level: number | null }[];
}

/**
 * Pure ranking for whoKnows — exported so unit tests can exercise the scoring
 * formula without standing up Postgres.
 *
 * Scoring per person:
 *   - +1 per matched tag
 *   - +0.5 bonus per matched tag with a level set
 *   - +0.2 bonus once per person when the person has a primary org unit
 * Sort by score DESC, then fullName ASC for tie-break determinism.
 * Score rounded to 2 decimals.
 */
export function scoreWhoKnowsCandidates(
  candidates: WhoKnowsCandidateInput[],
  limit: number = 25,
): WhoKnowsPersonResult[] {
  const cap = clampLimit(limit, 25, 10);
  return candidates
    .map((c) => {
      let score = 0;
      for (const t of c.matchedTags) {
        score += 1;
        if (t.level !== null && t.level !== undefined) score += 0.5;
      }
      if (c.hasPrimaryOrgUnit) score += 0.2;
      return {
        personId: c.personId,
        fullName: c.fullName,
        title: c.title,
        primaryOrgUnit: c.primaryOrgUnit,
        matchedTags: c.matchedTags,
        score: Math.round(score * 100) / 100,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.fullName.localeCompare(b.fullName);
    })
    .slice(0, cap);
}

/**
 * Resolve a free-text query to candidate expertise tags, then rank people by
 * how many matched tags they hold. See {@link scoreWhoKnowsCandidates} for
 * the pure scoring rules.
 */
export async function whoKnows(
  clientId: number,
  query: string,
  opts: { limit?: number } = {},
): Promise<WhoKnowsResult> {
  const q = (query ?? '').trim();
  const limit = clampLimit(opts.limit, 25, 10);
  if (!q) return { tagMatches: [], people: [] };

  const like = `%${q}%`;
  const matchCond = or(
    sql`${brainExpertiseTags.name} ILIKE ${like}`,
    sql`${brainExpertiseTags.description} ILIKE ${like}`,
  );
  const matchedTags = await db
    .select({ id: brainExpertiseTags.id, name: brainExpertiseTags.name })
    .from(brainExpertiseTags)
    .where(and(
      eq(brainExpertiseTags.clientId, clientId),
      matchCond ?? sql`true`,
    ))
    .orderBy(asc(brainExpertiseTags.name));

  if (matchedTags.length === 0) {
    return { tagMatches: [], people: [] };
  }

  const tagIds = matchedTags.map((t) => t.id);

  // Pull all junctions for matched tags, joined to the person row.
  const junctions = await db
    .select({
      personId: brainPersonExpertise.personId,
      tagId: brainPersonExpertise.expertiseTagId,
      tagName: brainExpertiseTags.name,
      level: brainPersonExpertise.level,
      fullName: brainPeople.fullName,
      title: brainPeople.title,
    })
    .from(brainPersonExpertise)
    .innerJoin(brainExpertiseTags, eq(brainExpertiseTags.id, brainPersonExpertise.expertiseTagId))
    .innerJoin(brainPeople, eq(brainPeople.id, brainPersonExpertise.personId))
    .where(and(
      eq(brainPersonExpertise.clientId, clientId),
      inArray(brainPersonExpertise.expertiseTagId, tagIds),
    ));

  if (junctions.length === 0) {
    return { tagMatches: matchedTags, people: [] };
  }

  const personIds = Array.from(new Set(junctions.map((j) => j.personId)));

  // Primary org-unit lookup for matched people.
  const primaryRows = await db
    .select({
      personId: brainPersonOrgUnits.personId,
      orgUnitId: brainPersonOrgUnits.orgUnitId,
      orgUnitName: brainOrgUnits.name,
    })
    .from(brainPersonOrgUnits)
    .innerJoin(brainOrgUnits, eq(brainOrgUnits.id, brainPersonOrgUnits.orgUnitId))
    .where(and(
      eq(brainPersonOrgUnits.clientId, clientId),
      eq(brainPersonOrgUnits.primary, true),
      inArray(brainPersonOrgUnits.personId, personIds),
    ));
  const primaryByPerson = new Map<number, { id: number; name: string }>();
  for (const r of primaryRows) {
    primaryByPerson.set(r.personId, { id: r.orgUnitId, name: r.orgUnitName });
  }

  // Build per-person candidate rows for the pure scoring helper.
  const byPerson = new Map<number, WhoKnowsCandidateInput>();
  for (const j of junctions) {
    let entry = byPerson.get(j.personId);
    if (!entry) {
      const primary = primaryByPerson.get(j.personId) ?? null;
      entry = {
        personId: j.personId,
        fullName: j.fullName,
        title: j.title,
        hasPrimaryOrgUnit: primary !== null,
        primaryOrgUnit: primary,
        matchedTags: [],
      };
      byPerson.set(j.personId, entry);
    }
    entry.matchedTags.push({ id: j.tagId, name: j.tagName, level: j.level });
  }

  const people = scoreWhoKnowsCandidates(Array.from(byPerson.values()), limit);
  return { tagMatches: matchedTags, people };
}
