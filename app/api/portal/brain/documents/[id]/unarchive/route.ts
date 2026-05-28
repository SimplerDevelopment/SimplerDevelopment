/**
 * POST /api/portal/brain/documents/[id]/unarchive
 *
 * Restores status to 'published' if a published version exists, otherwise
 * 'draft'. Clears archivedAt + archiveReason.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { unarchiveDocument } from '@/lib/brain/documents';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  try {
    const restored = await unarchiveDocument(result.client.id, result.userId, documentId);
    if (!restored) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: restored });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unarchive failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
