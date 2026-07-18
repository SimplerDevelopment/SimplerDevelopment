import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { mergeExpertiseTags } from '@/lib/brain/people';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const sourceId = parseInt(id, 10);
  if (Number.isNaN(sourceId)) {
    return NextResponse.json({ success: false, message: 'Invalid source tag id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.targetTagId !== 'number') {
    return NextResponse.json({ success: false, message: 'targetTagId is required' }, { status: 400 });
  }

  try {
    const data = await mergeExpertiseTags(result.client.id, result.userId, sourceId, body.targetTagId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Merge failed';
    const status = /not found in this tenant/i.test(message) ? 404 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
