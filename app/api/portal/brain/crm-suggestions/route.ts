import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { suggestCrmTargets } from '@/lib/brain/relationships';

export async function GET(request: Request) {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const out = await suggestCrmTargets(result.client.id, q.slice(0, 100), 20);
  return NextResponse.json({ success: true, data: out });
}
