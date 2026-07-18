import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { carts, clientWebsites } from '@/lib/db/schema';
import { and, eq, gt } from 'drizzle-orm';

/**
 * GET /api/storefront/[siteId]/cart/recover?token=<recoveryToken>
 *
 * Validates the recovery token, reactivates the cart, and redirects the
 * visitor to the store cart page with `?recovered=1` so the storefront can
 * show a "Your cart has been restored" banner.
 *
 * Token rules:
 *  - Cart must be `status = 'abandoned'`.
 *  - `recoveryTokenExpiresAt` must be in the future.
 *  - The cart's `websiteId` must match the `[siteId]` route param (tenancy).
 *  - Token is single-use: cleared on redemption (status back to 'active').
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token || token.length === 0) {
      return NextResponse.json({ success: false, message: 'token is required' }, { status: 400 });
    }

    const now = new Date();

    // Lookup the cart by token — tenancy asserted via websiteId.
    const [cart] = await db
      .select({
        id: carts.id,
        websiteId: carts.websiteId,
        recoveryToken: carts.recoveryToken,
        recoveryTokenExpiresAt: carts.recoveryTokenExpiresAt,
        status: carts.status,
      })
      .from(carts)
      .where(
        and(
          eq(carts.websiteId, websiteId),
          eq(carts.recoveryToken, token),
          eq(carts.status, 'abandoned'),
          gt(carts.recoveryTokenExpiresAt, now),
        ),
      )
      .limit(1);

    if (!cart) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired recovery token' },
        { status: 404 },
      );
    }

    // Reactivate the cart and consume the token (single-use).
    await db
      .update(carts)
      .set({
        status: 'active',
        recoveryToken: null,
        recoveryTokenExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(carts.id, cart.id));

    // Resolve the store base URL from the website's domain / subdomain.
    const [website] = await db
      .select({ domain: clientWebsites.domain, subdomain: clientWebsites.subdomain })
      .from(clientWebsites)
      .where(eq(clientWebsites.id, websiteId))
      .limit(1);

    const baseUrl = website?.domain
      ? `https://${website.domain}`
      : website?.subdomain
        ? `https://${website.subdomain}.simplerdevelopment.com`
        : (process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com');

    const redirectUrl = `${baseUrl}/store/cart?recovered=1`;

    return NextResponse.redirect(redirectUrl, 302);
  } catch (err) {
    console.error('[cart/recover] error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
