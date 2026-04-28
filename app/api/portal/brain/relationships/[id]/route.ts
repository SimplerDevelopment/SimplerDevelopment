import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getRelationship, updateOverlay, deleteOverlay } from '@/lib/brain/relationships';
import type { BrainRelationshipPriority, BrainRelationshipStatus } from '@/lib/db/schema';

const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const VALID_STATUS = new Set(['active', 'paused', 'archived']);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const overlayId = parseInt(id, 10);
  if (Number.isNaN(overlayId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }
  const detail = await getRelationship(result.client.id, overlayId);
  if (!detail) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: detail });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const overlayId = parseInt(id, 10);
  if (Number.isNaN(overlayId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  try {
    const updated = await updateOverlay(result.client.id, overlayId, result.userId, {
      relationshipType: typeof body.relationshipType === 'string' ? body.relationshipType : undefined,
      status: VALID_STATUS.has(body.status) ? body.status as BrainRelationshipStatus : undefined,
      ownerId: typeof body.ownerId === 'number' ? body.ownerId : (body.ownerId === null ? null : undefined),
      secondaryOwnerId: typeof body.secondaryOwnerId === 'number' ? body.secondaryOwnerId : (body.secondaryOwnerId === null ? null : undefined),
      priority: VALID_PRIORITIES.has(body.priority) ? body.priority as BrainRelationshipPriority : undefined,
      serviceLines: Array.isArray(body.serviceLines) ? body.serviceLines.filter((v: unknown) => typeof v === 'string') : undefined,
      summary: typeof body.summary === 'string' ? body.summary : (body.summary === null ? null : undefined),
      currentPriorities: typeof body.currentPriorities === 'string' ? body.currentPriorities : (body.currentPriorities === null ? null : undefined),
      openLoops: typeof body.openLoops === 'string' ? body.openLoops : (body.openLoops === null ? null : undefined),
      lastTouchAt: body.lastTouchAt ? new Date(body.lastTouchAt) : (body.lastTouchAt === null ? null : undefined),
      nextReviewAt: body.nextReviewAt ? new Date(body.nextReviewAt) : (body.nextReviewAt === null ? null : undefined),
      confidentialityLevel: typeof body.confidentialityLevel === 'string' ? body.confidentialityLevel : undefined,
      complianceFlags: Array.isArray(body.complianceFlags) ? body.complianceFlags.filter((v: unknown) => typeof v === 'string') : undefined,
      staleAfterDays: typeof body.staleAfterDays === 'number' ? body.staleAfterDays : (body.staleAfterDays === null ? null : undefined),
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to update.',
    }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'admin' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const overlayId = parseInt(id, 10);
  if (Number.isNaN(overlayId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }
  const ok = await deleteOverlay(result.client.id, overlayId, result.userId);
  if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
