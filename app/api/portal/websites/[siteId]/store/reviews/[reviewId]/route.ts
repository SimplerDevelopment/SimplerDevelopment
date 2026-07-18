import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { storeProductReviews } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

// PATCH /api/portal/websites/[siteId]/store/reviews/[reviewId] — approve/reject a
// review. Portal-REST mirror of the store_reviews_moderate MCP tool. The review
// must belong to the caller's resolved site (else 404 — no cross-site moderation).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ siteId: string; reviewId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'store' });
  if (isAuthError(authResult)) return authResult.response;

  const { siteId, reviewId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const id = parseInt(reviewId, 10);
  if (Number.isNaN(id))
    return NextResponse.json({ success: false, message: 'Invalid review id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (status !== 'approved' && status !== 'rejected') {
    return NextResponse.json(
      { success: false, message: "status must be 'approved' or 'rejected'" },
      { status: 400 },
    );
  }

  // Scope the update by both id AND the caller's site → a review on another
  // tenant's site is invisible (returns no row → 404).
  const [row] = await db
    .update(storeProductReviews)
    .set({ status })
    .where(and(eq(storeProductReviews.id, id), eq(storeProductReviews.websiteId, site.id)))
    .returning();

  if (!row) return NextResponse.json({ success: false, message: 'Review not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: row });
}
