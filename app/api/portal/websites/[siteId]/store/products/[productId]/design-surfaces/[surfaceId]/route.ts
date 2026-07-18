import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products, productDesignSurfaces } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveStoreSite } from '@/lib/portal-auth';

type Params = { params: Promise<{ siteId: string; productId: string; surfaceId: string }> };

const SLUG_RE = /^[a-z0-9-]+$/;

async function resolveSurface(userId: number, siteId: string, productId: string, surfaceId: string) {
  const site = await resolveStoreSite(userId, parseInt(siteId));
  if (!site) return null;

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, parseInt(productId)), eq(products.websiteId, site.id)))
    .limit(1);
  if (!product) return null;

  const [surface] = await db
    .select()
    .from(productDesignSurfaces)
    .where(and(
      eq(productDesignSurfaces.id, parseInt(surfaceId)),
      eq(productDesignSurfaces.productId, product.id),
    ))
    .limit(1);

  return surface ? { product, surface } : null;
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId, surfaceId } = await params;
  const resolved = await resolveSurface(parseInt(session.user.id, 10), siteId, productId, surfaceId);
  if (!resolved) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  const { product, surface } = resolved;

  try {
    const body = await req.json();
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name) {
        return NextResponse.json({ success: false, message: 'name must be a non-empty string' }, { status: 400 });
      }
      updateData.name = body.name;
    }
    if (body.slug !== undefined) {
      if (typeof body.slug !== 'string' || !SLUG_RE.test(body.slug)) {
        return NextResponse.json({ success: false, message: 'slug must match [a-z0-9-]+' }, { status: 400 });
      }
      // Check uniqueness if slug is changing
      if (body.slug !== surface.slug) {
        const [conflict] = await db
          .select({ id: productDesignSurfaces.id })
          .from(productDesignSurfaces)
          .where(and(
            eq(productDesignSurfaces.productId, product.id),
            eq(productDesignSurfaces.slug, body.slug),
          ))
          .limit(1);
        if (conflict) {
          return NextResponse.json({ success: false, message: 'A surface with this slug already exists for this product' }, { status: 409 });
        }
      }
      updateData.slug = body.slug;
    }
    if (body.mockupImage !== undefined) updateData.mockupImage = body.mockupImage;
    if (body.active !== undefined) updateData.active = Boolean(body.active);

    const intFields = [
      'canvasWidth', 'canvasHeight',
      'printAreaX', 'printAreaY', 'printAreaWidth', 'printAreaHeight',
      'printDpi', 'displayOrder',
    ] as const;
    for (const f of intFields) {
      if (body[f] !== undefined) updateData[f] = parseInt(String(body[f]));
    }

    const [updated] = await db
      .update(productDesignSurfaces)
      .set(updateData)
      .where(eq(productDesignSurfaces.id, surface.id))
      .returning();

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('Portal design-surfaces PATCH error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId, surfaceId } = await params;
  const resolved = await resolveSurface(parseInt(session.user.id, 10), siteId, productId, surfaceId);
  if (!resolved) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(productDesignSurfaces).where(eq(productDesignSurfaces.id, resolved.surface.id));

  return NextResponse.json({ success: true, message: 'Surface deleted' });
}
