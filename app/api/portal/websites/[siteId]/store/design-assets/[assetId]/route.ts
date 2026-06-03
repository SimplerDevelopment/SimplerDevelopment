import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { philaprintsDesignAssets as designAssets } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

type Params = { params: Promise<{ siteId: string; assetId: string }> };

async function resolveAsset(userId: number, siteId: string, assetId: string) {
  const site = await resolveClientSite(userId, parseInt(siteId, 10));
  if (!site) return { asset: null };
  const aid = parseInt(assetId, 10);
  if (Number.isNaN(aid)) return { asset: null };
  const [asset] = await db
    .select()
    .from(designAssets)
    .where(and(eq(designAssets.id, aid), eq(designAssets.websiteId, site.id)))
    .limit(1);
  return { asset: asset || null };
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { siteId, assetId } = await params;
  const { asset } = await resolveAsset(parseInt(session.user.id, 10), siteId, assetId);
  if (!asset) {
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
  if (body.category !== undefined) updateData.category = body.category || null;
  if (body.iconName !== undefined) updateData.iconName = body.iconName || null;
  if (body.iconPack !== undefined) updateData.iconPack = body.iconPack || null;
  if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl || null;
  if (body.tags !== undefined) {
    updateData.tags = Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t)).filter(Boolean)
      : [];
  }
  if (body.order !== undefined) {
    updateData.order = parseInt(String(body.order), 10) || 0;
  }
  if (body.active !== undefined) updateData.active = Boolean(body.active);

  const [updated] = await db
    .update(designAssets)
    .set(updateData)
    .where(eq(designAssets.id, asset.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { siteId, assetId } = await params;
  const { asset } = await resolveAsset(parseInt(session.user.id, 10), siteId, assetId);
  if (!asset) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  await db.delete(designAssets).where(eq(designAssets.id, asset.id));
  return NextResponse.json({ success: true, message: 'Asset deleted' });
}
