/**
 * GET    /api/portal/brain/initiatives/[id]/links       — list (?entityType, ?limit, ?offset)
 * POST   /api/portal/brain/initiatives/[id]/links       — attach { entityType, entityId, note?, pinned? }
 * DELETE /api/portal/brain/initiatives/[id]/links       — detach { entityType, entityId }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  listInitiativeLinks,
  linkEntity,
  unlinkEntity,
  isLinkableEntityType,
  type BrainInitiativeLinkType,
} from '@/lib/brain/initiatives';

const LINKABLE: BrainInitiativeLinkType[] = [
  'task', 'note', 'meeting', 'decision', 'topic', 'crm_deal', 'crm_company',
];

function parseInitiativeId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const initiativeId = parseInitiativeId(id);
  if (initiativeId === null) {
    return NextResponse.json({ success: false, message: 'Invalid initiative id' }, { status: 400 });
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

  const items = await listInitiativeLinks(result.client.id, initiativeId, {
    entityType: isLinkableEntityType(entityTypeRaw ?? '') ? (entityTypeRaw as BrainInitiativeLinkType) : undefined,
    limit,
    offset,
  });
  return NextResponse.json({ success: true, data: { items, limit, offset } });
}

const linkSchema = z.object({
  entityType: z.enum(['task', 'note', 'meeting', 'decision', 'topic', 'crm_deal', 'crm_company']),
  entityId: z.number().int().positive(),
  note: z.string().max(5000).optional().nullable(),
  pinned: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const initiativeId = parseInitiativeId(id);
  if (initiativeId === null) {
    return NextResponse.json({ success: false, message: 'Invalid initiative id' }, { status: 400 });
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
      initiativeId,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      note: parsed.data.note ?? null,
      pinned: parsed.data.pinned,
    });
    return NextResponse.json({ success: true, data: linked });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Link failed';
    // initiative not found from this tenant — match the 404 shape used elsewhere
    if (message === 'initiative not found') {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

const unlinkSchema = z.object({
  entityType: z.enum(['task', 'note', 'meeting', 'decision', 'topic', 'crm_deal', 'crm_company']),
  entityId: z.number().int().positive(),
});

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const initiativeId = parseInitiativeId(id);
  if (initiativeId === null) {
    return NextResponse.json({ success: false, message: 'Invalid initiative id' }, { status: 400 });
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
    initiativeId,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
  });
  if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: { removed: true } });
}
