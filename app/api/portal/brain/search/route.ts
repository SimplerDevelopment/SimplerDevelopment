import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { searchBrain, type BrainSearchEntityType } from '@/lib/brain/search';

export async function GET(request: Request) {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';
  const typesParam = url.searchParams.get('types');
  const limitParam = url.searchParams.get('limit');

  const allowed = new Set<BrainSearchEntityType>(['meeting', 'note', 'task', 'relationship']);
  const types = typesParam
    ? typesParam.split(',').map((s) => s.trim()).filter((s): s is BrainSearchEntityType => allowed.has(s as BrainSearchEntityType))
    : undefined;
  const limit = limitParam ? Math.max(1, Math.min(parseInt(limitParam, 10) || 25, 100)) : undefined;

  const out = await searchBrain(result.client.id, query, { types, limit });
  return NextResponse.json({ success: true, data: out });
}
