/**
 * GET  /api/portal/brain/documents/[id]/versions  — list all versions (slim shape)
 * POST /api/portal/brain/documents/[id]/versions  — edit (or create) the current draft
 *
 * POST body: { body?, summary?, changeNotes? }. Calls editDraftVersion — if no
 * draft exists, one is created with versionNumber = max + 1 seeded from the
 * latest version's body so editors keep context.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  getDocumentById,
  editDraftVersion,
} from '@/lib/brain/documents';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  const data = await getDocumentById(result.client.id, documentId);
  if (!data) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: { items: data.versions } });
}

const editSchema = z.object({
  body: z.string().max(1_000_000).optional(),
  summary: z.string().max(50_000).optional().nullable(),
  changeNotes: z.string().max(50_000).optional().nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = editSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const edited = await editDraftVersion(result.client.id, result.userId, documentId, {
      body: parsed.data.body,
      summary: parsed.data.summary,
      changeNotes: parsed.data.changeNotes,
    });
    if (!edited) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: edited });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Edit failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
