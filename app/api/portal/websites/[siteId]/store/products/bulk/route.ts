import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { resolveStoreSite } from '@/lib/portal-auth';

type Params = { params: Promise<{ siteId: string }> };

const MAX_BULK = 500;
const VALID_STATUSES = ['active', 'draft', 'archived'];

function parseIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ids = raw
    .map((v) => (typeof v === 'number' ? v : parseInt(String(v), 10)))
    .filter((n): n is number => Number.isFinite(n) && Number.isInteger(n));
  if (ids.length === 0) return null;
  return ids;
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveStoreSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const ids = parseIds((body as { ids?: unknown } | null)?.ids);
  if (!ids) {
    return NextResponse.json({ success: false, message: 'ids must be a non-empty array' }, { status: 400 });
  }
  if (ids.length > MAX_BULK) {
    return NextResponse.json({ success: false, message: `Bulk capped at ${MAX_BULK} ids` }, { status: 400 });
  }

  const deleted = await db
    .delete(products)
    .where(and(inArray(products.id, ids), eq(products.websiteId, site.id)))
    .returning({ id: products.id });

  return NextResponse.json({
    success: true,
    data: { deletedCount: deleted.length, ids: deleted.map((d) => d.id) },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveStoreSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const ids = parseIds((body as { ids?: unknown } | null)?.ids);
  if (!ids) {
    return NextResponse.json({ success: false, message: 'ids must be a non-empty array' }, { status: 400 });
  }
  if (ids.length > MAX_BULK) {
    return NextResponse.json({ success: false, message: `Bulk capped at ${MAX_BULK} ids` }, { status: 400 });
  }

  const status = (body as { status?: unknown } | null)?.status;
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { success: false, message: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const updated = await db
    .update(products)
    .set({ status, updatedAt: new Date() })
    .where(and(inArray(products.id, ids), eq(products.websiteId, site.id)))
    .returning({ id: products.id });

  return NextResponse.json({
    success: true,
    data: { updatedCount: updated.length, ids: updated.map((d) => d.id) },
  });
}
