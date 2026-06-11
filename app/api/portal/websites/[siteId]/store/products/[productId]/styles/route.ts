import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products, productStyles } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

type Params = { params: Promise<{ siteId: string; productId: string }> };

async function resolveProduct(userId: number, siteId: string, productId: string) {
  const site = await resolveClientSite(userId, parseInt(siteId, 10));
  if (!site) return { site: null, product: null };
  const pid = parseInt(productId, 10);
  if (Number.isNaN(pid)) return { site, product: null };
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, pid), eq(products.websiteId, site.id)))
    .limit(1);
  return { site, product: product || null };
}

// GET /api/portal/websites/[siteId]/store/products/[productId]/styles
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { siteId, productId } = await params;
  const { product } = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const styles = await db
    .select()
    .from(productStyles)
    .where(eq(productStyles.productId, product.id))
    .orderBy(asc(productStyles.order), asc(productStyles.id));

  return NextResponse.json({ success: true, data: styles });
}

// POST /api/portal/websites/[siteId]/store/products/[productId]/styles
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { siteId, productId } = await params;
  const { product } = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? '').toString().trim();
  if (!name) {
    return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  }

  const colorHex = body.colorHex ? String(body.colorHex) : null;
  const thumbnailUrl = body.thumbnailUrl ? String(body.thumbnailUrl) : null;
  const priceCents =
    body.priceCents != null && body.priceCents !== '' ? parseInt(String(body.priceCents), 10) : null;
  if (priceCents != null && (Number.isNaN(priceCents) || priceCents < 0)) {
    return NextResponse.json({ success: false, message: 'priceCents must be >= 0' }, { status: 400 });
  }
  const order =
    body.order != null && body.order !== '' ? parseInt(String(body.order), 10) || 0 : 0;
  const active = body.active === undefined ? true : Boolean(body.active);

  const [created] = await db
    .insert(productStyles)
    .values({
      productId: product.id,
      name,
      colorHex,
      thumbnailUrl,
      priceCents,
      order,
      active,
    })
    .returning();

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
