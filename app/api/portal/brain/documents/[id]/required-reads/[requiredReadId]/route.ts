/**
 * DELETE /api/portal/brain/documents/[id]/required-reads/[requiredReadId]
 *
 * Refuses (409 Conflict) when any acknowledgments still reference this row
 * unless ?force=true. On force, the FK's onDelete:'set null' preserves the
 * acks while unlinking them.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { removeRequiredRead } from '@/lib/brain/document-acks';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; requiredReadId: string }> },
) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id, requiredReadId } = await params;
  const documentId = parseId(id);
  const rrId = parseId(requiredReadId);
  if (documentId === null || rrId === null) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  const out = await removeRequiredRead(result.client.id, result.userId, rrId, { force });
  if (!out.removed) {
    if (out.reason === 'not_found') {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    if (out.reason === 'has_acks') {
      return NextResponse.json(
        { success: false, message: 'Cannot remove a required-read with existing acknowledgments. Pass ?force=true to override.', code: 'HAS_ACKS' },
        { status: 409 },
      );
    }
  }
  return NextResponse.json({ success: true, data: { removed: true } });
}
