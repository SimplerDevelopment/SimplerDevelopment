/**
 * GET /api/portal/brain/documents/[id]/versions/[versionId]
 *
 * Returns one version with the full body. Tenant-scoped.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brainDocumentVersions, brainDocuments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id, versionId } = await params;
  const documentId = parseId(id);
  const verId = parseId(versionId);
  if (documentId === null || verId === null) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  // Confirm the document is owned by this tenant. We don't fully trust the
  // version row's clientId — verify against the document row too.
  const [doc] = await db
    .select({ id: brainDocuments.id })
    .from(brainDocuments)
    .where(and(eq(brainDocuments.id, documentId), eq(brainDocuments.clientId, result.client.id)))
    .limit(1);
  if (!doc) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [version] = await db
    .select()
    .from(brainDocumentVersions)
    .where(and(
      eq(brainDocumentVersions.id, verId),
      eq(brainDocumentVersions.documentId, documentId),
      eq(brainDocumentVersions.clientId, result.client.id),
    ))
    .limit(1);
  if (!version) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: version });
}
