/**
 * GET    /api/portal/brain/documents/[id]/links  — list (?entityType, ?limit, ?offset)
 * POST   /api/portal/brain/documents/[id]/links  — attach { entityType, entityId, note? }
 * DELETE /api/portal/brain/documents/[id]/links  — detach { entityType, entityId }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  listDocumentLinks,
  linkEntity,
  unlinkEntity,
  isLinkableEntityType,
  type BrainDocumentLinkEntityType,
} from '@/lib/brain/documents';

const LINKABLE: BrainDocumentLinkEntityType[] = [
  'topic', 'initiative', 'decision', 'meeting', 'glossary_term', 'person',
];

function parseDocumentId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseDocumentId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const entityTypeRaw = url.searchParams.get('entityType');
  if (entityTypeRaw !== null && !isLinkableEntityType(entityTypeRaw)) {
    return NextResponse.json(
      { success: false, message: `Invalid entityType. Allowed: ${LINKABLE.join(', ')}` },
      { status: 400 },
    );
  }
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 100;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const items = await listDocumentLinks(result.client.id, documentId, {
    entityType: isLinkableEntityType(entityTypeRaw ?? '') ? (entityTypeRaw as BrainDocumentLinkEntityType) : undefined,
    limit,
    offset,
  });
  return NextResponse.json({ success: true, data: { items, limit, offset } });
}

const linkSchema = z.object({
  entityType: z.enum(['topic', 'initiative', 'decision', 'meeting', 'glossary_term', 'person']),
  entityId: z.number().int().positive(),
  note: z.string().max(5000).optional().nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseDocumentId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = linkSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const linked = await linkEntity(result.client.id, result.userId, {
      documentId,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      note: parsed.data.note ?? null,
    });
    return NextResponse.json({ success: true, data: linked });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Link failed';
    if (message === 'document not found') {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

const unlinkSchema = z.object({
  entityType: z.enum(['topic', 'initiative', 'decision', 'meeting', 'glossary_term', 'person']),
  entityId: z.number().int().positive(),
});

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseDocumentId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = unlinkSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const ok = await unlinkEntity(result.client.id, result.userId, {
    documentId,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
  });
  if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: { removed: true } });
}
