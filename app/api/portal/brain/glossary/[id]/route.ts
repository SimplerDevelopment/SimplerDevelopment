import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  getGlossaryTermById,
  updateGlossaryTerm,
  deleteGlossaryTerm,
} from '@/lib/brain/glossary';
import type { BrainGlossaryStatus } from '@/lib/db/schema';

const VALID_STATUS = new Set<BrainGlossaryStatus>(['active', 'deprecated']);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const termId = parseInt(id, 10);
  if (Number.isNaN(termId)) {
    return NextResponse.json({ success: false, message: 'Invalid term id' }, { status: 400 });
  }
  const data = await getGlossaryTermById(result.client.id, termId);
  if (!data) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const termId = parseInt(id, 10);
  if (Number.isNaN(termId)) {
    return NextResponse.json({ success: false, message: 'Invalid term id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }
  if (body.status !== undefined && !VALID_STATUS.has(body.status)) {
    return NextResponse.json(
      { success: false, message: `Invalid status. Allowed: ${[...VALID_STATUS].join(', ')}` },
      { status: 400 },
    );
  }

  const updated = await updateGlossaryTerm(result.client.id, result.userId, termId, {
    term: typeof body.term === 'string' ? body.term : undefined,
    definition: typeof body.definition === 'string' ? body.definition : undefined,
    shortDefinition: body.shortDefinition === null
      ? null
      : (typeof body.shortDefinition === 'string' ? body.shortDefinition : undefined),
    aliases: Array.isArray(body.aliases) ? body.aliases.filter((a: unknown) => typeof a === 'string') : undefined,
    status: body.status,
    category: body.category === null
      ? null
      : (typeof body.category === 'string' ? body.category : undefined),
    ownerId: body.ownerId === null
      ? null
      : (typeof body.ownerId === 'number' ? body.ownerId : undefined),
    relatedTermIds: Array.isArray(body.relatedTermIds)
      ? body.relatedTermIds.filter((n: unknown) => typeof n === 'number')
      : undefined,
  });

  if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const termId = parseInt(id, 10);
  if (Number.isNaN(termId)) {
    return NextResponse.json({ success: false, message: 'Invalid term id' }, { status: 400 });
  }

  try {
    const out = await deleteGlossaryTerm(result.client.id, result.userId, termId);
    if (!out.deleted) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({
      success: true,
      data: {
        id: termId,
        deleted: true,
        prunedRelatedTermFromCount: out.prunedRelatedTermFromCount,
      },
    });
  } catch (err) {
    console.error('[brain.glossary] delete failed', { termId, clientId: result.client.id, err });
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
