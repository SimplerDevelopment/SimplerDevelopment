import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { designLibraryAssets as designAssets } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

type Params = { params: Promise<{ siteId: string }> };

const VALID_TYPES = new Set(['icon', 'art']);

// GET /api/portal/websites/[siteId]/store/design-assets?type=icon|art&category=
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId, 10));
  if (!site) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const category = url.searchParams.get('category');

  const conditions = [eq(designAssets.websiteId, site.id)];
  if (type && VALID_TYPES.has(type)) {
    conditions.push(eq(designAssets.type, type));
  }
  if (category) {
    conditions.push(eq(designAssets.category, category));
  }

  const rows = await db
    .select()
    .from(designAssets)
    .where(and(...conditions))
    .orderBy(asc(designAssets.order), asc(designAssets.id));

  return NextResponse.json({ success: true, data: rows });
}

// POST /api/portal/websites/[siteId]/store/design-assets
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId, 10));
  if (!site) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const type = (body.type ?? '').toString();
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json(
      { success: false, message: 'type must be "icon" or "art"' },
      { status: 400 },
    );
  }
  const name = (body.name ?? '').toString().trim();
  if (!name) {
    return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  }

  if (type === 'icon') {
    if (!body.iconName || !body.iconPack) {
      return NextResponse.json(
        { success: false, message: 'iconName and iconPack required for icon assets' },
        { status: 400 },
      );
    }
  } else if (type === 'art') {
    if (!body.imageUrl) {
      return NextResponse.json(
        { success: false, message: 'imageUrl required for art assets' },
        { status: 400 },
      );
    }
  }

  const tags = Array.isArray(body.tags)
    ? body.tags.map((t: unknown) => String(t)).filter(Boolean)
    : [];
  const order =
    body.order != null && body.order !== '' ? parseInt(String(body.order), 10) || 0 : 0;
  const active = body.active === undefined ? true : Boolean(body.active);

  const [created] = await db
    .insert(designAssets)
    .values({
      websiteId: site.id,
      type,
      category: body.category ? String(body.category) : null,
      name,
      iconName: body.iconName ? String(body.iconName) : null,
      iconPack: body.iconPack ? String(body.iconPack) : null,
      imageUrl: body.imageUrl ? String(body.imageUrl) : null,
      tags,
      order,
      active,
    })
    .returning();

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
