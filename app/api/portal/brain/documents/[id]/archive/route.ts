/**
 * POST /api/portal/brain/documents/[id]/archive
 * Body: { reason?: string }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { archiveDocument } from '@/lib/brain/documents';

const schema = z.object({
  reason: z.string().max(5000).optional(),
});

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  // Body is optional — empty / null is allowed.
  const parsed = schema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const archived = await archiveDocument(result.client.id, result.userId, documentId, {
      reason: parsed.data.reason,
    });
    if (!archived) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: archived });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Archive failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
