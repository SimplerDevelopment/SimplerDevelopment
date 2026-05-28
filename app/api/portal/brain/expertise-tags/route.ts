import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { listExpertiseTags, createExpertiseTag } from '@/lib/brain/people';

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const search = url.searchParams.get('search');
  const source = url.searchParams.get('source');
  const limitRaw = url.searchParams.get('limit');
  const offsetRaw = url.searchParams.get('offset');

  const items = await listExpertiseTags(result.client.id, {
    search: search ?? undefined,
    source: source ?? undefined,
    limit: limitRaw !== null ? parseInt(limitRaw, 10) : undefined,
    offset: offsetRaw !== null ? parseInt(offsetRaw, 10) : undefined,
  });

  return NextResponse.json({ success: true, data: { items } });
}

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  }

  try {
    const tag = await createExpertiseTag(result.client.id, result.userId, {
      name: body.name,
      description: typeof body.description === 'string' ? body.description : undefined,
      source: typeof body.source === 'string' ? body.source : undefined,
    });
    return NextResponse.json({ success: true, data: tag });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create expertise tag';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
