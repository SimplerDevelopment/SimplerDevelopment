/**
 * Brain documents — required-reads + acknowledgments (the "compliance trail"
 * half of Documents).
 *
 * Two tables drive the trail:
 *   - brain_document_required_reads — "you (a person OR every member of an
 *     org_unit) must read this document, optionally pinned to a specific
 *     version, optionally by a due date."
 *   - brain_document_acknowledgments — "person P read version V of document D
 *     at time T."
 *
 * Compliance math (see {@link complianceReport}):
 *   assigned   = every person reachable from a required-read row (expanding
 *                org-unit membership at report time)
 *   ack'd      = assigned AND has an ack row on the document's
 *                currentPublishedVersionId
 *   pending    = assigned AND NOT ack'd
 *   overdue    = pending AND dueAt < now()
 *
 * Audit pattern:
 *   - Most paths use Pattern A — write to brain_audit_logs AFTER the tx
 *     commits via logAudit(). lib/db is pinned to max:1; calling logAudit()
 *     inside db.transaction(...) deadlocks against the held connection.
 *   - assignRequiredReadToOrgUnit fans out to N rows in a single tx — that
 *     path uses Pattern B via the local txAudit() helper so the audit row
 *     shares the held connection. We write ONE summary audit row, not N.
 */
import { db } from '@/lib/db';
import {
  brainDocuments,
  brainDocumentVersions,
  brainDocumentRequiredReads,
  brainDocumentAcknowledgments,
  brainPeople,
  brainOrgUnits,
  brainPersonOrgUnits,
  brainAuditLogs,
  type BrainDocumentRequiredReadTarget,
} from '@/lib/db/schema';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { logAudit } from './audit';
import { revalidateBrainDashboard } from './dashboard';

// ─── tx helper (Pattern B for assignRequiredReadToOrgUnit) ───────────────────

/** Drizzle transaction handle — extracted from db.transaction's callback signature. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

/**
 * Tx-safe audit insert. logAudit() opens a fresh connection; with the pool
 * pinned to max:1, that deadlocks against an outer transaction. Use this
 * helper to share the held connection.
 */
async function txAudit(conn: DbOrTx, args: {
  clientId: number;
  actorId: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
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

// ─── pg-table-derived types ──────────────────────────────────────────────────

export type BrainDocumentRequiredRead = typeof brainDocumentRequiredReads.$inferSelect;
export type BrainDocumentAcknowledgment = typeof brainDocumentAcknowledgments.$inferSelect;
export type { BrainDocumentRequiredReadTarget };

// ─── public arg / row types ──────────────────────────────────────────────────

export interface AssignRequiredReadArgs {
  documentId: number;
  targetType: BrainDocumentRequiredReadTarget;
  targetId: number;
  pinnedVersionId?: number | null;
  dueAt?: Date | null;
  /**
   * When targetType='org_unit' and expandOrgUnit=true, fans out to one
   * required_read row per active person in that org unit. Otherwise, a single
   * row is written against the org_unit (the UI then resolves membership at
   * compliance-report time).
   */
  expandOrgUnit?: boolean;
}

export interface AssignRequiredReadResult {
  assigned: number;
  alreadyAssigned: number;
  /** When fan-out happened, the person ids the org_unit expanded to. */
  expandedTo?: number[];
}

export interface RequiredReadRow {
  id: number;
  targetType: BrainDocumentRequiredReadTarget;
  targetId: number;
  /** Resolved at query time — brain_people.fullName or brain_org_units.name. */
  targetName: string | null;
  pinnedVersionId: number | null;
  dueAt: Date | null;
  assignedAt: Date;
}

export interface RequiredReadForPersonRow {
  requiredReadId: number;
  documentId: number;
  documentTitle: string;
  documentSlug: string;
  pinnedVersionId: number | null;
  /**
   * The version this person actually needs to acknowledge. Equal to
   * pinnedVersionId when pinned; otherwise the document's
   * currentPublishedVersionId. May be null when the document has never been
   * published — in that case acknowledged=false and ackId=null.
   */
  currentVersionToReadId: number | null;
  dueAt: Date | null;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  ackId: number | null;
}

export interface AcknowledgeArgs {
  documentId: number;
  versionId: number;
  personId: number;
  acknowledgmentNote?: string | null;
  /** Optional explicit required-read row to attach the ack to. Auto-linked when omitted. */
  requiredReadId?: number | null;
}

export interface AckRow {
  ackId: number;
  versionId: number;
  versionNumber: number;
  personId: number;
  personName: string | null;
  acknowledgedAt: Date;
  acknowledgmentNote: string | null;
}

export interface AckForPersonRow {
  ackId: number;
  documentId: number;
  documentTitle: string;
  versionNumber: number;
  acknowledgedAt: Date;
}

export interface ComplianceReport {
  document: {
    id: number;
    title: string;
    slug: string;
    currentPublishedVersionId: number | null;
  };
  requiredReads: Array<{
    targetType: BrainDocumentRequiredReadTarget;
    targetId: number;
    targetName: string | null;
    pinnedVersionId: number | null;
    dueAt: Date | null;
  }>;
  acknowledgedPersonIds: number[];
  pendingPersonIds: number[];
  overduePersonIds: number[];
  summary: {
    totalAssigned: number;
    acknowledged: number;
    pending: number;
    overdue: number;
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Resolve a document row scoped to this client, or null. */
async function getDocumentForClient(
  conn: DbOrTx,
  clientId: number,
  documentId: number,
): Promise<{ id: number; title: string; slug: string; currentPublishedVersionId: number | null } | null> {
  const [row] = await conn
    .select({
      id: brainDocuments.id,
      title: brainDocuments.title,
      slug: brainDocuments.slug,
      currentPublishedVersionId: brainDocuments.currentPublishedVersionId,
    })
    .from(brainDocuments)
    .where(and(eq(brainDocuments.id, documentId), eq(brainDocuments.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

/** Active person ids in an org unit (filters out inactive/departed). */
async function activePersonIdsInOrgUnit(
  conn: DbOrTx,
  clientId: number,
  orgUnitId: number,
): Promise<number[]> {
  const rows = await conn
    .select({ personId: brainPersonOrgUnits.personId })
    .from(brainPersonOrgUnits)
    .innerJoin(brainPeople, eq(brainPeople.id, brainPersonOrgUnits.personId))
    .where(and(
      eq(brainPersonOrgUnits.clientId, clientId),
      eq(brainPersonOrgUnits.orgUnitId, orgUnitId),
      eq(brainPeople.status, 'active'),
    ));
  return rows.map((r) => r.personId);
}

// ─── assignRequiredRead ─────────────────────────────────────────────────────

/**
 * Assign a required-read. Idempotent — on (documentId, targetType, targetId)
 * conflict, updates dueAt + pinnedVersionId (overwriting earlier values).
 *
 * When targetType='org_unit' AND expandOrgUnit=true, fans out to one
 * required_read row per active person in that unit. Returns the list of
 * person ids in `expandedTo`. The fan-out path uses Pattern B (txAudit) so
 * the N inserts + the single summary audit row share one connection.
 *
 * When targetType='org_unit' AND expandOrgUnit !== true, writes a single
 * org_unit-scoped row; compliance-report time resolves membership.
 *
 * When targetType='person', writes a single row regardless of expandOrgUnit.
 */
export async function assignRequiredRead(
  clientId: number,
  actorId: number | null,
  args: AssignRequiredReadArgs,
): Promise<AssignRequiredReadResult> {
  const doc = await getDocumentForClient(db, clientId, args.documentId);
  if (!doc) throw new Error('document not found');

  // Defend pinned version is real + belongs to this document (and tenant).
  if (args.pinnedVersionId != null) {
    const [v] = await db
      .select({ id: brainDocumentVersions.id })
      .from(brainDocumentVersions)
      .where(and(
        eq(brainDocumentVersions.id, args.pinnedVersionId),
        eq(brainDocumentVersions.documentId, args.documentId),
        eq(brainDocumentVersions.clientId, clientId),
      ))
      .limit(1);
    if (!v) throw new Error('pinnedVersionId does not belong to this document');
  }

  // Org-unit fan-out — Pattern B.
  // documentsRequiredReadsPending tile may bump from any of the branches below.
  if (args.targetType === 'org_unit' && args.expandOrgUnit) {
    // Verify the org_unit exists in this tenant.
    const [unit] = await db
      .select({ id: brainOrgUnits.id })
      .from(brainOrgUnits)
      .where(and(eq(brainOrgUnits.id, args.targetId), eq(brainOrgUnits.clientId, clientId)))
      .limit(1);
    if (!unit) throw new Error('org_unit not found');

    const personIds = await activePersonIdsInOrgUnit(db, clientId, args.targetId);

    if (personIds.length === 0) {
      // Still write a summary audit row so the action is recorded.
      await logAudit({
        clientId,
        actorId,
        action: 'brain_document.assign_required_read',
        entityType: 'brain_document',
        entityId: args.documentId,
        metadata: {
          targetType: 'org_unit',
          targetId: args.targetId,
          expandOrgUnit: true,
          expandedTo: [],
          assigned: 0,
          alreadyAssigned: 0,
        },
      });
      return { assigned: 0, alreadyAssigned: 0, expandedTo: [] };
    }

    const fanoutResult = await db.transaction(async (tx) => {
      // Look up existing person-target rows in one query to compute the
      // already-assigned count without fighting onConflict.
      const existing = await tx
        .select({ targetId: brainDocumentRequiredReads.targetId })
        .from(brainDocumentRequiredReads)
        .where(and(
          eq(brainDocumentRequiredReads.clientId, clientId),
          eq(brainDocumentRequiredReads.documentId, args.documentId),
          eq(brainDocumentRequiredReads.targetType, 'person'),
          inArray(brainDocumentRequiredReads.targetId, personIds),
        ));
      const alreadyAssigned = new Set(existing.map((r) => r.targetId));

      const values = personIds.map((pid) => ({
        clientId,
        documentId: args.documentId,
        targetType: 'person' as BrainDocumentRequiredReadTarget,
        targetId: pid,
        pinnedVersionId: args.pinnedVersionId ?? null,
        dueAt: args.dueAt ?? null,
        assignedBy: actorId ?? null,
      }));

      // Bulk upsert — onConflictDoUpdate refreshes pinnedVersionId + dueAt.
      await tx
        .insert(brainDocumentRequiredReads)
        .values(values)
        .onConflictDoUpdate({
          target: [
            brainDocumentRequiredReads.documentId,
            brainDocumentRequiredReads.targetType,
            brainDocumentRequiredReads.targetId,
          ],
          set: {
            pinnedVersionId: args.pinnedVersionId ?? null,
            dueAt: args.dueAt ?? null,
            assignedBy: actorId ?? null,
          },
        });

      const assigned = personIds.length - alreadyAssigned.size;

      // Pattern B — single summary audit row written inside the tx.
      await txAudit(tx, {
        clientId,
        actorId,
        action: 'brain_document.assign_required_read',
        entityType: 'brain_document',
        entityId: args.documentId,
        metadata: {
          targetType: 'org_unit',
          targetId: args.targetId,
          expandOrgUnit: true,
          expandedTo: personIds,
          assigned,
          alreadyAssigned: alreadyAssigned.size,
          pinnedVersionId: args.pinnedVersionId ?? null,
          dueAt: args.dueAt ?? null,
        },
      });

      return { assigned, alreadyAssigned: alreadyAssigned.size, expandedTo: personIds };
    });
    if (fanoutResult.assigned > 0) revalidateBrainDashboard(clientId);
    return fanoutResult;
  }

  // Single-row path — Pattern A.
  if (args.targetType === 'org_unit') {
    // Verify the org_unit exists in this tenant.
    const [unit] = await db
      .select({ id: brainOrgUnits.id })
      .from(brainOrgUnits)
      .where(and(eq(brainOrgUnits.id, args.targetId), eq(brainOrgUnits.clientId, clientId)))
      .limit(1);
    if (!unit) throw new Error('org_unit not found');
  } else {
    // 'person'
    const [person] = await db
      .select({ id: brainPeople.id })
      .from(brainPeople)
      .where(and(eq(brainPeople.id, args.targetId), eq(brainPeople.clientId, clientId)))
      .limit(1);
    if (!person) throw new Error('person not found');
  }

  const [existing] = await db
    .select({ id: brainDocumentRequiredReads.id })
    .from(brainDocumentRequiredReads)
    .where(and(
      eq(brainDocumentRequiredReads.documentId, args.documentId),
      eq(brainDocumentRequiredReads.targetType, args.targetType),
      eq(brainDocumentRequiredReads.targetId, args.targetId),
    ))
    .limit(1);

  if (existing) {
    await db
      .update(brainDocumentRequiredReads)
      .set({
        pinnedVersionId: args.pinnedVersionId ?? null,
        dueAt: args.dueAt ?? null,
        assignedBy: actorId ?? null,
      })
      .where(eq(brainDocumentRequiredReads.id, existing.id));
    await logAudit({
      clientId,
      actorId,
      action: 'brain_document.assign_required_read',
      entityType: 'brain_document',
      entityId: args.documentId,
      metadata: {
        targetType: args.targetType,
        targetId: args.targetId,
        alreadyAssigned: 1,
        assigned: 0,
        pinnedVersionId: args.pinnedVersionId ?? null,
        dueAt: args.dueAt ?? null,
      },
    });
    return { assigned: 0, alreadyAssigned: 1 };
  }

  await db.insert(brainDocumentRequiredReads).values({
    clientId,
    documentId: args.documentId,
    targetType: args.targetType,
    targetId: args.targetId,
    pinnedVersionId: args.pinnedVersionId ?? null,
    dueAt: args.dueAt ?? null,
    assignedBy: actorId ?? null,
  });
  await logAudit({
    clientId,
    actorId,
    action: 'brain_document.assign_required_read',
    entityType: 'brain_document',
    entityId: args.documentId,
    metadata: {
      targetType: args.targetType,
      targetId: args.targetId,
      assigned: 1,
      alreadyAssigned: 0,
      pinnedVersionId: args.pinnedVersionId ?? null,
      dueAt: args.dueAt ?? null,
    },
  });
  revalidateBrainDashboard(clientId);
  return { assigned: 1, alreadyAssigned: 0 };
}

// ─── listRequiredReadsForDocument ────────────────────────────────────────────

export interface ListRequiredReadsForDocumentOpts {
  targetType?: BrainDocumentRequiredReadTarget;
  limit?: number;
  offset?: number;
}

/**
 * List required-reads for a document. Resolves targetName via two left joins
 * (one for brain_people, one for brain_org_units). Filters out cross-tenant
 * rows by clientId.
 */
export async function listRequiredReadsForDocument(
  clientId: number,
  documentId: number,
  opts: ListRequiredReadsForDocumentOpts = {},
): Promise<RequiredReadRow[]> {
  const conds = [
    eq(brainDocumentRequiredReads.clientId, clientId),
    eq(brainDocumentRequiredReads.documentId, documentId),
  ];
  if (opts.targetType !== undefined) {
    conds.push(eq(brainDocumentRequiredReads.targetType, opts.targetType));
  }
  const limit = opts.limit !== undefined ? Math.max(1, Math.min(opts.limit, 200)) : 100;
  const offset = opts.offset !== undefined ? Math.max(0, opts.offset) : 0;

  // Resolve targetName via a single CASE — avoids two joins by polymorphism.
  const rows = await db
    .select({
      id: brainDocumentRequiredReads.id,
      targetType: brainDocumentRequiredReads.targetType,
      targetId: brainDocumentRequiredReads.targetId,
      pinnedVersionId: brainDocumentRequiredReads.pinnedVersionId,
      dueAt: brainDocumentRequiredReads.dueAt,
      assignedAt: brainDocumentRequiredReads.assignedAt,
      personName: brainPeople.fullName,
      orgUnitName: brainOrgUnits.name,
    })
    .from(brainDocumentRequiredReads)
    .leftJoin(brainPeople, and(
      eq(brainDocumentRequiredReads.targetType, 'person'),
      eq(brainPeople.id, brainDocumentRequiredReads.targetId),
      eq(brainPeople.clientId, clientId),
    ))
    .leftJoin(brainOrgUnits, and(
      eq(brainDocumentRequiredReads.targetType, 'org_unit'),
      eq(brainOrgUnits.id, brainDocumentRequiredReads.targetId),
      eq(brainOrgUnits.clientId, clientId),
    ))
    .where(and(...conds))
    .orderBy(desc(brainDocumentRequiredReads.assignedAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    targetName: r.targetType === 'person' ? r.personName : r.orgUnitName,
    pinnedVersionId: r.pinnedVersionId,
    dueAt: r.dueAt,
    assignedAt: r.assignedAt,
  }));
}

// ─── listRequiredReadsForPerson ─────────────────────────────────────────────

export interface ListRequiredReadsForPersonOpts {
  status?: 'open' | 'acknowledged' | 'all';
  limit?: number;
  offset?: number;
}

/**
 * Resolve a person's reading queue. Each row tells the UI what version this
 * person actually needs to ack (the pinned one, or the document's current
 * published version) and whether they already have.
 *
 * NB: this only resolves the person's DIRECT required-reads. Org-unit-scoped
 * required-reads that weren't expanded via assignRequiredRead(expandOrgUnit:
 * true) are NOT pulled in here — UI surfaces those via the
 * complianceReport view instead.
 */
export async function listRequiredReadsForPerson(
  clientId: number,
  personId: number,
  opts: ListRequiredReadsForPersonOpts = {},
): Promise<RequiredReadForPersonRow[]> {
  const status = opts.status ?? 'all';
  const limit = opts.limit !== undefined ? Math.max(1, Math.min(opts.limit, 200)) : 100;
  const offset = opts.offset !== undefined ? Math.max(0, opts.offset) : 0;

  const rows = await db
    .select({
      requiredReadId: brainDocumentRequiredReads.id,
      documentId: brainDocumentRequiredReads.documentId,
      documentTitle: brainDocuments.title,
      documentSlug: brainDocuments.slug,
      pinnedVersionId: brainDocumentRequiredReads.pinnedVersionId,
      currentPublishedVersionId: brainDocuments.currentPublishedVersionId,
      dueAt: brainDocumentRequiredReads.dueAt,
    })
    .from(brainDocumentRequiredReads)
    .innerJoin(brainDocuments, and(
      eq(brainDocuments.id, brainDocumentRequiredReads.documentId),
      eq(brainDocuments.clientId, clientId),
    ))
    .where(and(
      eq(brainDocumentRequiredReads.clientId, clientId),
      eq(brainDocumentRequiredReads.targetType, 'person'),
      eq(brainDocumentRequiredReads.targetId, personId),
    ))
    .orderBy(
      sql`${brainDocumentRequiredReads.dueAt} ASC NULLS LAST`,
      desc(brainDocumentRequiredReads.assignedAt),
    );

  if (rows.length === 0) return [];

  // Resolve acknowledgments in one query — by (documentId, versionToReadId,
  // personId) tuple. versionToReadId is either pinnedVersionId or the doc's
  // currentPublishedVersionId.
  const versionsNeeded = rows
    .map((r) => r.pinnedVersionId ?? r.currentPublishedVersionId)
    .filter((v): v is number => typeof v === 'number');

  let ackByDocVersion = new Map<string, { ackId: number; acknowledgedAt: Date }>();
  if (versionsNeeded.length > 0) {
    const acks = await db
      .select({
        ackId: brainDocumentAcknowledgments.id,
        documentId: brainDocumentAcknowledgments.documentId,
        versionId: brainDocumentAcknowledgments.versionId,
        acknowledgedAt: brainDocumentAcknowledgments.acknowledgedAt,
      })
      .from(brainDocumentAcknowledgments)
      .where(and(
        eq(brainDocumentAcknowledgments.clientId, clientId),
        eq(brainDocumentAcknowledgments.personId, personId),
        inArray(brainDocumentAcknowledgments.versionId, versionsNeeded),
      ));
    ackByDocVersion = new Map(
      acks.map((a) => [`${a.documentId}:${a.versionId}`, { ackId: a.ackId, acknowledgedAt: a.acknowledgedAt }]),
    );
  }

  const all: RequiredReadForPersonRow[] = rows.map((r) => {
    const currentVersionToReadId = r.pinnedVersionId ?? r.currentPublishedVersionId ?? null;
    const ack = currentVersionToReadId != null
      ? ackByDocVersion.get(`${r.documentId}:${currentVersionToReadId}`) ?? null
      : null;
    return {
      requiredReadId: r.requiredReadId,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      documentSlug: r.documentSlug,
      pinnedVersionId: r.pinnedVersionId,
      currentVersionToReadId,
      dueAt: r.dueAt,
      acknowledged: ack !== null,
      acknowledgedAt: ack?.acknowledgedAt ?? null,
      ackId: ack?.ackId ?? null,
    };
  });

  const filtered = status === 'open'
    ? all.filter((r) => !r.acknowledged)
    : status === 'acknowledged'
      ? all.filter((r) => r.acknowledged)
      : all;

  return filtered.slice(offset, offset + limit);
}

// ─── removeRequiredRead ─────────────────────────────────────────────────────

export interface RemoveRequiredReadOpts {
  force?: boolean;
}

/**
 * Remove a required-read. Refuses if any acknowledgments reference this row
 * (history-preservation) unless `force=true`. On force, the FK's
 * onDelete:'set null' keeps the acks but unlinks them.
 */
export async function removeRequiredRead(
  clientId: number,
  actorId: number | null,
  requiredReadId: number,
  opts: RemoveRequiredReadOpts = {},
): Promise<{ removed: boolean; reason?: 'not_found' | 'has_acks' }> {
  const [row] = await db
    .select()
    .from(brainDocumentRequiredReads)
    .where(and(
      eq(brainDocumentRequiredReads.id, requiredReadId),
      eq(brainDocumentRequiredReads.clientId, clientId),
    ))
    .limit(1);
  if (!row) return { removed: false, reason: 'not_found' };

  if (!opts.force) {
    const [ackCount] = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(brainDocumentAcknowledgments)
      .where(and(
        eq(brainDocumentAcknowledgments.clientId, clientId),
        eq(brainDocumentAcknowledgments.requiredReadId, requiredReadId),
      ));
    if ((ackCount?.c ?? 0) > 0) {
      return { removed: false, reason: 'has_acks' };
    }
  }

  await db
    .delete(brainDocumentRequiredReads)
    .where(and(
      eq(brainDocumentRequiredReads.id, requiredReadId),
      eq(brainDocumentRequiredReads.clientId, clientId),
    ));

  await logAudit({
    clientId,
    actorId,
    action: 'brain_document.remove_required_read',
    entityType: 'brain_document',
    entityId: row.documentId,
    metadata: {
      requiredReadId,
      targetType: row.targetType,
      targetId: row.targetId,
      force: !!opts.force,
    },
  });
  revalidateBrainDashboard(clientId);
  return { removed: true };
}

// ─── acknowledge ────────────────────────────────────────────────────────────

/**
 * Record an acknowledgment. Idempotent — the (documentId, versionId,
 * personId) unique index guarantees at most one row; re-acknowledging the
 * same tuple returns the existing row without writing a duplicate audit.
 *
 * If `requiredReadId` is omitted, we auto-link to a matching person-target
 * required-read for this (documentId, personId), when one exists. Org-unit
 * required-reads are not auto-linked — set requiredReadId explicitly if you
 * want that.
 */
export async function acknowledge(
  clientId: number,
  actorId: number | null,
  args: AcknowledgeArgs,
): Promise<BrainDocumentAcknowledgment> {
  // 1. Defend doc + version belong to this tenant + each other.
  const doc = await getDocumentForClient(db, clientId, args.documentId);
  if (!doc) throw new Error('document not found');
  const [version] = await db
    .select({ id: brainDocumentVersions.id })
    .from(brainDocumentVersions)
    .where(and(
      eq(brainDocumentVersions.id, args.versionId),
      eq(brainDocumentVersions.documentId, args.documentId),
      eq(brainDocumentVersions.clientId, clientId),
    ))
    .limit(1);
  if (!version) throw new Error('version not found for this document');

  // 2. Defend person is in this tenant.
  const [person] = await db
    .select({ id: brainPeople.id })
    .from(brainPeople)
    .where(and(eq(brainPeople.id, args.personId), eq(brainPeople.clientId, clientId)))
    .limit(1);
  if (!person) throw new Error('person not found');

  // 3. Already-acked? Return the existing row — idempotent.
  const [existing] = await db
    .select()
    .from(brainDocumentAcknowledgments)
    .where(and(
      eq(brainDocumentAcknowledgments.clientId, clientId),
      eq(brainDocumentAcknowledgments.documentId, args.documentId),
      eq(brainDocumentAcknowledgments.versionId, args.versionId),
      eq(brainDocumentAcknowledgments.personId, args.personId),
    ))
    .limit(1);
  if (existing) return existing;

  // 4. Resolve requiredReadId — auto-link to matching person-target row
  //    when caller didn't supply one.
  let requiredReadId: number | null = args.requiredReadId ?? null;
  if (requiredReadId == null) {
    const [rr] = await db
      .select({ id: brainDocumentRequiredReads.id })
      .from(brainDocumentRequiredReads)
      .where(and(
        eq(brainDocumentRequiredReads.clientId, clientId),
        eq(brainDocumentRequiredReads.documentId, args.documentId),
        eq(brainDocumentRequiredReads.targetType, 'person'),
        eq(brainDocumentRequiredReads.targetId, args.personId),
      ))
      .limit(1);
    if (rr) requiredReadId = rr.id;
  } else {
    // Sanity — make sure the supplied required-read belongs to this tenant +
    // this document. If not, drop it (don't fail the ack — the ack itself is
    // the important record).
    const [rr] = await db
      .select({ id: brainDocumentRequiredReads.id })
      .from(brainDocumentRequiredReads)
      .where(and(
        eq(brainDocumentRequiredReads.id, requiredReadId),
        eq(brainDocumentRequiredReads.clientId, clientId),
        eq(brainDocumentRequiredReads.documentId, args.documentId),
      ))
      .limit(1);
    if (!rr) requiredReadId = null;
  }

  const noteTrim = (args.acknowledgmentNote ?? '').trim();

  const [ack] = await db
    .insert(brainDocumentAcknowledgments)
    .values({
      clientId,
      documentId: args.documentId,
      versionId: args.versionId,
      personId: args.personId,
      requiredReadId,
      acknowledgmentNote: noteTrim ? noteTrim.slice(0, 10_000) : null,
    })
    .returning();

  // 5. Pattern A — audit after insert.
  await logAudit({
    clientId,
    actorId,
    action: 'brain_document.acknowledge',
    entityType: 'brain_document',
    entityId: args.documentId,
    metadata: {
      ackId: ack.id,
      versionId: args.versionId,
      personId: args.personId,
      requiredReadId,
      hasNote: noteTrim.length > 0,
    },
  });
  // An ack can flip a required-read from "pending" to "satisfied" in the
  // documentsRequiredReadsPending dashboard count — bump.
  revalidateBrainDashboard(clientId);
  return ack;
}

// ─── listAcknowledgmentsForDocument ─────────────────────────────────────────

export interface ListAcksForDocumentOpts {
  versionId?: number;
  personId?: number;
  limit?: number;
  offset?: number;
}

export async function listAcknowledgmentsForDocument(
  clientId: number,
  documentId: number,
  opts: ListAcksForDocumentOpts = {},
): Promise<AckRow[]> {
  const conds = [
    eq(brainDocumentAcknowledgments.clientId, clientId),
    eq(brainDocumentAcknowledgments.documentId, documentId),
  ];
  if (opts.versionId !== undefined) {
    conds.push(eq(brainDocumentAcknowledgments.versionId, opts.versionId));
  }
  if (opts.personId !== undefined) {
    conds.push(eq(brainDocumentAcknowledgments.personId, opts.personId));
  }
  const limit = opts.limit !== undefined ? Math.max(1, Math.min(opts.limit, 200)) : 100;
  const offset = opts.offset !== undefined ? Math.max(0, opts.offset) : 0;

  const rows = await db
    .select({
      ackId: brainDocumentAcknowledgments.id,
      versionId: brainDocumentAcknowledgments.versionId,
      versionNumber: brainDocumentVersions.versionNumber,
      personId: brainDocumentAcknowledgments.personId,
      personName: brainPeople.fullName,
      acknowledgedAt: brainDocumentAcknowledgments.acknowledgedAt,
      acknowledgmentNote: brainDocumentAcknowledgments.acknowledgmentNote,
    })
    .from(brainDocumentAcknowledgments)
    .innerJoin(brainDocumentVersions, eq(brainDocumentVersions.id, brainDocumentAcknowledgments.versionId))
    .leftJoin(brainPeople, eq(brainPeople.id, brainDocumentAcknowledgments.personId))
    .where(and(...conds))
    .orderBy(desc(brainDocumentAcknowledgments.acknowledgedAt))
    .limit(limit)
    .offset(offset);
  return rows;
}

// ─── listAcknowledgmentsForPerson ───────────────────────────────────────────

export interface ListAcksForPersonOpts {
  limit?: number;
  offset?: number;
}

export async function listAcknowledgmentsForPerson(
  clientId: number,
  personId: number,
  opts: ListAcksForPersonOpts = {},
): Promise<AckForPersonRow[]> {
  const limit = opts.limit !== undefined ? Math.max(1, Math.min(opts.limit, 200)) : 100;
  const offset = opts.offset !== undefined ? Math.max(0, opts.offset) : 0;
  const rows = await db
    .select({
      ackId: brainDocumentAcknowledgments.id,
      documentId: brainDocumentAcknowledgments.documentId,
      documentTitle: brainDocuments.title,
      versionNumber: brainDocumentVersions.versionNumber,
      acknowledgedAt: brainDocumentAcknowledgments.acknowledgedAt,
    })
    .from(brainDocumentAcknowledgments)
    .innerJoin(brainDocuments, eq(brainDocuments.id, brainDocumentAcknowledgments.documentId))
    .innerJoin(brainDocumentVersions, eq(brainDocumentVersions.id, brainDocumentAcknowledgments.versionId))
    .where(and(
      eq(brainDocumentAcknowledgments.clientId, clientId),
      eq(brainDocumentAcknowledgments.personId, personId),
    ))
    .orderBy(desc(brainDocumentAcknowledgments.acknowledgedAt))
    .limit(limit)
    .offset(offset);
  return rows;
}

// ─── complianceReport ───────────────────────────────────────────────────────

/**
 * Canonical "who's read this and who hasn't" view.
 *
 * Resolves the universe of `assignedPersonIds` by union-ing:
 *   - person-target required-reads → personId
 *   - org_unit-target required-reads → active members of that unit
 *
 * Partitions assignedPersonIds into acknowledged / pending / overdue against
 * the document's currentPublishedVersionId. A document with no current
 * published version yields acknowledged=0 for everyone (they have nothing
 * to ack against yet).
 *
 * Performance: one query per join, no N+1. Org-unit expansion is a single
 * batched join.
 */
export async function complianceReport(
  clientId: number,
  documentId: number,
): Promise<ComplianceReport | null> {
  const doc = await getDocumentForClient(db, clientId, documentId);
  if (!doc) return null;

  // 1. Pull every required-read row for this doc.
  const requiredReads = await listRequiredReadsForDocument(clientId, documentId, { limit: 200, offset: 0 });

  // 2. Resolve assignedPersonIds — union of person-targets + active members
  //    of every org-unit target.
  const directPersonIds = requiredReads
    .filter((r) => r.targetType === 'person')
    .map((r) => r.targetId);

  const orgUnitTargets = requiredReads.filter((r) => r.targetType === 'org_unit');
  const orgUnitIds = orgUnitTargets.map((r) => r.targetId);

  let orgUnitMembers: Array<{ orgUnitId: number; personId: number }> = [];
  if (orgUnitIds.length > 0) {
    orgUnitMembers = await db
      .select({
        orgUnitId: brainPersonOrgUnits.orgUnitId,
        personId: brainPersonOrgUnits.personId,
      })
      .from(brainPersonOrgUnits)
      .innerJoin(brainPeople, eq(brainPeople.id, brainPersonOrgUnits.personId))
      .where(and(
        eq(brainPersonOrgUnits.clientId, clientId),
        inArray(brainPersonOrgUnits.orgUnitId, orgUnitIds),
        eq(brainPeople.status, 'active'),
      ));
  }

  // Track per-person earliest dueAt for overdue partitioning. A person gets
  // assigned through multiple paths (direct + org_unit); use the earliest
  // dueAt across all those paths.
  const dueByPerson = new Map<number, Date | null>();
  const setDue = (pid: number, due: Date | null) => {
    if (!dueByPerson.has(pid)) { dueByPerson.set(pid, due); return; }
    const prev = dueByPerson.get(pid)!;
    if (due == null) return;
    if (prev == null || due < prev) dueByPerson.set(pid, due);
  };

  // Direct person assignments
  for (const r of requiredReads) {
    if (r.targetType === 'person') setDue(r.targetId, r.dueAt);
  }
  // Org-unit fan-out
  const orgUnitDueById = new Map<number, Date | null>();
  for (const r of orgUnitTargets) orgUnitDueById.set(r.targetId, r.dueAt);
  for (const m of orgUnitMembers) {
    setDue(m.personId, orgUnitDueById.get(m.orgUnitId) ?? null);
  }

  const assignedPersonIds = Array.from(new Set([
    ...directPersonIds,
    ...orgUnitMembers.map((m) => m.personId),
  ]));

  // 3. Look up acks against currentPublishedVersionId.
  let acknowledgedPersonIds: number[] = [];
  if (doc.currentPublishedVersionId != null && assignedPersonIds.length > 0) {
    const acks = await db
      .select({ personId: brainDocumentAcknowledgments.personId })
      .from(brainDocumentAcknowledgments)
      .where(and(
        eq(brainDocumentAcknowledgments.clientId, clientId),
        eq(brainDocumentAcknowledgments.documentId, documentId),
        eq(brainDocumentAcknowledgments.versionId, doc.currentPublishedVersionId),
        inArray(brainDocumentAcknowledgments.personId, assignedPersonIds),
      ));
    acknowledgedPersonIds = Array.from(new Set(acks.map((a) => a.personId)));
  }

  const ackSet = new Set(acknowledgedPersonIds);
  const pendingPersonIds = assignedPersonIds.filter((pid) => !ackSet.has(pid));

  const now = new Date();
  const overduePersonIds = pendingPersonIds.filter((pid) => {
    const due = dueByPerson.get(pid);
    return due != null && due < now;
  });

  return {
    document: {
      id: doc.id,
      title: doc.title,
      slug: doc.slug,
      currentPublishedVersionId: doc.currentPublishedVersionId,
    },
    requiredReads: requiredReads.map((r) => ({
      targetType: r.targetType,
      targetId: r.targetId,
      targetName: r.targetName,
      pinnedVersionId: r.pinnedVersionId,
      dueAt: r.dueAt,
    })),
    acknowledgedPersonIds,
    pendingPersonIds,
    overduePersonIds,
    summary: {
      totalAssigned: assignedPersonIds.length,
      acknowledged: acknowledgedPersonIds.length,
      pending: pendingPersonIds.length,
      overdue: overduePersonIds.length,
    },
  };
}
