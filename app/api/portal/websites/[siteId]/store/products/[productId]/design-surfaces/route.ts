import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products, productDesignSurfaces } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { resolveStoreSite } from '@/lib/portal-auth';

type Params = { params: Promise<{ siteId: string; productId: string }> };

const SLUG_RE = /^[a-z0-9-]+$/;

async function resolveProduct(userId: number, siteId: string, productId: string) {
  const site = await resolveStoreSite(userId, parseInt(siteId));
  if (!site) return null;
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, parseInt(productId)), eq(products.websiteId, site.id)))
    .limit(1);
  return product || null;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId } = await params;
  const product = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const surfaces = await db
    .select()
    .from(productDesignSurfaces)
    .where(eq(productDesignSurfaces.productId, product.id))
    .orderBy(asc(productDesignSurfaces.displayOrder), asc(productDesignSurfaces.id));

  return NextResponse.json({ success: true, data: surfaces });
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId } = await params;
  const product = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  try {
    const body = await req.json();
    const {
      name, slug, mockupImage,
      canvasWidth, canvasHeight,
      printAreaX, printAreaY, printAreaWidth, printAreaHeight,
      printDpi, displayOrder, active,
    } = body || {};

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
    }
    if (!slug || typeof slug !== 'string') {
      return NextResponse.json({ success: false, message: 'slug is required' }, { status: 400 });
    }
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json({ success: false, message: 'slug must match [a-z0-9-]+' }, { status: 400 });
    }
    if (!mockupImage || typeof mockupImage !== 'string') {
      return NextResponse.json({ success: false, message: 'mockupImage is required' }, { status: 400 });
    }

    // Enforce unique slug per product
    const [existing] = await db
      .select({ id: productDesignSurfaces.id })
      .from(productDesignSurfaces)
      .where(and(
        eq(productDesignSurfaces.productId, product.id),
        eq(productDesignSurfaces.slug, slug),
      ))
      .limit(1);
    if (existing) {
      return NextResponse.json({ success: false, message: 'A surface with this slug already exists for this product' }, { status: 409 });
    }

    const insertValues: typeof productDesignSurfaces.$inferInsert = {
      productId: product.id,
      name,
      slug,
      mockupImage,
    };
    if (canvasWidth !== undefined) insertValues.canvasWidth = parseInt(String(canvasWidth));
    if (canvasHeight !== undefined) insertValues.canvasHeight = parseInt(String(canvasHeight));
    if (printAreaX !== undefined) insertValues.printAreaX = parseInt(String(printAreaX));
    if (printAreaY !== undefined) insertValues.printAreaY = parseInt(String(printAreaY));
    if (printAreaWidth !== undefined) insertValues.printAreaWidth = parseInt(String(printAreaWidth));
    if (printAreaHeight !== undefined) insertValues.printAreaHeight = parseInt(String(printAreaHeight));
    if (printDpi !== undefined) insertValues.printDpi = parseInt(String(printDpi));
    if (displayOrder !== undefined) insertValues.displayOrder = parseInt(String(displayOrder));
    if (active !== undefined) insertValues.active = Boolean(active);

    const [surface] = await db
      .insert(productDesignSurfaces)
      .values(insertValues)
      .returning();

    return NextResponse.json({ success: true, data: surface }, { status: 201 });
  } catch (err) {
    console.error('Portal design-surfaces POST error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
