import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products, productStyles, productSides } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
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

// GET /api/portal/websites/[siteId]/store/products/[productId]/styles/[styleId]/sides
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

  const sides = await db
    .select()
    .from(productSides)
    .where(eq(productSides.styleId, style.id))
    .orderBy(asc(productSides.order), asc(productSides.id));

  return NextResponse.json({ success: true, data: sides });
}

// POST /api/portal/websites/[siteId]/store/products/[productId]/styles/[styleId]/sides
export async function POST(req: Request, { params }: Params) {
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
  const side = (body.side ?? '').toString().trim();
  const imageUrl = (body.imageUrl ?? '').toString().trim();
  if (!side) {
    return NextResponse.json({ success: false, message: 'side is required' }, { status: 400 });
  }
  if (!imageUrl) {
    return NextResponse.json({ success: false, message: 'imageUrl is required' }, { status: 400 });
  }

  const toInt = (v: unknown, def = 0): number => {
    if (v == null || v === '') return def;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? def : n;
  };
  const toIntOrNull = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? null : n;
  };

  const [created] = await db
    .insert(productSides)
    .values({
      styleId: style.id,
      side,
      label: body.label ? String(body.label) : null,
      imageUrl,
      printableX: toInt(body.printableX, 0),
      printableY: toInt(body.printableY, 0),
      printableWidth: toIntOrNull(body.printableWidth),
      printableHeight: toIntOrNull(body.printableHeight),
      order: toInt(body.order, 0),
    })
    .returning();

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
