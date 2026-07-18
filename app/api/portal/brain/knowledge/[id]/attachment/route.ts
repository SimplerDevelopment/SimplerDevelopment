import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { clearAttachment } from '@/lib/brain/notes';

/**
 * DELETE /api/portal/brain/knowledge/[id]/attachment
 * Removes the file from S3 (best-effort) and clears the attachment columns
 * on the note. Note row stays — only the file is detached.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const noteId = parseInt(id, 10);
  if (Number.isNaN(noteId)) {
    return NextResponse.json({ success: false, message: 'Invalid note id' }, { status: 400 });
  }

  const ok = await clearAttachment(result.client.id, noteId, result.userId);
  if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
