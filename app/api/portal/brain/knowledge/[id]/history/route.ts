import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { db } from '@/lib/db';
import { brainAuditLogs } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const noteId = parseInt(id, 10);
  if (Number.isNaN(noteId)) {
    return NextResponse.json({ success: false, message: 'Invalid note id' }, { status: 400 });
  }

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
