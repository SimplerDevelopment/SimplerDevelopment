import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { storeProductReviews } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

// GET /api/portal/websites/[siteId]/store/reviews — list product reviews for the
// site, optionally filtered by ?status=pending|approved|rejected and ?productId=.
// Portal-REST mirror of the store_reviews_list MCP tool.
export async function GET(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'store' });
  if (isAuthError(authResult)) return authResult.response;

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const productId = url.searchParams.get('productId');

  const conds = [eq(storeProductReviews.websiteId, site.id)];
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    conds.push(eq(storeProductReviews.status, status));
  }
  if (productId && !Number.isNaN(parseInt(productId, 10))) {
    conds.push(eq(storeProductReviews.productId, parseInt(productId, 10)));
  }

  const rows = await db
    .select()
    .from(storeProductReviews)
    .where(and(...conds))
    .orderBy(desc(storeProductReviews.createdAt))
    .limit(200);

  return NextResponse.json({ success: true, data: rows });
}
