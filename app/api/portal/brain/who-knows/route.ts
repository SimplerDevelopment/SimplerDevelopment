import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { whoKnows } from '@/lib/brain/people';

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const query = url.searchParams.get('query');
  const limitRaw = url.searchParams.get('limit');

  if (!query || !query.trim()) {
    return NextResponse.json({ success: false, message: 'query is required' }, { status: 400 });
  }

  const limit = limitRaw !== null ? parseInt(limitRaw, 10) : undefined;
  const data = await whoKnows(result.client.id, query, {
    limit: typeof limit === 'number' && !Number.isNaN(limit) ? limit : undefined,
  });
  return NextResponse.json({ success: true, data });
}
