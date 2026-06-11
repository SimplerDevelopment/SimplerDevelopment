import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products, productStyles, productSides } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

type Params = {
  params: Promise<{
    siteId: string;
    productId: string;
    styleId: string;
    sideId: string;
  }>;
};

async function resolveSide(
  userId: number,
  siteId: string,
  productId: string,
  styleId: string,
  sideId: string,
) {
  const site = await resolveClientSite(userId, parseInt(siteId, 10));
  if (!site) return { side: null };
  const pid = parseInt(productId, 10);
  const styleIdNum = parseInt(styleId, 10);
  const sideIdNum = parseInt(sideId, 10);
  if (Number.isNaN(pid) || Number.isNaN(styleIdNum) || Number.isNaN(sideIdNum)) {
    return { side: null };
  }
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, pid), eq(products.websiteId, site.id)))
    .limit(1);
  if (!product) return { side: null };
  const [style] = await db
    .select({ id: productStyles.id })
    .from(productStyles)
    .where(and(eq(productStyles.id, styleIdNum), eq(productStyles.productId, product.id)))
    .limit(1);
  if (!style) return { side: null };
  const [side] = await db
    .select()
    .from(productSides)
    .where(and(eq(productSides.id, sideIdNum), eq(productSides.styleId, style.id)))
    .limit(1);
  return { side: side || null };
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { siteId, productId, styleId, sideId } = await params;
  const { side } = await resolveSide(
    parseInt(session.user.id, 10), siteId, productId, styleId, sideId,
  );
  if (!side) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: side });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { siteId, productId, styleId, sideId } = await params;
  const { side } = await resolveSide(
    parseInt(session.user.id, 10), siteId, productId, styleId, sideId,
  );
  if (!side) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.side !== undefined) {
    const s = String(body.side).trim();
    if (!s) {
      return NextResponse.json({ success: false, message: 'side cannot be empty' }, { status: 400 });
    }
    updateData.side = s;
  }
  if (body.label !== undefined) updateData.label = body.label || null;
  if (body.imageUrl !== undefined) {
    const u = String(body.imageUrl).trim();
    if (!u) {
      return NextResponse.json({ success: false, message: 'imageUrl cannot be empty' }, { status: 400 });
    }
    updateData.imageUrl = u;
  }

  const intFields: Array<'printableX' | 'printableY' | 'order'> = [
    'printableX',
    'printableY',
    'order',
  ];
  for (const f of intFields) {
    if (body[f] !== undefined) {
      const n = parseInt(String(body[f]), 10);
      updateData[f] = Number.isNaN(n) ? 0 : n;
    }
  }

  for (const f of ['printableWidth', 'printableHeight'] as const) {
    if (body[f] !== undefined) {
      if (body[f] === null || body[f] === '') {
        updateData[f] = null;
      } else {
        const n = parseInt(String(body[f]), 10);
        updateData[f] = Number.isNaN(n) ? null : n;
      }
    }
  }

  const [updated] = await db
    .update(productSides)
    .set(updateData)
    .where(eq(productSides.id, side.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { siteId, productId, styleId, sideId } = await params;
  const { side } = await resolveSide(
    parseInt(session.user.id, 10), siteId, productId, styleId, sideId,
  );
  if (!side) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  await db.delete(productSides).where(eq(productSides.id, side.id));
  return NextResponse.json({ success: true, message: 'Side deleted' });
}
