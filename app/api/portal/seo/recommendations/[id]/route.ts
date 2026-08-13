// Recommendation status transitions — the tenant works the list (done) or
// prunes it (dismissed). Ownership proven by clientId on the row.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { seoRecommendations } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

type Params = { params: Promise<{ id: string }> };

const STATUSES = new Set(['open', 'done', 'dismissed']);

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'seo' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const id = parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const status = typeof body?.status === 'string' ? body.status : '';
  if (!STATUSES.has(status)) {
    return NextResponse.json({ success: false, message: 'status must be open | done | dismissed' }, { status: 400 });
  }

  const [updated] = await db
    .update(seoRecommendations)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(seoRecommendations.id, id), eq(seoRecommendations.clientId, client.id)))
    .returning();
  if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}
