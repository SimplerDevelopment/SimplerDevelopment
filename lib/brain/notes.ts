import { db } from '@/lib/db';
import { brainNotes } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { logAudit } from './audit';
import { deleteFromS3 } from '@/lib/s3/delete';

export type BrainNote = typeof brainNotes.$inferSelect;

interface ListOpts {
  relationshipOverlayId?: number;
  companyId?: number;
  dealId?: number;
  contactId?: number;
  meetingId?: number;
  pinnedOnly?: boolean;
  search?: string;
  tag?: string;
  /** Exact source URL match — used by MCP crawlers to dedupe before re-saving. */
  sourceUrl?: string;
  /** Prefix match on source URL — find all notes ingested from a given site. */
  sourceUrlStartsWith?: string;
  limit?: number;
  /** Pagination offset; pairs with `limit`. Default 0. */
  offset?: number;
}

/** Build the WHERE conditions shared by listNotes and countNotes. */
function buildNoteFilters(clientId: number, opts: ListOpts) {
  const conds = [eq(brainNotes.clientId, clientId)];
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
  if (opts.sourceUrl) conds.push(eq(brainNotes.sourceUrl, opts.sourceUrl));
  if (opts.sourceUrlStartsWith) {
    const prefix = `${opts.sourceUrlStartsWith}%`;
    conds.push(sql`${brainNotes.sourceUrl} ILIKE ${prefix}`);
  }
  return conds;
}

export async function listNotes(clientId: number, opts: ListOpts = {}): Promise<BrainNote[]> {
  const conds = buildNoteFilters(clientId, opts);
  return db.select().from(brainNotes)
    .where(and(...conds))
    .orderBy(desc(brainNotes.pinned), desc(brainNotes.updatedAt))
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
  const [created] = await db.insert(brainNotes).values({
    clientId: input.clientId,
    title: input.title.trim().slice(0, 255),
    body: (input.body ?? '').slice(0, 50_000),
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

export async function deleteNote(clientId: number, noteId: number, actorId: number | null): Promise<boolean> {
  const before = await getNote(clientId, noteId);
  if (!before) return false;
  await db.delete(brainNotes).where(and(eq(brainNotes.id, noteId), eq(brainNotes.clientId, clientId)));

  // Best-effort S3 cleanup. Don't fail the API call if the object is already
  // gone or the bucket is briefly unreachable — the row is gone and that's
  // what the user expects.
  if (before.attachmentStoredKey) {
    deleteFromS3(before.attachmentStoredKey).catch((err) => {
      console.warn('[brain.notes] failed to delete S3 object', before.attachmentStoredKey, err);
    });
  }

  await logAudit({
    clientId,
    actorId,
    action: 'note.deleted',
    entityType: 'brain_note',
    entityId: noteId,
    metadata: before.attachmentStoredKey ? { hadAttachment: true, key: before.attachmentStoredKey } : undefined,
  });
  return true;
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
    .where(eq(brainNotes.clientId, clientId));
  const set = new Set<string>();
  for (const r of rows) {
    for (const t of r.tags ?? []) set.add(t);
  }
  return Array.from(set).sort();
}
