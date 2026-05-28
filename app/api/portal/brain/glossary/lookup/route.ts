import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { lookupGlossary } from '@/lib/brain/glossary';

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.query !== 'string') {
    return NextResponse.json({ success: false, message: 'query (string) is required' }, { status: 400 });
  }

  const limit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : undefined;

  const data = await lookupGlossary(result.client.id, body.query, { limit });
  return NextResponse.json({ success: true, data });
}
