import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { db } from '@/lib/db';
import { brainAuditLogs } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getNote } from '@/lib/brain/notes';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const noteId = parseInt(id, 10);
  if (Number.isNaN(noteId)) {
    return NextResponse.json({ success: false, message: 'Invalid note id' }, { status: 400 });
  }

  // Tenant ownership check — keeps history 404 consistent with the rest of the
  // /knowledge/[id]/* surface (backlinks, fields, restore). Without it a caller
  // gets an empty 200 for a foreign id, which masks the leak attempt.
  const note = await getNote(result.client.id, noteId);
  if (!note) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const rows = await db.select().from(brainAuditLogs)
    .where(and(
      eq(brainAuditLogs.clientId, result.client.id),
      eq(brainAuditLogs.entityType, 'brain_note'),
      eq(brainAuditLogs.entityId, noteId),
    ))
    .orderBy(desc(brainAuditLogs.createdAt))
    .limit(200);

  return NextResponse.json({ success: true, data: { items: rows } });
}
