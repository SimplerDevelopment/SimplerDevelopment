import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products, productStyles } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

type Params = {
  params: Promise<{ siteId: string; productId: string; styleId: string }>;
};

async function resolveStyle(
  userId: number,
  siteId: string,
  productId: string,
  styleId: string,
) {
  const site = await resolveClientSite(userId, parseInt(siteId, 10));
  if (!site) return { site: null, product: null, style: null };
  const pid = parseInt(productId, 10);
  const sid = parseInt(styleId, 10);
  if (Number.isNaN(pid) || Number.isNaN(sid)) {
    return { site, product: null, style: null };
  }
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, pid), eq(products.websiteId, site.id)))
    .limit(1);
  if (!product) return { site, product: null, style: null };
  const [style] = await db
    .select()
    .from(productStyles)
    .where(and(eq(productStyles.id, sid), eq(productStyles.productId, product.id)))
    .limit(1);
  return { site, product, style: style || null };
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { siteId, productId, styleId } = await params;
  const { style } = await resolveStyle(parseInt(session.user.id, 10), siteId, productId, styleId);
  if (!style) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: style });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { siteId, productId, styleId } = await params;
  const { style } = await resolveStyle(parseInt(session.user.id, 10), siteId, productId, styleId);
  if (!style) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (!n) {
      return NextResponse.json({ success: false, message: 'name cannot be empty' }, { status: 400 });
    }
    updateData.name = n;
  }
  if (body.colorHex !== undefined) updateData.colorHex = body.colorHex || null;
  if (body.thumbnailUrl !== undefined) updateData.thumbnailUrl = body.thumbnailUrl || null;
  if (body.priceCents !== undefined) {
    if (body.priceCents === null || body.priceCents === '') {
      updateData.priceCents = null;
    } else {
      const n = parseInt(String(body.priceCents), 10);
      if (Number.isNaN(n) || n < 0) {
        return NextResponse.json({ success: false, message: 'priceCents must be >= 0' }, { status: 400 });
      }
      updateData.priceCents = n;
    }
  }
  if (body.order !== undefined) {
    updateData.order = parseInt(String(body.order), 10) || 0;
  }
  if (body.active !== undefined) updateData.active = Boolean(body.active);

  const [updated] = await db
    .update(productStyles)
    .set(updateData)
    .where(eq(productStyles.id, style.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { siteId, productId, styleId } = await params;
  const { style } = await resolveStyle(parseInt(session.user.id, 10), siteId, productId, styleId);
  if (!style) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  await db.delete(productStyles).where(eq(productStyles.id, style.id));
  return NextResponse.json({ success: true, message: 'Style deleted' });
}
