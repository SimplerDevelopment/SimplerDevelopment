import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getNote, restoreNote } from '@/lib/brain/notes';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const noteId = parseInt(id, 10);
  if (Number.isNaN(noteId)) {
    return NextResponse.json({ success: false, message: 'Invalid note id' }, { status: 400 });
  }

  const restored = await restoreNote(result.client.id, noteId, result.userId);
  if (!restored) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const note = await getNote(result.client.id, noteId);
  return NextResponse.json({ success: true, data: note ?? restored });
}
