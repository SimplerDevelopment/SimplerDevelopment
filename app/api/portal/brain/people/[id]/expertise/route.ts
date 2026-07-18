import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { attachExpertise, detachExpertise } from '@/lib/brain/people';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const personId = parseInt(id, 10);
  if (Number.isNaN(personId)) {
    return NextResponse.json({ success: false, message: 'Invalid person id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.expertiseTagId !== 'number') {
    return NextResponse.json({ success: false, message: 'expertiseTagId is required' }, { status: 400 });
  }
  if (body.level !== undefined && body.level !== null && typeof body.level !== 'number') {
    return NextResponse.json({ success: false, message: 'level must be a number or null' }, { status: 400 });
  }

  try {
    const data = await attachExpertise(result.client.id, result.userId, personId, {
      expertiseTagId: body.expertiseTagId,
      level: typeof body.level === 'number' ? body.level : null,
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Attach failed';
    const status = /not found in this tenant/i.test(message) ? 404 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const personId = parseInt(id, 10);
  if (Number.isNaN(personId)) {
    return NextResponse.json({ success: false, message: 'Invalid person id' }, { status: 400 });
  }

  // DELETE accepts the expertiseTagId either in a JSON body or as a query param.
  const url = new URL(request.url);
  const queryTag = url.searchParams.get('expertiseTagId');
  let expertiseTagId: number | null = null;
  if (queryTag !== null) {
    const n = parseInt(queryTag, 10);
    if (Number.isNaN(n)) {
      return NextResponse.json({ success: false, message: 'Invalid expertiseTagId' }, { status: 400 });
    }
    expertiseTagId = n;
  } else {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || typeof body.expertiseTagId !== 'number') {
      return NextResponse.json({ success: false, message: 'expertiseTagId is required' }, { status: 400 });
    }
    expertiseTagId = body.expertiseTagId;
  }

  const ok = await detachExpertise(result.client.id, result.userId, personId, expertiseTagId!);
  if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: { personId, expertiseTagId, detached: true } });
}
