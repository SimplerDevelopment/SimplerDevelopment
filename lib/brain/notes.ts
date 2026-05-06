import { db } from '@/lib/db';
import { brainNotes } from '@/lib/db/schema';
import { and, asc, desc, eq, inArray, isNull, isNotNull, sql } from 'drizzle-orm';
import { logAudit } from './audit';
import { deleteFromS3 } from '@/lib/s3/delete';
import { extractAndSyncWikiLinks } from './extract-wikilinks';

export type BrainNote = typeof brainNotes.$inferSelect;

export type NoteSort = 'updated' | 'created' | 'title';
export type NoteOrder = 'asc' | 'desc';

interface ListOpts {
  relationshipOverlayId?: number;
  companyId?: number;
  dealId?: number;
  contactId?: number;
  meetingId?: number;
  pinnedOnly?: boolean;
  search?: string;
  tag?: string;
  /**
   * Tag-prefix match — treats `/` as a folder separator. Prefix `kb/marketing`
   * matches `kb/marketing` and `kb/marketing/seo` but NOT `kb/marketing-old`.
   */
  tagPrefix?: string;
  /** Exact source URL match — used by MCP crawlers to dedupe before re-saving. */
  sourceUrl?: string;
  /** Prefix match on source URL — find all notes ingested from a given site. */
  sourceUrlStartsWith?: string;
  /** When true, only return soft-deleted (trashed) notes. Default false. */
  trashed?: boolean;
  limit?: number;
  /** Pagination offset; pairs with `limit`. Default 0. */
  offset?: number;
  sort?: NoteSort;
  order?: NoteOrder;
}

/** Build the WHERE conditions shared by listNotes and countNotes. */
function buildNoteFilters(clientId: number, opts: ListOpts) {
  const conds = [eq(brainNotes.clientId, clientId)];
  conds.push(opts.trashed ? isNotNull(brainNotes.deletedAt) : isNull(brainNotes.deletedAt));
  if (opts.relationshipOverlayId !== undefined) conds.push(eq(brainNotes.relationshipOverlayId, opts.relationshipOverlayId));
  if (opts.companyId !== undefined) conds.push(eq(brainNotes.companyId, opts.companyId));
  if (opts.dealId !== undefined) conds.push(eq(brainNotes.dealId, opts.dealId));
  if (opts.contactId !== undefined) conds.push(eq(brainNotes.contactId, opts.contactId));
  if (opts.meetingId !== undefined) conds.push(eq(brainNotes.meetingId, opts.meetingId));
  if (opts.pinnedOnly) conds.push(eq(brainNotes.pinned, true));
  if (opts.search && opts.search.trim()) {
    const q = `%${opts.search.trim()}%`;
    conds.push(sql`(${brainNotes.title} ILIKE ${q} OR ${brainNotes.body} ILIKE ${q})`);
  }
  if (opts.tag) {
    conds.push(sql`${brainNotes.tags}::jsonb @> ${JSON.stringify([opts.tag])}::jsonb`);
  }
  if (opts.tagPrefix) {
    const prefix = opts.tagPrefix;
    const prefixWithSlash = `${prefix}/%`;
    conds.push(
      sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${brainNotes.tags}::jsonb) AS t WHERE t = ${prefix} OR t LIKE ${prefixWithSlash})`,
    );
  }
  if (opts.sourceUrl) conds.push(eq(brainNotes.sourceUrl, opts.sourceUrl));
  if (opts.sourceUrlStartsWith) {
    const prefix = `${opts.sourceUrlStartsWith}%`;
    conds.push(sql`${brainNotes.sourceUrl} ILIKE ${prefix}`);
  }
  return conds;
}

export async function listNotes(clientId: number, opts: ListOpts = {}): Promise<BrainNote[]> {
  const conds = buildNoteFilters(clientId, opts);
  const sort: NoteSort = opts.sort ?? 'updated';
  const order: NoteOrder = opts.order ?? (sort === 'title' ? 'asc' : 'desc');
  const dir = order === 'asc' ? asc : desc;

  const orderBy = (() => {
    if (sort === 'updated') {
      return [desc(brainNotes.pinned), dir(brainNotes.updatedAt)];
    }
    if (sort === 'created') {
      return [desc(brainNotes.pinned), dir(brainNotes.createdAt)];
    }
    return [desc(brainNotes.pinned), order === 'asc' ? sql`lower(${brainNotes.title}) asc` : sql`lower(${brainNotes.title}) desc`];
  })();

  return db.select().from(brainNotes)
    .where(and(...conds))
    .orderBy(...orderBy)
    .limit(opts.limit ?? 200)
    .offset(opts.offset ?? 0);
}

/** Count rows matching the same filter set as listNotes — for pagination total. */
export async function countNotes(clientId: number, opts: ListOpts = {}): Promise<number> {
  const conds = buildNoteFilters(clientId, opts);
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(brainNotes).where(and(...conds));
  return row?.count ?? 0;
}

export async function getNote(clientId: number, noteId: number): Promise<BrainNote | null> {
  const [row] = await db.select().from(brainNotes)
    .where(and(eq(brainNotes.id, noteId), eq(brainNotes.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

/**
 * Find a note by its source URL — used by AI-driven web crawls to decide
 * whether to insert a new note or update the existing one for that URL.
 * Returns the most recently updated match.
 */
export async function getNoteBySourceUrl(clientId: number, sourceUrl: string): Promise<BrainNote | null> {
  const [row] = await db.select().from(brainNotes)
    .where(and(eq(brainNotes.clientId, clientId), eq(brainNotes.sourceUrl, sourceUrl)))
    .orderBy(desc(brainNotes.updatedAt))
    .limit(1);
  return row ?? null;
}

interface CreateNoteInput {
  clientId: number;
  title: string;
  body?: string;
  tags?: string[];
  meetingId?: number | null;
  relationshipOverlayId?: number | null;
  companyId?: number | null;
  dealId?: number | null;
  contactId?: number | null;
  confidentialityLevel?: 'standard' | 'restricted' | 'confidential';
  pinned?: boolean;
  source?: 'manual' | 'ai_review' | 'document_import' | 'crawl';
  reviewItemId?: number | null;
  /** Original URL the content was scraped/imported from. */
  sourceUrl?: string | null;
  createdBy?: number | null;
  // Optional file attachment (one per note). All five must be provided
  // together when an attachment is being saved.
  attachmentUrl?: string | null;
  attachmentFilename?: string | null;
  attachmentMimeType?: string | null;
  attachmentFileSize?: number | null;
  attachmentStoredKey?: string | null;
}

export async function createNote(input: CreateNoteInput): Promise<BrainNote> {
  const body = (input.body ?? '').slice(0, 50_000);
  const [created] = await db.insert(brainNotes).values({
    clientId: input.clientId,
    title: input.title.trim().slice(0, 255),
    body,
    tags: input.tags ?? [],
    meetingId: input.meetingId ?? null,
    relationshipOverlayId: input.relationshipOverlayId ?? null,
    companyId: input.companyId ?? null,
    dealId: input.dealId ?? null,
    contactId: input.contactId ?? null,
    confidentialityLevel: input.confidentialityLevel ?? 'standard',
    pinned: input.pinned ?? false,
    source: input.source ?? 'manual',
    reviewItemId: input.reviewItemId ?? null,
    sourceUrl: input.sourceUrl ?? null,
    attachmentUrl: input.attachmentUrl ?? null,
    attachmentFilename: input.attachmentFilename ?? null,
    attachmentMimeType: input.attachmentMimeType ?? null,
    attachmentFileSize: input.attachmentFileSize ?? null,
    attachmentStoredKey: input.attachmentStoredKey ?? null,
    createdBy: input.createdBy ?? null,
  }).returning();

  await extractAndSyncWikiLinks(input.clientId, created.id, body).catch((err) => {
    console.warn('[brain.notes] wikilink sync failed', { noteId: created.id, err });
  });

  await logAudit({
    clientId: input.clientId,
    actorId: input.createdBy ?? null,
    action: 'note.created',
    entityType: 'brain_note',
    entityId: created.id,
  });

  return created;
}

interface UpdateNoteInput {
  title?: string;
  body?: string;
  tags?: string[];
  meetingId?: number | null;
  relationshipOverlayId?: number | null;
  companyId?: number | null;
  dealId?: number | null;
  contactId?: number | null;
  confidentialityLevel?: 'standard' | 'restricted' | 'confidential';
  pinned?: boolean;
  sourceUrl?: string | null;
}

export async function updateNote(
  clientId: number,
  noteId: number,
  input: UpdateNoteInput,
  actorId: number | null,
): Promise<BrainNote | null> {
  const before = await getNote(clientId, noteId);
  if (!before) return null;

  const patch: Partial<typeof brainNotes.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title.trim().slice(0, 255);
  if (input.body !== undefined) patch.body = input.body.slice(0, 50_000);
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.meetingId !== undefined) patch.meetingId = input.meetingId;
  if (input.relationshipOverlayId !== undefined) patch.relationshipOverlayId = input.relationshipOverlayId;
  if (input.companyId !== undefined) patch.companyId = input.companyId;
  if (input.dealId !== undefined) patch.dealId = input.dealId;
  if (input.contactId !== undefined) patch.contactId = input.contactId;
  if (input.confidentialityLevel !== undefined) patch.confidentialityLevel = input.confidentialityLevel;
  if (input.pinned !== undefined) patch.pinned = input.pinned;
  if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl;

  const [updated] = await db.update(brainNotes).set(patch)
    .where(and(eq(brainNotes.id, noteId), eq(brainNotes.clientId, clientId)))
    .returning();

  if (updated) {
    if (input.body !== undefined) {
      await extractAndSyncWikiLinks(clientId, noteId, patch.body ?? '').catch((err) => {
        console.warn('[brain.notes] wikilink sync failed', { noteId, err });
      });
    }
    await logAudit({
      clientId,
      actorId,
      action: 'note.updated',
      entityType: 'brain_note',
      entityId: noteId,
      metadata: { changedFields: Object.keys(input) },
    });
  }
  return updated ?? null;
}

export async function deleteNote(
  clientId: number,
  noteId: number,
  actorId: number | null,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  const before = await getNote(clientId, noteId);
  if (!before) return false;

  const alreadySoftDeleted = before.deletedAt !== null;
  const hardDelete = opts.force === true || alreadySoftDeleted;

  if (!hardDelete) {
    await db.update(brainNotes)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(brainNotes.id, noteId), eq(brainNotes.clientId, clientId)));

    await logAudit({
      clientId,
      actorId,
      action: 'soft_deleted',
      entityType: 'brain_note',
      entityId: noteId,
    });
    return true;
  }

  await db.delete(brainNotes).where(and(eq(brainNotes.id, noteId), eq(brainNotes.clientId, clientId)));

  if (before.attachmentStoredKey) {
    deleteFromS3(before.attachmentStoredKey).catch((err) => {
      console.warn('[brain.notes] failed to delete S3 object', before.attachmentStoredKey, err);
    });
  }

  await logAudit({
    clientId,
    actorId,
    action: 'hard_deleted',
    entityType: 'brain_note',
    entityId: noteId,
    metadata: before.attachmentStoredKey ? { hadAttachment: true, key: before.attachmentStoredKey } : undefined,
  });
  return true;
}

export async function restoreNote(
  clientId: number,
  noteId: number,
  actorId: number | null,
): Promise<BrainNote | null> {
  const before = await getNote(clientId, noteId);
  if (!before) return null;
  if (before.deletedAt === null) return before;

  const [restored] = await db.update(brainNotes)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(brainNotes.id, noteId), eq(brainNotes.clientId, clientId)))
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'restored',
    entityType: 'brain_note',
    entityId: noteId,
  });
  return restored ?? null;
}

export type BulkOp =
  | { kind: 'soft_delete' }
  | { kind: 'restore' }
  | { kind: 'hard_delete' }
  | { kind: 'add_tags'; tags: string[] }
  | { kind: 'remove_tags'; tags: string[] }
  | { kind: 'replace_tag_prefix'; from: string; to: string };

export async function bulkUpdateNotes(
  clientId: number,
  noteIds: number[],
  op: BulkOp,
  actorId: number | null,
): Promise<{ updated: number; failed: number[] }> {
  const uniqueIds = Array.from(new Set(noteIds.filter((n) => Number.isFinite(n))));
  if (uniqueIds.length === 0) return { updated: 0, failed: [] };

  const owned = await db.select({ id: brainNotes.id, tags: brainNotes.tags, attachmentStoredKey: brainNotes.attachmentStoredKey })
    .from(brainNotes)
    .where(and(eq(brainNotes.clientId, clientId), inArray(brainNotes.id, uniqueIds)));

  const ownedIds = new Set(owned.map((r) => r.id));
  const failed = uniqueIds.filter((id) => !ownedIds.has(id));
  const validIds = uniqueIds.filter((id) => ownedIds.has(id));

  if (validIds.length === 0) return { updated: 0, failed };

  const now = new Date();
  let updated = 0;

  switch (op.kind) {
    case 'soft_delete': {
      const res = await db.update(brainNotes)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(brainNotes.clientId, clientId), inArray(brainNotes.id, validIds)))
        .returning({ id: brainNotes.id });
      updated = res.length;
      for (const r of res) {
        await logAudit({
          clientId, actorId, action: 'soft_deleted', entityType: 'brain_note', entityId: r.id,
          metadata: { bulk: true },
        });
      }
      break;
    }
    case 'restore': {
      const res = await db.update(brainNotes)
        .set({ deletedAt: null, updatedAt: now })
        .where(and(eq(brainNotes.clientId, clientId), inArray(brainNotes.id, validIds)))
        .returning({ id: brainNotes.id });
      updated = res.length;
      for (const r of res) {
        await logAudit({
          clientId, actorId, action: 'restored', entityType: 'brain_note', entityId: r.id,
          metadata: { bulk: true },
        });
      }
      break;
    }
    case 'hard_delete': {
      const keysToDelete = owned
        .filter((r) => validIds.includes(r.id) && r.attachmentStoredKey)
        .map((r) => r.attachmentStoredKey!) as string[];
      const res = await db.delete(brainNotes)
        .where(and(eq(brainNotes.clientId, clientId), inArray(brainNotes.id, validIds)))
        .returning({ id: brainNotes.id });
      updated = res.length;
      for (const key of keysToDelete) {
        deleteFromS3(key).catch((err) => {
          console.warn('[brain.notes] failed to delete S3 object', key, err);
        });
      }
      for (const r of res) {
        await logAudit({
          clientId, actorId, action: 'hard_deleted', entityType: 'brain_note', entityId: r.id,
          metadata: { bulk: true },
        });
      }
      break;
    }
    case 'add_tags': {
      const additions = op.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim());
      for (const row of owned) {
        if (!validIds.includes(row.id)) continue;
        const existing = Array.isArray(row.tags) ? row.tags : [];
        const merged = Array.from(new Set([...existing, ...additions]));
        if (merged.length === existing.length && merged.every((t, i) => existing[i] === t)) continue;
        await db.update(brainNotes)
          .set({ tags: merged, updatedAt: now })
          .where(and(eq(brainNotes.id, row.id), eq(brainNotes.clientId, clientId)));
        updated++;
        await logAudit({
          clientId, actorId, action: 'note.tags_added', entityType: 'brain_note', entityId: row.id,
          metadata: { bulk: true, added: additions },
        });
      }
      break;
    }
    case 'remove_tags': {
      const removals = new Set(op.tags.filter((t) => typeof t === 'string'));
      for (const row of owned) {
        if (!validIds.includes(row.id)) continue;
        const existing = Array.isArray(row.tags) ? row.tags : [];
        const next = existing.filter((t) => !removals.has(t));
        if (next.length === existing.length) continue;
        await db.update(brainNotes)
          .set({ tags: next, updatedAt: now })
          .where(and(eq(brainNotes.id, row.id), eq(brainNotes.clientId, clientId)));
        updated++;
        await logAudit({
          clientId, actorId, action: 'note.tags_removed', entityType: 'brain_note', entityId: row.id,
          metadata: { bulk: true, removed: Array.from(removals) },
        });
      }
      break;
    }
    case 'replace_tag_prefix': {
      const from = op.from;
      const to = op.to;
      for (const row of owned) {
        if (!validIds.includes(row.id)) continue;
        const existing = Array.isArray(row.tags) ? row.tags : [];
        let changed = false;
        const next = existing.map((t) => {
          if (t === from) { changed = true; return to; }
          if (t.startsWith(`${from}/`) || t.startsWith(from)) {
            changed = true;
            return `${to}${t.slice(from.length)}`;
          }
          return t;
        });
        if (!changed) continue;
        const deduped = Array.from(new Set(next));
        await db.update(brainNotes)
          .set({ tags: deduped, updatedAt: now })
          .where(and(eq(brainNotes.id, row.id), eq(brainNotes.clientId, clientId)));
        updated++;
        await logAudit({
          clientId, actorId, action: 'note.tags_prefix_replaced', entityType: 'brain_note', entityId: row.id,
          metadata: { bulk: true, from, to },
        });
      }
      break;
    }
  }

  return { updated, failed };
}

/**
 * Remove an attachment from a note while keeping the row. Used by the UI's
 * "✕" on the attachment chip.
 */
export async function clearAttachment(
  clientId: number,
  noteId: number,
  actorId: number | null,
): Promise<boolean> {
  const before = await getNote(clientId, noteId);
  if (!before) return false;
  if (!before.attachmentStoredKey) return true; // already cleared

  await db.update(brainNotes).set({
    attachmentUrl: null,
    attachmentFilename: null,
    attachmentMimeType: null,
    attachmentFileSize: null,
    attachmentStoredKey: null,
    updatedAt: new Date(),
  }).where(and(eq(brainNotes.id, noteId), eq(brainNotes.clientId, clientId)));

  deleteFromS3(before.attachmentStoredKey).catch((err) => {
    console.warn('[brain.notes] failed to delete S3 object', before.attachmentStoredKey, err);
  });

  await logAudit({
    clientId,
    actorId,
    action: 'note.attachment_cleared',
    entityType: 'brain_note',
    entityId: noteId,
  });
  return true;
}

/** All distinct tags this client has used, for tag-filter UIs. */
export async function listAllTags(clientId: number): Promise<string[]> {
  const rows = await db.select({ tags: brainNotes.tags }).from(brainNotes)
    .where(and(eq(brainNotes.clientId, clientId), isNull(brainNotes.deletedAt)));
  const set = new Set<string>();
  for (const r of rows) {
    for (const t of r.tags ?? []) set.add(t);
  }
  return Array.from(set).sort();
}

