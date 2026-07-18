/**
 * GET /api/portal/brain/documents/[id]/acknowledgments
 *
 * Query: ?versionId=&personId=&limit=&offset=
 *
 * Slim list of acks for this document, optionally filtered by version or
 * person. Useful for the document detail page's "who's read this" sidebar.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { listAcknowledgmentsForDocument } from '@/lib/brain/document-acks';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function parseQueryInt(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const items = await listAcknowledgmentsForDocument(result.client.id, documentId, {
    versionId: parseQueryInt(url.searchParams.get('versionId')),
    personId: parseQueryInt(url.searchParams.get('personId')),
    limit: parseQueryInt(url.searchParams.get('limit')),
    offset: (() => {
      const n = parseInt(url.searchParams.get('offset') ?? '0', 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    })(),
  });
  return NextResponse.json({ success: true, data: { items } });
}
