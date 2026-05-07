import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { db } from '@/lib/db';
import { brainNotes, brainKbLinks } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';

/**
 * Backlinks for a note: every distinct note whose body contains a link
 * targeting this note (`brain_kb_links.to_note_id = :id`). Tenant-scoped via
 * `client_id` on both the link row and the source note.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const noteId = parseInt(id, 10);
  if (Number.isNaN(noteId)) {
    return NextResponse.json({ success: false, message: 'Invalid note id' }, { status: 400 });
  }

  // Confirm the note belongs to this client (avoid leaking link rows for an
  // id that the caller can't see).
  const [target] = await db
    .select({ id: brainNotes.id })
    .from(brainNotes)
    .where(and(eq(brainNotes.id, noteId), eq(brainNotes.clientId, result.client.id)))
    .limit(1);
  if (!target) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const rows = await db
    .select({
      id: brainNotes.id,
      title: brainNotes.title,
      body: brainNotes.body,
      updatedAt: brainNotes.updatedAt,
      linkId: brainKbLinks.id,
      displayText: brainKbLinks.displayText,
      rawTarget: brainKbLinks.rawTarget,
    })
    .from(brainKbLinks)
    .innerJoin(brainNotes, eq(brainNotes.id, brainKbLinks.fromNoteId))
    .where(and(
      eq(brainKbLinks.toNoteId, noteId),
      eq(brainKbLinks.clientId, result.client.id),
      eq(brainNotes.clientId, result.client.id),
    ))
    .orderBy(desc(brainNotes.updatedAt));

  // Collapse multiple links from the same source note into one entry; pick
  // the first non-empty displayText / rawTarget so we can build a snippet.
  const seen = new Map<number, {
    id: number;
    title: string;
    snippet: string;
    displayText: string | null;
    updatedAt: Date;
  }>();
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    const anchor = r.displayText || r.rawTarget || '';
    const snippet = buildSnippet(r.body ?? '', anchor);
    seen.set(r.id, {
      id: r.id,
      title: r.title,
      snippet,
      displayText: r.displayText ?? null,
      updatedAt: r.updatedAt,
    });
  }

  return NextResponse.json({
    success: true,
    data: { items: Array.from(seen.values()) },
  });
}

/**
 * Build a 2-line preview of `body` that prefers a window centered on
 * `anchor` (the link's display text). Falls back to the start of the body
 * when no anchor match is found.
 */
function buildSnippet(body: string, anchor: string): string {
  const max = 220;
  const trimmed = body.trim();
  if (!trimmed) return '';
  if (anchor) {
    const idx = trimmed.toLowerCase().indexOf(anchor.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(trimmed.length, idx + anchor.length + 160);
      const slice = trimmed.slice(start, end);
      return (start > 0 ? '…' : '') + slice + (end < trimmed.length ? '…' : '');
    }
  }
  return trimmed.length > max ? trimmed.slice(0, max) + '…' : trimmed;
}
