import { db } from '@/lib/db';
import {
  brainNotes,
  brainKbLinks,
  brainCustomFieldValues,
  brainAuditLogs,
} from '@/lib/db/schema';
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
  /** When true, only return notes whose `tags` is null or an empty array.
   *  Powers the "Untagged" bucket in the tag-first landing view. */
  untagged?: boolean;
  /** When true, only return notes with zero inbound wikilinks ("orphans" /
   *  stranded knowledge). Powers the Orphans pin in the sidebar and the
   *  Tag Treemap drill-in. */
  orphans?: boolean;
  /** When true, only return soft-deleted (trashed) notes. Default false. */
  trashed?: boolean;
  limit?: number;
  /** Pagination offset; pairs with `limit`. Default 0. */
  offset?: number;
  sort?: NoteSort;
  order?: NoteOrder;
  /**
   * Return the full row including `body` markdown. Default false — the list
   * path projects only the columns the sidebar/UI renders. Detail views and
   * AI ingestion paths that need the body must opt in explicitly. Mostly here
   * to keep MCP and the browser-extension "related notes" snippets working
   * without forcing them to refetch each note one-by-one.
   */
  includeBody?: boolean;
}

/**
 * Columns the slim list path projects. Excludes `body` (up to 50 KB/note),
 * `confidentialityLevel`, `attachmentStoredKey`, `attachmentUrl`,
 * `attachmentMimeType`, `attachmentFileSize`, `reviewItemId`, and `createdBy`
 * — none of which the list pane renders, and three of which are bulky enough
 * to dominate the response on a tag with many notes.
 *
 * Detail loaders (`getNote`, `getNoteBySourceUrl`) keep returning the full
 * row.
 *
 * Defined as a structural shape rather than `Omit<BrainNote, ...>` so the
 * type doesn't force TS to materialize `BrainNote`'s full key set, which
 * cascades into "property missing" errors at consumer sites when
 * `drizzle-orm` typings are unavailable in a partial typecheck.
 */
export interface BrainNoteListItem {
  id: number;
  clientId: number;
  title: string;
  meetingId: number | null;
  relationshipOverlayId: number | null;
  companyId: number | null;
  dealId: number | null;
  contactId: number | null;
  tags: string[];
  pinned: boolean;
  source: string;
  sourceUrl: string | null;
  attachmentFilename: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
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
  if (opts.untagged) {
    conds.push(sql`(${brainNotes.tags} IS NULL OR jsonb_array_length(${brainNotes.tags}::jsonb) = 0)`);
  }
  if (opts.orphans) {
    // A note is "orphaned" when no row in brain_kb_links has it as the
    // resolved target. NB: outer-table refs in correlated subqueries must be
    // hard-coded `brain_notes.id` — using `${brainNotes.id}` would emit
    // `id` unqualified and silently match the inner table, returning 0 rows.
    conds.push(sql`brain_notes.id NOT IN (
      SELECT brain_kb_links.to_note_id FROM brain_kb_links
      WHERE brain_kb_links.client_id = ${clientId}
        AND brain_kb_links.to_note_id IS NOT NULL
    )`);
  }
  if (opts.sourceUrl) conds.push(eq(brainNotes.sourceUrl, opts.sourceUrl));
  if (opts.sourceUrlStartsWith) {
    const prefix = `${opts.sourceUrlStartsWith}%`;
    conds.push(sql`${brainNotes.sourceUrl} ILIKE ${prefix}`);
  }
  return conds;
}

// Function overloads so callers that opt into `includeBody: true` get the
// full BrainNote shape back, while the slim default returns BrainNoteListItem.
// Both shapes are array-of-row; the response wrapper at the route layer is
// where pagination metadata lives.
export async function listNotes(
  clientId: number,
  opts: ListOpts & { includeBody: true },
): Promise<BrainNote[]>;
export async function listNotes(
  clientId: number,
  opts?: ListOpts,
): Promise<BrainNoteListItem[]>;
export async function listNotes(
  clientId: number,
  opts: ListOpts = {},
): Promise<BrainNote[] | BrainNoteListItem[]> {
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

  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;

  if (opts.includeBody) {
    return db.select().from(brainNotes)
      .where(and(...conds))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);
  }

  // Default slim projection — drops `body` (up to 50 KB/note), attachment
  // URL/key/mime/size, confidentialityLevel, reviewItemId, createdBy. The
  // knowledge sidebar (`components/brain/NoteListPane.tsx`) renders only
  // `{ id, title, tags, pinned, updatedAt, attachmentFilename }`; the rest
  // is kept because other list-page surfaces (graph view, MCP, dataview
  // blocks) still expect the relation/anchor columns and the timestamps.
  return db.select({
    id: brainNotes.id,
    clientId: brainNotes.clientId,
    title: brainNotes.title,
    meetingId: brainNotes.meetingId,
    relationshipOverlayId: brainNotes.relationshipOverlayId,
    companyId: brainNotes.companyId,
    dealId: brainNotes.dealId,
    contactId: brainNotes.contactId,
    tags: brainNotes.tags,
    pinned: brainNotes.pinned,
    source: brainNotes.source,
    sourceUrl: brainNotes.sourceUrl,
    attachmentFilename: brainNotes.attachmentFilename,
    createdAt: brainNotes.createdAt,
    updatedAt: brainNotes.updatedAt,
    deletedAt: brainNotes.deletedAt,
  })
    .from(brainNotes)
    .where(and(...conds))
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);
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

export interface TagWithCount {
  tag: string;
  count: number;
}

/**
 * Tag inventory with per-tag note counts. Drives the tag-first landing view
 * in the knowledge pane. Returns one row per distinct tag plus a synthetic
 * `__untagged__` bucket for notes that have no tags. Trashed notes are
 * excluded.
 */
export async function listTagsWithCounts(clientId: number): Promise<{
  tags: TagWithCount[];
  untagged: number;
  total: number;
}> {
  const rows = await db.execute<{ tag: string; count: number }>(sql`
    SELECT
      jsonb_array_elements_text(brain_notes.tags::jsonb) AS tag,
      count(*)::int AS count
    FROM ${brainNotes}
    WHERE brain_notes.client_id = ${clientId}
      AND brain_notes.deleted_at IS NULL
      AND jsonb_typeof(brain_notes.tags::jsonb) = 'array'
      AND jsonb_array_length(brain_notes.tags::jsonb) > 0
    GROUP BY 1
    ORDER BY count DESC, tag ASC
  `);

  const [untaggedRow] = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count FROM ${brainNotes}
    WHERE brain_notes.client_id = ${clientId}
      AND brain_notes.deleted_at IS NULL
      AND (brain_notes.tags IS NULL OR jsonb_array_length(brain_notes.tags::jsonb) = 0)
  `);

  const [totalRow] = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count FROM ${brainNotes}
    WHERE brain_notes.client_id = ${clientId} AND brain_notes.deleted_at IS NULL
  `);

  const tags: TagWithCount[] = (rows as unknown as Array<{ tag: string; count: number }>)
    .map((r) => ({ tag: r.tag, count: Number(r.count) }));

  return {
    tags,
    untagged: Number(untaggedRow?.count ?? 0),
    total: Number(totalRow?.count ?? 0),
  };
}

/**
 * Count the soft-deleted (trashed) notes for a tenant. Used by the trash
 * counter badge so we don't have to fetch the full list to render a number.
 */
export async function countTrashedNotes(clientId: number): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(brainNotes)
    .where(and(eq(brainNotes.clientId, clientId), isNotNull(brainNotes.deletedAt)));
  return row?.count ?? 0;
}

/**
 * Permanently purge every soft-deleted (trashed) note for a tenant.
 *
 * Cascade behaviour:
 *   - brain_notes rows are removed.
 *   - brain_kb_links with `from_note_id` in the set are removed via FK CASCADE.
 *   - brain_kb_links with `to_note_id` in the set (incoming backlinks) are
 *     hard-deleted explicitly so we don't leave orphan link rows pointing at
 *     a now-nonexistent note (the FK only sets them to null).
 *   - brain_custom_field_values for entityType='note' are not FK-bound (the
 *     table uses a polymorphic (entityType, entityId)), so we delete them
 *     explicitly.
 *   - brain_audit_logs entries for these notes are removed — the trash-empty
 *     action is the user's explicit "I never want to see this again" signal.
 *     A single tenant-level audit row is written for the empty-trash event.
 *   - S3 attachments for any note that had one are queued for deletion (best
 *     effort; we don't fail the operation on a stuck object).
 *
 * Tenant-scoped on every query: a `clientId` mismatch on any FK candidate
 * would be filtered out at the SELECT step. Returns the number of notes
 * actually purged (0 if trash was already empty).
 */
export async function emptyTrash(
  clientId: number,
  actorId: number | null,
): Promise<{ deleted: number }> {
  const trashed = await db.select({
    id: brainNotes.id,
    attachmentStoredKey: brainNotes.attachmentStoredKey,
  }).from(brainNotes)
    .where(and(eq(brainNotes.clientId, clientId), isNotNull(brainNotes.deletedAt)));

  if (trashed.length === 0) return { deleted: 0 };

  const ids = trashed.map((r) => r.id);
  const keysToDelete = trashed
    .map((r) => r.attachmentStoredKey)
    .filter((k): k is string => typeof k === 'string' && k.length > 0);

  // Incoming backlinks — FK is ON DELETE SET NULL, so without this they would
  // linger as orphans pointing at a vanished target.
  await db.delete(brainKbLinks)
    .where(and(eq(brainKbLinks.clientId, clientId), inArray(brainKbLinks.toNoteId, ids)));

  // Custom field values for these notes (polymorphic, no FK to brain_notes).
  await db.delete(brainCustomFieldValues)
    .where(and(
      eq(brainCustomFieldValues.entityType, 'note'),
      inArray(brainCustomFieldValues.entityId, ids),
    ));

  // Per-note audit history. Tenant-scoped so a misuse can't reach across.
  await db.delete(brainAuditLogs)
    .where(and(
      eq(brainAuditLogs.clientId, clientId),
      eq(brainAuditLogs.entityType, 'brain_note'),
      inArray(brainAuditLogs.entityId, ids),
    ));

  // The notes themselves — outgoing brain_kb_links (from_note_id) cascade.
  const res = await db.delete(brainNotes)
    .where(and(eq(brainNotes.clientId, clientId), inArray(brainNotes.id, ids)))
    .returning({ id: brainNotes.id });

  for (const key of keysToDelete) {
    deleteFromS3(key).catch((err) => {
      console.warn('[brain.notes] failed to delete S3 object', key, err);
    });
  }

  // Single tenant-level audit row — entityId omitted (the entity is gone).
  await logAudit({
    clientId,
    actorId,
    action: 'trash_emptied',
    entityType: 'brain_note',
    metadata: {
      count: res.length,
      hadAttachments: keysToDelete.length,
    },
  });

  return { deleted: res.length };
}

/**
 * Auto-purge soft-deleted (trashed) notes whose `deletedAt` is older than
 * `retentionDays`. Mirrors {@link emptyTrash} but filters by retention window
 * instead of nuking the whole trash. Tenant-scoped on every query.
 *
 * Per-note audit rows (`auto_purged`) are written so the user has a record of
 * what disappeared and why — different from `emptyTrash`, which collapses to a
 * single tenant-level `trash_emptied` row because the user explicitly asked
 * for the wipe. Auto-purge happens silently from the user's perspective, so
 * preserving per-note breadcrumbs matters.
 *
 * Returns counts so the cron can roll up totals across tenants.
 */
export async function purgeOldTrash(
  clientId: number,
  retentionDays: number = 90,
): Promise<{ purged: number; attachmentsDeleted: number }> {
  const cutoffSql = sql`now() - (${retentionDays}::int * INTERVAL '1 day')`;

  const stale = await db.select({
    id: brainNotes.id,
    deletedAt: brainNotes.deletedAt,
    attachmentStoredKey: brainNotes.attachmentStoredKey,
  }).from(brainNotes)
    .where(and(
      eq(brainNotes.clientId, clientId),
      isNotNull(brainNotes.deletedAt),
      sql`${brainNotes.deletedAt} < ${cutoffSql}`,
    ));

  if (stale.length === 0) return { purged: 0, attachmentsDeleted: 0 };

  const ids = stale.map((r) => r.id);
  const keysToDelete = stale
    .map((r) => r.attachmentStoredKey)
    .filter((k): k is string => typeof k === 'string' && k.length > 0);

  // Capture deletedAt per id for audit metadata before we drop the rows.
  const deletedAtById = new Map<number, Date | null>(
    stale.map((r) => [r.id, r.deletedAt] as const),
  );

  // Incoming backlinks — FK is ON DELETE SET NULL, so without this they would
  // linger as orphans pointing at a vanished target.
  await db.delete(brainKbLinks)
    .where(and(eq(brainKbLinks.clientId, clientId), inArray(brainKbLinks.toNoteId, ids)));

  // Custom field values for these notes (polymorphic, no FK to brain_notes).
  await db.delete(brainCustomFieldValues)
    .where(and(
      eq(brainCustomFieldValues.entityType, 'note'),
      inArray(brainCustomFieldValues.entityId, ids),
    ));

  // Per-note audit history. Tenant-scoped so a misuse can't reach across.
  await db.delete(brainAuditLogs)
    .where(and(
      eq(brainAuditLogs.clientId, clientId),
      eq(brainAuditLogs.entityType, 'brain_note'),
      inArray(brainAuditLogs.entityId, ids),
    ));

  // The notes themselves — outgoing brain_kb_links (from_note_id) cascade.
  const res = await db.delete(brainNotes)
    .where(and(eq(brainNotes.clientId, clientId), inArray(brainNotes.id, ids)))
    .returning({ id: brainNotes.id, attachmentStoredKey: brainNotes.attachmentStoredKey });

  for (const key of keysToDelete) {
    deleteFromS3(key).catch((err) => {
      console.warn('[brain.notes] failed to delete S3 object', key, err);
    });
  }

  // Per-note audit rows so the user has breadcrumbs of what was auto-removed.
  // Note: the per-note rows we just deleted above were the OLD trail for these
  // notes. These new `auto_purged` rows are written AFTER that deletion so they
  // survive as the surviving record.
  for (const r of res) {
    const originalDeletedAt = deletedAtById.get(r.id) ?? null;
    await logAudit({
      clientId,
      actorId: null,
      action: 'auto_purged',
      entityType: 'brain_note',
      entityId: r.id,
      metadata: {
        retentionDays,
        deletedAt: originalDeletedAt ? originalDeletedAt.toISOString() : null,
        hadAttachment: typeof r.attachmentStoredKey === 'string' && r.attachmentStoredKey.length > 0,
      },
    });
  }

  return { purged: res.length, attachmentsDeleted: keysToDelete.length };
}

