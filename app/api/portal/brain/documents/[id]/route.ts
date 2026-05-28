/**
 * GET    /api/portal/brain/documents/[id]  — single (+?includeBody + ?includeAllVersions)
 * PATCH  /api/portal/brain/documents/[id]  — update (status changes refused)
 * DELETE /api/portal/brain/documents/[id]  — hard delete (?force=true to bypass ack guard)
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  getDocumentById,
  updateDocument,
  deleteDocument,
} from '@/lib/brain/documents';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
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
  const includeBody = url.searchParams.get('includeBody') === 'true';
  const includeAllVersions = url.searchParams.get('includeAllVersions') === 'true';

  const data = await getDocumentById(result.client.id, documentId, { includeBody, includeAllVersions });
  if (!data) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  category: z.enum(['sop', 'policy', 'guide', 'reference', 'announcement', 'other']).optional(),
  ownerId: z.number().int().positive().optional().nullable(),
  confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
  defaultTopicIds: z.array(z.number().int().positive()).optional(),
  // status not in schema — captured below as a pre-check.
}).strict().passthrough();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }
  // Explicit status guard — the lib will throw, but emit a clean 400 here.
  if ('status' in json) {
    return NextResponse.json(
      { success: false, message: 'status changes go through /publish, /archive, or /unarchive' },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const updated = await updateDocument(result.client.id, result.userId, documentId, {
      title: parsed.data.title,
      category: parsed.data.category,
      ownerId: parsed.data.ownerId,
      confidentialityLevel: parsed.data.confidentialityLevel,
      defaultTopicIds: parsed.data.defaultTopicIds,
    });
    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  try {
    const res = await deleteDocument(result.client.id, result.userId, documentId, { force });
    if (!res.deleted && !res.refused) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    if (res.refused) {
      return NextResponse.json(
        {
          success: false,
          message: `Refusing to delete: ${res.ackCount} acknowledgments exist. Pass ?force=true to cascade.`,
          code: 'DOCUMENT_HAS_ACKS',
          ackCount: res.ackCount,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({
      success: true,
      data: { id: documentId, deleted: true, ackCount: res.ackCount },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
