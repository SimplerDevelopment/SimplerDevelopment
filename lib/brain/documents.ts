/**
 * Company Brain — documents backend.
 *
 * Documents are versioned, role-scoped SOPs / policies / required-reads with a
 * per-version acknowledgment audit trail. The unfinished half of the
 * Playbooks-vs-Documents split: Playbooks ship the *runnable* checklist;
 * Documents ship the *canonical written answer*.
 *
 * Five tables back this lib (see lib/db/schema/brain.ts):
 *   brain_documents                  — top-level wrapper.
 *   brain_document_versions          — immutable per-version body + metadata.
 *   brain_document_required_reads    — assigns a doc to a person OR org unit.
 *   brain_document_acknowledgments   — one row per (doc, version, person) ack.
 *   brain_document_links             — polymorphic "this doc is about X".
 *
 * THIS FILE OWNS:
 *   brain_documents, brain_document_versions, brain_document_links.
 *
 * Wave 2b's lane (do NOT touch from here):
 *   brain_document_required_reads, brain_document_acknowledgments.
 *
 * Audit-in-tx pitfall: `lib/db` is pinned to `max: 1`. `logAudit` inside
 * `db.transaction()` deadlocks. Every mutation in this file uses Pattern A
 * (audit AFTER tx) EXCEPT `publishDocument` which must atomically:
 *   1. flip the draft version's is_draft → false
 *   2. stamp publishedAt / publishedBy / title on the version
 *   3. flip currentPublishedVersionId on the document
 *   4. write the audit row
 * That entire intent is one transaction with Pattern B (txAudit inside tx).
 *
 * Status transitions are narrow:
 *   - createDocument seeds 'draft' + v1 draft version with empty body
 *   - updateDocument refuses status changes (throws)
 *   - publishDocument is the only path 'draft' | 'archived' → 'published'
 *   - archiveDocument is the only path → 'archived'
 *   - unarchiveDocument is the only path back from 'archived'
 *   - deleteDocument is a hard delete (gated by ack count unless force=true)
 */
import { db } from '@/lib/db';
import {
  brainDocuments,
  brainDocumentVersions,
  brainDocumentLinks,
  brainDocumentAcknowledgments,
  brainNotes,
  brainAuditLogs,
  brainTopics,
  brainInitiatives,
  brainDecisions,
  brainMeetings,
  brainGlossaryTerms,
  brainPeople,
  type BrainDocumentStatus,
  type BrainDocumentCategory,
  type BrainDocumentLinkEntityType,
} from '@/lib/db/schema';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { logAudit } from './audit';
import { revalidateBrainDashboard } from './dashboard';

// ─── Re-exported types ──────────────────────────────────────────────────────

export type BrainDocument = typeof brainDocuments.$inferSelect;
export type BrainDocumentVersion = typeof brainDocumentVersions.$inferSelect;
export type BrainDocumentLink = typeof brainDocumentLinks.$inferSelect;
export type { BrainDocumentStatus, BrainDocumentCategory, BrainDocumentLinkEntityType };

const LINKABLE_TYPES: BrainDocumentLinkEntityType[] = [
  'topic', 'initiative', 'decision', 'meeting', 'glossary_term', 'person',
];

export function isLinkableEntityType(s: string): s is BrainDocumentLinkEntityType {
  return (LINKABLE_TYPES as readonly string[]).includes(s);
}

// ─── slug helpers ───────────────────────────────────────────────────────────

/**
 * Lowercase, ASCII-alphanumeric, dash-separated; cap at ~240 chars to leave
 * room for a numeric collision suffix in the 255-char column.
 */
export function slugifyDocumentTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 240);
  return base || 'document';
}

/**
 * Pick a slug for `title` that doesn't collide with an existing document for
 * this tenant. On collision, suffix '-2', '-3', … until a free slot is found.
 * Bounded — falls back to a timestamp tail if 10k+ siblings share a base.
 */
async function uniqueSlugForClient(clientId: number, title: string): Promise<string> {
  const base = slugifyDocumentTitle(title);
  const taken = await db
    .select({ slug: brainDocuments.slug })
    .from(brainDocuments)
    .where(and(
      eq(brainDocuments.clientId, clientId),
      sql`${brainDocuments.slug} = ${base} OR ${brainDocuments.slug} LIKE ${base + '-%'}`,
    ));
  const takenSet = new Set(taken.map((r) => r.slug));
  if (!takenSet.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}-${i}`;
    if (!takenSet.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

// Exposed for unit testing.
export const __test_slugifyDocumentTitle = slugifyDocumentTitle;

// ─── List ───────────────────────────────────────────────────────────────────

export interface ListDocumentsOpts {
  status?: BrainDocumentStatus | BrainDocumentStatus[];
  category?: BrainDocumentCategory | BrainDocumentCategory[];
  ownerId?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DocumentListRow {
  id: number;
  title: string;
  slug: string;
  category: BrainDocumentCategory;
  status: BrainDocumentStatus;
  ownerId: number | null;
  currentPublishedVersionId: number | null;
  publishedAt: Date | null;
  versionCount: number;
  requiredReadCount: number;
  ackCount: number;
}

/**
 * Slim list with three count subqueries:
 *   - versionCount (brain_document_versions)
 *   - requiredReadCount (brain_document_required_reads)
 *   - ackCount (brain_document_acknowledgments)
 *
 * Each subquery hard-codes its outer-table column name to avoid the Drizzle
 * `${table.col}` pitfall — using `${brainDocuments.id}` would emit `id`
 * unqualified and silently match the inner table's column, returning 0.
 */
export async function listDocuments(
  clientId: number,
  opts: ListDocumentsOpts = {},
): Promise<DocumentListRow[]> {
  const conds = [eq(brainDocuments.clientId, clientId)];

  if (opts.status !== undefined) {
    const list = Array.isArray(opts.status) ? opts.status : [opts.status];
    if (list.length === 1) conds.push(eq(brainDocuments.status, list[0]));
    else if (list.length > 1) conds.push(inArray(brainDocuments.status, list));
  }
  if (opts.category !== undefined) {
    const list = Array.isArray(opts.category) ? opts.category : [opts.category];
    if (list.length === 1) conds.push(eq(brainDocuments.category, list[0]));
    else if (list.length > 1) conds.push(inArray(brainDocuments.category, list));
  }
  if (opts.ownerId !== undefined) {
    conds.push(eq(brainDocuments.ownerId, opts.ownerId));
  }
  if (opts.search && opts.search.trim()) {
    const q = `%${opts.search.trim()}%`;
    // Match against title OR the body of the current published version.
    // Outer-table refs hard-coded — see header note about the pitfall.
    conds.push(sql`(
      ${brainDocuments.title} ILIKE ${q}
      OR EXISTS (
        SELECT 1 FROM brain_document_versions
        WHERE brain_document_versions.id = brain_documents.current_published_version_id
          AND brain_document_versions.body ILIKE ${q}
      )
    )`);
  }

  const limit = opts.limit !== undefined ? Math.max(1, Math.min(opts.limit, 100)) : 50;
  const offset = opts.offset !== undefined ? Math.max(0, opts.offset) : 0;

  const rows = await db
    .select({
      id: brainDocuments.id,
      title: brainDocuments.title,
      slug: brainDocuments.slug,
      category: brainDocuments.category,
      status: brainDocuments.status,
      ownerId: brainDocuments.ownerId,
      currentPublishedVersionId: brainDocuments.currentPublishedVersionId,
      publishedAt: brainDocuments.publishedAt,
      versionCount: sql<number>`(
        SELECT COUNT(*)::int FROM brain_document_versions
        WHERE brain_document_versions.document_id = brain_documents.id
          AND brain_document_versions.client_id = ${clientId}
      )`.as('version_count'),
      requiredReadCount: sql<number>`(
        SELECT COUNT(*)::int FROM brain_document_required_reads
        WHERE brain_document_required_reads.document_id = brain_documents.id
          AND brain_document_required_reads.client_id = ${clientId}
      )`.as('required_read_count'),
      ackCount: sql<number>`(
        SELECT COUNT(*)::int FROM brain_document_acknowledgments
        WHERE brain_document_acknowledgments.document_id = brain_documents.id
          AND brain_document_acknowledgments.client_id = ${clientId}
      )`.as('ack_count'),
    })
    .from(brainDocuments)
    .where(and(...conds))
    .orderBy(desc(brainDocuments.updatedAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    category: r.category,
    status: r.status,
    ownerId: r.ownerId,
    currentPublishedVersionId: r.currentPublishedVersionId,
    publishedAt: r.publishedAt,
    versionCount: Number(r.versionCount ?? 0),
    requiredReadCount: Number(r.requiredReadCount ?? 0),
    ackCount: Number(r.ackCount ?? 0),
  }));
}

// ─── Get (single) ───────────────────────────────────────────────────────────

export interface GetDocumentOpts {
  includeBody?: boolean;
  includeAllVersions?: boolean;
}

export interface VersionSlim {
  id: number;
  versionNumber: number;
  isDraft: boolean;
  publishedAt: Date | null;
  title: string;
}

export interface ResolvedDocumentLink {
  entityType: BrainDocumentLinkEntityType;
  entityId: number;
  title: string | null;
  note: string | null;
}

export interface DocumentWithDetails {
  document: BrainDocument;
  currentPublishedVersion?: BrainDocumentVersion;
  currentDraftVersion?: BrainDocumentVersion;
  versions: VersionSlim[];
  allVersions?: BrainDocumentVersion[];
  links: ResolvedDocumentLink[];
}

export async function getDocumentById(
  clientId: number,
  id: number,
  opts: GetDocumentOpts = {},
): Promise<DocumentWithDetails | null> {
  const [doc] = await db
    .select()
    .from(brainDocuments)
    .where(and(eq(brainDocuments.id, id), eq(brainDocuments.clientId, clientId)))
    .limit(1);
  if (!doc) return null;

  // Slim version list — always returned.
  const versionRows = await db
    .select({
      id: brainDocumentVersions.id,
      versionNumber: brainDocumentVersions.versionNumber,
      isDraft: brainDocumentVersions.isDraft,
      publishedAt: brainDocumentVersions.publishedAt,
      title: brainDocumentVersions.title,
    })
    .from(brainDocumentVersions)
    .where(and(
      eq(brainDocumentVersions.documentId, id),
      eq(brainDocumentVersions.clientId, clientId),
    ))
    .orderBy(desc(brainDocumentVersions.versionNumber));

  const out: DocumentWithDetails = {
    document: doc,
    versions: versionRows,
    links: await listDocumentLinks(clientId, id),
  };

  if (opts.includeBody) {
    if (doc.currentPublishedVersionId !== null) {
      const [pub] = await db
        .select()
        .from(brainDocumentVersions)
        .where(and(
          eq(brainDocumentVersions.id, doc.currentPublishedVersionId),
          eq(brainDocumentVersions.clientId, clientId),
        ))
        .limit(1);
      if (pub) out.currentPublishedVersion = pub;
    }
    if (doc.currentDraftVersionId !== null) {
      const [draft] = await db
        .select()
        .from(brainDocumentVersions)
        .where(and(
          eq(brainDocumentVersions.id, doc.currentDraftVersionId),
          eq(brainDocumentVersions.clientId, clientId),
        ))
        .limit(1);
      if (draft) out.currentDraftVersion = draft;
    }
  }

  if (opts.includeAllVersions) {
    out.allVersions = await db
      .select()
      .from(brainDocumentVersions)
      .where(and(
        eq(brainDocumentVersions.documentId, id),
        eq(brainDocumentVersions.clientId, clientId),
      ))
      .orderBy(desc(brainDocumentVersions.versionNumber));
  }

  return out;
}

// ─── Create ─────────────────────────────────────────────────────────────────

export interface CreateDocumentInput {
  title: string;
  category?: BrainDocumentCategory;
  ownerId?: number | null;
  confidentialityLevel?: 'standard' | 'restricted' | 'confidential';
  defaultTopicIds?: number[];
  sourceNoteId?: number | null;
}

export interface CreateDocumentResult {
  document: BrainDocument;
  version: BrainDocumentVersion;
}

/**
 * Create a new document with a paired v1 draft version (body=''). Auto-derives
 * slug from title. Pattern A audit — the create is two related INSERTs but the
 * second only needs to know the document's id, and the document is consistent
 * with `currentDraftVersionId=null` between writes (the version row is created
 * second and we then update the pointer).
 *
 * To keep both writes atomic, the two INSERTs run inside db.transaction() and
 * the version-id pointer update runs inside the same tx. The audit row is
 * written AFTER the tx commits (Pattern A) — this is single-actor / single-
 * client intent that survives a partial failure cleanly because the document
 * row defaults `currentDraftVersionId=null` until the pointer update lands.
 */
export async function createDocument(
  clientId: number,
  actorId: number | null,
  input: CreateDocumentInput,
): Promise<CreateDocumentResult> {
  const title = input.title.trim().slice(0, 255);
  if (!title) throw new Error('title is required');
  const slug = await uniqueSlugForClient(clientId, title);

  const defaultTopicIds = Array.isArray(input.defaultTopicIds)
    ? input.defaultTopicIds.filter((n) => Number.isFinite(n) && n > 0)
    : [];

  const { document, version } = await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(brainDocuments)
      .values({
        clientId,
        title,
        slug,
        category: input.category ?? 'reference',
        status: 'draft',
        ownerId: input.ownerId ?? null,
        confidentialityLevel: input.confidentialityLevel ?? 'standard',
        defaultTopicIds,
        sourceNoteId: input.sourceNoteId ?? null,
        createdBy: actorId,
      })
      .returning();

    const [ver] = await tx
      .insert(brainDocumentVersions)
      .values({
        clientId,
        documentId: doc.id,
        versionNumber: 1,
        body: '',
        title,
        isDraft: true,
        createdBy: actorId,
      })
      .returning();

    const [docWithPtr] = await tx
      .update(brainDocuments)
      .set({ currentDraftVersionId: ver.id, updatedAt: new Date() })
      .where(and(eq(brainDocuments.id, doc.id), eq(brainDocuments.clientId, clientId)))
      .returning();

    return { document: docWithPtr ?? doc, version: ver };
  });

  await logAudit({
    clientId,
    actorId,
    action: 'brain_document.create',
    entityType: 'brain_document',
    entityId: document.id,
    metadata: { slug: document.slug, sourceNoteId: input.sourceNoteId ?? null },
  });

  // documentsDraft tile bumps when a new draft is created.
  revalidateBrainDashboard(clientId);
  return { document, version };
}

// ─── Update ─────────────────────────────────────────────────────────────────

export interface UpdateDocumentInput {
  title?: string;
  category?: BrainDocumentCategory;
  ownerId?: number | null;
  confidentialityLevel?: 'standard' | 'restricted' | 'confidential';
  defaultTopicIds?: number[];
  /** If present, throws — status changes go through publish/archive/unarchive. */
  status?: BrainDocumentStatus;
}

/**
 * Update top-level document metadata. Title change propagates to the next
 * published version's `title` at publish time — NOT retroactively to existing
 * versions (those snapshot the title that was approved). Pattern A audit.
 */
export async function updateDocument(
  clientId: number,
  actorId: number | null,
  id: number,
  patch: UpdateDocumentInput,
): Promise<BrainDocument | null> {
  if (patch.status !== undefined) {
    throw new Error('use publishDocument or archiveDocument to change status');
  }

  const set: Partial<typeof brainDocuments.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 255);
  if (patch.category !== undefined) set.category = patch.category;
  if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;
  if (patch.confidentialityLevel !== undefined) set.confidentialityLevel = patch.confidentialityLevel;
  if (patch.defaultTopicIds !== undefined) {
    set.defaultTopicIds = patch.defaultTopicIds.filter((n) => Number.isFinite(n) && n > 0);
  }

  const [updated] = await db
    .update(brainDocuments)
    .set(set)
    .where(and(eq(brainDocuments.id, id), eq(brainDocuments.clientId, clientId)))
    .returning();

  if (!updated) return null;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_document.update',
    entityType: 'brain_document',
    entityId: id,
    metadata: { changedFields: Object.keys(patch).filter((k) => k !== 'status') },
  });

  return updated;
}

// ─── Edit draft version ─────────────────────────────────────────────────────

export interface EditDraftVersionPatch {
  body?: string;
  summary?: string | null;
  changeNotes?: string | null;
}

/**
 * Edit the current draft version's body/summary/changeNotes. If no draft
 * exists (i.e. last action was a publish), creates a new draft with
 * versionNumber = max(versionNumber) + 1 seeded from the latest version's
 * body (so editors don't lose context starting from blank). Sets
 * currentDraftVersionId on the document.
 *
 * Refuses if the document is archived.
 *
 * Pattern A audit.
 */
export async function editDraftVersion(
  clientId: number,
  actorId: number | null,
  documentId: number,
  patch: EditDraftVersionPatch,
): Promise<{ document: BrainDocument; version: BrainDocumentVersion } | null> {
  const [doc] = await db
    .select()
    .from(brainDocuments)
    .where(and(
      eq(brainDocuments.id, documentId),
      eq(brainDocuments.clientId, clientId),
    ))
    .limit(1);
  if (!doc) return null;
  if (doc.status === 'archived') {
    throw new Error('cannot edit archived document — unarchive first');
  }

  let version: BrainDocumentVersion | undefined;

  if (doc.currentDraftVersionId !== null) {
    const [existing] = await db
      .select()
      .from(brainDocumentVersions)
      .where(and(
        eq(brainDocumentVersions.id, doc.currentDraftVersionId),
        eq(brainDocumentVersions.clientId, clientId),
      ))
      .limit(1);
    if (existing && existing.isDraft) {
      const set: Partial<typeof brainDocumentVersions.$inferInsert> = { updatedAt: new Date() };
      if (patch.body !== undefined) set.body = patch.body;
      if (patch.summary !== undefined) set.summary = patch.summary;
      if (patch.changeNotes !== undefined) set.changeNotes = patch.changeNotes;
      const [updated] = await db
        .update(brainDocumentVersions)
        .set(set)
        .where(and(
          eq(brainDocumentVersions.id, existing.id),
          eq(brainDocumentVersions.clientId, clientId),
        ))
        .returning();
      version = updated;
    }
  }

  if (!version) {
    // No draft — create one. Seed body from the latest published (or any latest)
    // version so the editor opens with the canonical content; the user's patch
    // then layers on top.
    const [latest] = await db
      .select()
      .from(brainDocumentVersions)
      .where(and(
        eq(brainDocumentVersions.documentId, documentId),
        eq(brainDocumentVersions.clientId, clientId),
      ))
      .orderBy(desc(brainDocumentVersions.versionNumber))
      .limit(1);
    const nextNum = (latest?.versionNumber ?? 0) + 1;
    const seedBody = patch.body !== undefined ? patch.body : (latest?.body ?? '');

    const [created] = await db
      .insert(brainDocumentVersions)
      .values({
        clientId,
        documentId,
        versionNumber: nextNum,
        body: seedBody,
        title: doc.title,
        summary: patch.summary ?? null,
        changeNotes: patch.changeNotes ?? null,
        isDraft: true,
        createdBy: actorId,
      })
      .returning();
    version = created;
  }

  // Make sure the document points at this draft.
  const [docUpdated] = await db
    .update(brainDocuments)
    .set({ currentDraftVersionId: version.id, updatedAt: new Date() })
    .where(and(eq(brainDocuments.id, documentId), eq(brainDocuments.clientId, clientId)))
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_document_version.edit_draft',
    entityType: 'brain_document',
    entityId: documentId,
    metadata: {
      versionId: version.id,
      versionNumber: version.versionNumber,
      changedFields: Object.keys(patch),
    },
  });

  return { document: docUpdated ?? doc, version };
}

// ─── Publish ────────────────────────────────────────────────────────────────

export interface PublishDocumentResult {
  document: BrainDocument;
  version: BrainDocumentVersion;
}

/**
 * Publish the current draft version. Atomic transaction (Pattern B — txAudit
 * inside the tx) because we mutate three rows in one logical step:
 *   1. version.is_draft → false, published_at/by, title frozen
 *   2. document.current_published_version_id, current_draft_version_id=null,
 *      status='published', published_at (first-publish only)
 *   3. audit log row
 *
 * Refuses if no draft exists or the draft body is empty.
 */
export async function publishDocument(
  clientId: number,
  actorId: number | null,
  documentId: number,
): Promise<PublishDocumentResult | null> {
  const result = await db.transaction(async (tx) => {
    const [doc] = await tx
      .select()
      .from(brainDocuments)
      .where(and(
        eq(brainDocuments.id, documentId),
        eq(brainDocuments.clientId, clientId),
      ))
      .limit(1);
    if (!doc) return null;
    if (doc.currentDraftVersionId === null) {
      throw new Error('no draft version to publish');
    }

    const [draft] = await tx
      .select()
      .from(brainDocumentVersions)
      .where(and(
        eq(brainDocumentVersions.id, doc.currentDraftVersionId),
        eq(brainDocumentVersions.clientId, clientId),
      ))
      .limit(1);
    if (!draft) throw new Error('current draft version not found');
    if (!draft.isDraft) throw new Error('current draft version is no longer a draft');
    if (!draft.body || !draft.body.trim()) {
      throw new Error('cannot publish empty body — add content first');
    }

    const now = new Date();
    const [publishedVersion] = await tx
      .update(brainDocumentVersions)
      .set({
        isDraft: false,
        publishedAt: now,
        publishedBy: actorId,
        title: doc.title, // freeze the document title onto this version
        updatedAt: now,
      })
      .where(and(
        eq(brainDocumentVersions.id, draft.id),
        eq(brainDocumentVersions.clientId, clientId),
      ))
      .returning();

    const firstPublishAt = doc.publishedAt ?? now;

    const [updatedDoc] = await tx
      .update(brainDocuments)
      .set({
        currentPublishedVersionId: publishedVersion.id,
        currentDraftVersionId: null,
        status: 'published',
        publishedAt: firstPublishAt,
        updatedAt: now,
      })
      .where(and(
        eq(brainDocuments.id, documentId),
        eq(brainDocuments.clientId, clientId),
      ))
      .returning();

    // Pattern B — txAudit inside the same connection. Doing this via
    // logAudit() would grab a fresh connection and deadlock against max:1.
    await tx.insert(brainAuditLogs).values({
      clientId,
      actorId,
      action: 'brain_document.publish',
      entityType: 'brain_document',
      entityId: documentId,
      metadata: {
        versionId: publishedVersion.id,
        versionNumber: publishedVersion.versionNumber,
        firstPublish: doc.publishedAt === null,
      },
    });

    return { document: updatedDoc, version: publishedVersion };
  });
  // documentsDraft → documentsPublished tile transition, and also affects
  // documentsRequiredReadsPending (now the current_published_version_id is set).
  if (result) revalidateBrainDashboard(clientId);
  return result;
}

// ─── Archive / Unarchive ────────────────────────────────────────────────────

export interface ArchiveDocumentArgs {
  reason?: string;
}

export async function archiveDocument(
  clientId: number,
  actorId: number | null,
  id: number,
  args: ArchiveDocumentArgs = {},
): Promise<BrainDocument | null> {
  const [before] = await db
    .select()
    .from(brainDocuments)
    .where(and(eq(brainDocuments.id, id), eq(brainDocuments.clientId, clientId)))
    .limit(1);
  if (!before) return null;
  if (before.status === 'archived') {
    throw new Error('document is already archived');
  }

  const reason = args.reason?.trim() ?? null;
  const now = new Date();
  const [updated] = await db
    .update(brainDocuments)
    .set({
      status: 'archived',
      archivedAt: now,
      archiveReason: reason,
      updatedAt: now,
    })
    .where(and(eq(brainDocuments.id, id), eq(brainDocuments.clientId, clientId)))
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_document.archive',
    entityType: 'brain_document',
    entityId: id,
    metadata: { from: before.status, hasReason: !!reason },
  });

  if (updated) revalidateBrainDashboard(clientId);
  return updated ?? null;
}

/**
 * Reverse `archiveDocument`. Restores status to 'published' if a published
 * version exists, otherwise to 'draft'. Clears archivedAt + archiveReason.
 */
export async function unarchiveDocument(
  clientId: number,
  actorId: number | null,
  id: number,
): Promise<BrainDocument | null> {
  const [before] = await db
    .select()
    .from(brainDocuments)
    .where(and(eq(brainDocuments.id, id), eq(brainDocuments.clientId, clientId)))
    .limit(1);
  if (!before) return null;
  if (before.status !== 'archived') {
    throw new Error(`cannot unarchive non-archived document (status: ${before.status})`);
  }

  const nextStatus: BrainDocumentStatus = before.currentPublishedVersionId !== null
    ? 'published'
    : 'draft';

  const [updated] = await db
    .update(brainDocuments)
    .set({
      status: nextStatus,
      archivedAt: null,
      archiveReason: null,
      updatedAt: new Date(),
    })
    .where(and(eq(brainDocuments.id, id), eq(brainDocuments.clientId, clientId)))
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_document.unarchive',
    entityType: 'brain_document',
    entityId: id,
    metadata: { restoredStatus: nextStatus },
  });

  if (updated) revalidateBrainDashboard(clientId);
  return updated ?? null;
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export interface DeleteDocumentOpts {
  /** When true, cascade-deletes acknowledgments via FK. Default false. */
  force?: boolean;
}

/**
 * Hard delete. Refuses by default if any acknowledgments exist for this
 * document — history preservation matters more than tidiness. Pass
 * `force=true` to cascade via the FK relations (acks/versions/required-reads
 * all have ON DELETE CASCADE from brain_documents).
 *
 * Pattern A audit — written BEFORE the destructive mutation so the audit
 * row survives a partial failure.
 */
export async function deleteDocument(
  clientId: number,
  actorId: number | null,
  id: number,
  opts: DeleteDocumentOpts = {},
): Promise<{ deleted: boolean; refused: boolean; ackCount: number }> {
  const [before] = await db
    .select()
    .from(brainDocuments)
    .where(and(eq(brainDocuments.id, id), eq(brainDocuments.clientId, clientId)))
    .limit(1);
  if (!before) return { deleted: false, refused: false, ackCount: 0 };

  const [ackRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(brainDocumentAcknowledgments)
    .where(and(
      eq(brainDocumentAcknowledgments.documentId, id),
      eq(brainDocumentAcknowledgments.clientId, clientId),
    ));
  const ackCount = Number(ackRow?.count ?? 0);

  if (ackCount > 0 && !opts.force) {
    return { deleted: false, refused: true, ackCount };
  }

  await logAudit({
    clientId,
    actorId,
    action: 'brain_document.delete',
    entityType: 'brain_document',
    entityId: id,
    metadata: {
      slug: before.slug,
      title: before.title,
      ackCount,
      force: opts.force === true,
    },
  });

  await db
    .delete(brainDocuments)
    .where(and(eq(brainDocuments.id, id), eq(brainDocuments.clientId, clientId)));

  revalidateBrainDashboard(clientId);
  return { deleted: true, refused: false, ackCount };
}

// ─── Promote from note ──────────────────────────────────────────────────────

export interface PromoteFromNoteArgs {
  title?: string;
  category?: BrainDocumentCategory;
}

/**
 * Promote an existing brain_note into a new document. The note's body
 * becomes the initial v1 draft version's body (so the editor can publish
 * immediately). The document's `sourceNoteId` is set to the source note.
 * Title defaults to the note's title (or first non-empty line of the body
 * if the note has no title).
 *
 * Pattern A audit.
 */
export async function promoteFromNote(
  clientId: number,
  actorId: number | null,
  noteId: number,
  args: PromoteFromNoteArgs = {},
): Promise<CreateDocumentResult | null> {
  const [note] = await db
    .select()
    .from(brainNotes)
    .where(and(eq(brainNotes.id, noteId), eq(brainNotes.clientId, clientId)))
    .limit(1);
  if (!note) return null;

  let title = args.title?.trim();
  if (!title) {
    title = (note.title ?? '').trim();
  }
  if (!title) {
    const firstLine = (note.body ?? '')
      .split('\n')
      .map((l) => l.replace(/^#+\s*/, '').trim())
      .find((l) => l.length > 0);
    title = firstLine ?? 'Untitled document';
  }
  title = title.slice(0, 255);
  const slug = await uniqueSlugForClient(clientId, title);

  const { document, version } = await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(brainDocuments)
      .values({
        clientId,
        title,
        slug,
        category: args.category ?? 'reference',
        status: 'draft',
        ownerId: null,
        confidentialityLevel: note.confidentialityLevel as 'standard' | 'restricted' | 'confidential',
        defaultTopicIds: [],
        sourceNoteId: noteId,
        createdBy: actorId,
      })
      .returning();

    const [ver] = await tx
      .insert(brainDocumentVersions)
      .values({
        clientId,
        documentId: doc.id,
        versionNumber: 1,
        body: (note.body ?? '').slice(0, 1_000_000),
        title,
        isDraft: true,
        createdBy: actorId,
      })
      .returning();

    const [docWithPtr] = await tx
      .update(brainDocuments)
      .set({ currentDraftVersionId: ver.id, updatedAt: new Date() })
      .where(and(eq(brainDocuments.id, doc.id), eq(brainDocuments.clientId, clientId)))
      .returning();

    return { document: docWithPtr ?? doc, version: ver };
  });

  await logAudit({
    clientId,
    actorId,
    action: 'brain_document.promote_from_note',
    entityType: 'brain_document',
    entityId: document.id,
    metadata: { sourceNoteId: noteId, slug: document.slug },
  });

  // documentsDraft tile bumps.
  revalidateBrainDashboard(clientId);
  return { document, version };
}

// ─── Links ──────────────────────────────────────────────────────────────────

export interface LinkEntityArgs {
  documentId: number;
  entityType: BrainDocumentLinkEntityType;
  entityId: number;
  note?: string | null;
}

/**
 * Link an entity to a document. ON CONFLICT DO NOTHING — same triple is
 * idempotent. Returns `{ linkId, alreadyLinked }`.
 */
export async function linkEntity(
  clientId: number,
  actorId: number | null,
  args: LinkEntityArgs,
): Promise<{ linkId: number | null; alreadyLinked: boolean }> {
  if (!isLinkableEntityType(args.entityType)) {
    throw new Error(`invalid entityType: ${args.entityType}`);
  }
  // Tenant ownership check first — never trust the link payload alone.
  const [owner] = await db
    .select({ id: brainDocuments.id })
    .from(brainDocuments)
    .where(and(
      eq(brainDocuments.id, args.documentId),
      eq(brainDocuments.clientId, clientId),
    ))
    .limit(1);
  if (!owner) throw new Error('document not found');

  const inserted = await db
    .insert(brainDocumentLinks)
    .values({
      clientId,
      documentId: args.documentId,
      entityType: args.entityType,
      entityId: args.entityId,
      note: args.note ?? null,
      createdBy: actorId,
    })
    .onConflictDoNothing()
    .returning({ id: brainDocumentLinks.id });

  if (inserted.length === 0) {
    return { linkId: null, alreadyLinked: true };
  }

  await logAudit({
    clientId,
    actorId,
    action: 'brain_document.link',
    entityType: 'brain_document',
    entityId: args.documentId,
    metadata: { entityType: args.entityType, entityId: args.entityId },
  });

  return { linkId: inserted[0].id, alreadyLinked: false };
}

export async function unlinkEntity(
  clientId: number,
  actorId: number | null,
  args: { documentId: number; entityType: BrainDocumentLinkEntityType; entityId: number },
): Promise<boolean> {
  if (!isLinkableEntityType(args.entityType)) {
    throw new Error(`invalid entityType: ${args.entityType}`);
  }
  const deleted = await db
    .delete(brainDocumentLinks)
    .where(and(
      eq(brainDocumentLinks.clientId, clientId),
      eq(brainDocumentLinks.documentId, args.documentId),
      eq(brainDocumentLinks.entityType, args.entityType),
      eq(brainDocumentLinks.entityId, args.entityId),
    ))
    .returning({ id: brainDocumentLinks.id });
  if (deleted.length === 0) return false;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_document.unlink',
    entityType: 'brain_document',
    entityId: args.documentId,
    metadata: { entityType: args.entityType, entityId: args.entityId },
  });
  return true;
}

export interface ListDocumentLinksOpts {
  entityType?: BrainDocumentLinkEntityType;
  limit?: number;
  offset?: number;
}

/**
 * List a document's links, resolved to display rows. Per-type batched lookup
 * to recover the entity's display label:
 *   topic         → brain_topics.name
 *   initiative    → brain_initiatives.name
 *   decision      → brain_decisions.title
 *   meeting       → brain_meetings.title
 *   glossary_term → brain_glossary_terms.term
 *   person        → brain_people.fullName
 *
 * Returns `title: null` for any link whose entity has been hard-deleted (no
 * matching row in the target table) — UI renders entity type + id as a
 * fallback.
 */
export async function listDocumentLinks(
  clientId: number,
  documentId: number,
  opts: ListDocumentLinksOpts = {},
): Promise<ResolvedDocumentLink[]> {
  const limit = opts.limit !== undefined ? Math.max(1, Math.min(opts.limit, 200)) : 100;
  const offset = opts.offset !== undefined ? Math.max(0, opts.offset) : 0;

  const conds = [
    eq(brainDocumentLinks.clientId, clientId),
    eq(brainDocumentLinks.documentId, documentId),
  ];
  if (opts.entityType) conds.push(eq(brainDocumentLinks.entityType, opts.entityType));

  const rows = await db
    .select({
      entityType: brainDocumentLinks.entityType,
      entityId: brainDocumentLinks.entityId,
      note: brainDocumentLinks.note,
      createdAt: brainDocumentLinks.createdAt,
    })
    .from(brainDocumentLinks)
    .where(and(...conds))
    .orderBy(desc(brainDocumentLinks.createdAt))
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) return [];

  // Batch resolve titles per entity type, tenant-scoped.
  const byType = new Map<BrainDocumentLinkEntityType, number[]>();
  for (const r of rows) {
    const t = r.entityType as BrainDocumentLinkEntityType;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(r.entityId);
  }

  const titleByKey = new Map<string, string | null>();
  const key = (t: string, id: number) => `${t}:${id}`;

  for (const [t, ids] of byType.entries()) {
    if (ids.length === 0) continue;
    let resolved: Array<{ id: number; title: string | null }> = [];
    switch (t) {
      case 'topic':
        resolved = (await db
          .select({ id: brainTopics.id, name: brainTopics.name })
          .from(brainTopics)
          .where(and(eq(brainTopics.clientId, clientId), inArray(brainTopics.id, ids))))
          .map((r) => ({ id: r.id, title: r.name }));
        break;
      case 'initiative':
        resolved = (await db
          .select({ id: brainInitiatives.id, name: brainInitiatives.name })
          .from(brainInitiatives)
          .where(and(eq(brainInitiatives.clientId, clientId), inArray(brainInitiatives.id, ids))))
          .map((r) => ({ id: r.id, title: r.name }));
        break;
      case 'decision':
        resolved = await db
          .select({ id: brainDecisions.id, title: brainDecisions.title })
          .from(brainDecisions)
          .where(and(eq(brainDecisions.clientId, clientId), inArray(brainDecisions.id, ids)));
        break;
      case 'meeting':
        resolved = await db
          .select({ id: brainMeetings.id, title: brainMeetings.title })
          .from(brainMeetings)
          .where(and(eq(brainMeetings.clientId, clientId), inArray(brainMeetings.id, ids)));
        break;
      case 'glossary_term':
        resolved = (await db
          .select({ id: brainGlossaryTerms.id, term: brainGlossaryTerms.term })
          .from(brainGlossaryTerms)
          .where(and(eq(brainGlossaryTerms.clientId, clientId), inArray(brainGlossaryTerms.id, ids))))
          .map((r) => ({ id: r.id, title: r.term }));
        break;
      case 'person':
        resolved = (await db
          .select({ id: brainPeople.id, fullName: brainPeople.fullName })
          .from(brainPeople)
          .where(and(eq(brainPeople.clientId, clientId), inArray(brainPeople.id, ids))))
          .map((r) => ({ id: r.id, title: r.fullName }));
        break;
      default:
        resolved = ids.map((id) => ({ id, title: null }));
        break;
    }
    for (const r of resolved) titleByKey.set(key(t, r.id), r.title);
  }

  return rows.map((r) => ({
    entityType: r.entityType as BrainDocumentLinkEntityType,
    entityId: r.entityId,
    title: titleByKey.get(key(r.entityType, r.entityId)) ?? null,
    note: r.note,
  }));
}

// ─── Pure helper for unit testing slug derivation ───────────────────────────
// Re-exported so the unit suite can drive collision suffix logic without
// needing the DB.

export interface PickSlugFromTakenArgs {
  base: string;
  taken: string[];
}

/**
 * Pure version of the collision suffix loop — given a base slug and the set
 * of taken slugs that share the base, return the next free slug. Used by the
 * unit tests; the production path runs the same logic against the DB result.
 */
export function pickNextAvailableSlug({ base, taken }: PickSlugFromTakenArgs): string {
  const takenSet = new Set(taken);
  if (!takenSet.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}-${i}`;
    if (!takenSet.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
