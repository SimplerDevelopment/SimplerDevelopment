import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { listRelationships, countRelationships, createOverlay } from '@/lib/brain/relationships';
import type { BrainRelationshipPriority, BrainRelationshipStatus } from '@/lib/db/schema';

const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const VALID_STATUS = new Set(['active', 'paused', 'archived']);

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const ownerId = url.searchParams.get('ownerId');
  const priority = url.searchParams.get('priority');
  const status = url.searchParams.get('status');
  const staleOnly = url.searchParams.get('stale') === 'true';

  // Pagination — clamp to sane bounds. Default page=1, limit=100, max 500
  // (matches lib/brain/relationships.ts clamps). Returns `{ data, total, page, limit }`
  // additively so legacy consumers reading `json.data` as the array keep working.
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 500)) : 100;
  const offset = (page - 1) * limit;

  const filters = {
    type: type ?? undefined,
    ownerId: ownerId ? parseInt(ownerId, 10) : undefined,
    priority: VALID_PRIORITIES.has(priority ?? '') ? (priority as BrainRelationshipPriority) : undefined,
    status: VALID_STATUS.has(status ?? '') ? (status as BrainRelationshipStatus) : undefined,
  };

  const [rows, total] = await Promise.all([
    listRelationships(result.client.id, { ...filters, staleOnly, limit, offset }),
    countRelationships(result.client.id, filters),
  ]);
  return NextResponse.json({ success: true, data: rows, total, page, limit });
}

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }
  const companyId = typeof body.companyId === 'number' ? body.companyId : undefined;
  const dealId = typeof body.dealId === 'number' ? body.dealId : undefined;
  if ((companyId === undefined) === (dealId === undefined)) {
    return NextResponse.json({ success: false, message: 'Provide exactly one of companyId or dealId.' }, { status: 400 });
  }

  try {
    const created = await createOverlay({
      clientId: result.client.id,
      actorId: result.userId,
      companyId,
      dealId,
      relationshipType: typeof body.relationshipType === 'string' ? body.relationshipType : undefined,
      status: VALID_STATUS.has(body.status) ? body.status : undefined,
      ownerId: typeof body.ownerId === 'number' ? body.ownerId : null,
      priority: VALID_PRIORITIES.has(body.priority) ? body.priority : undefined,
      serviceLines: Array.isArray(body.serviceLines) ? body.serviceLines.filter((v: unknown) => typeof v === 'string') : undefined,
      summary: typeof body.summary === 'string' ? body.summary : undefined,
      currentPriorities: typeof body.currentPriorities === 'string' ? body.currentPriorities : undefined,
      openLoops: typeof body.openLoops === 'string' ? body.openLoops : undefined,
      lastTouchAt: body.lastTouchAt ? new Date(body.lastTouchAt) : undefined,
      nextReviewAt: body.nextReviewAt ? new Date(body.nextReviewAt) : undefined,
      confidentialityLevel: typeof body.confidentialityLevel === 'string' ? body.confidentialityLevel : undefined,
      staleAfterDays: typeof body.staleAfterDays === 'number' ? body.staleAfterDays : undefined,
    });
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to create relationship.',
    }, { status: 400 });
  }
}
