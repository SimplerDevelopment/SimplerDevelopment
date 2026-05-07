// POST — build a snapshot from the given site and persist it as a
// site_snapshots row owned by the active client. Returns the new snapshot id.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { siteSnapshots } from '@/lib/db/schema';
import { resolveClientSite } from '@/lib/portal-client';
import { exportSite } from '@/lib/snapshots/export';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId, 10));
  if (!site) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    isPublic?: boolean;
  };

  const name = body.name?.trim() || `${site.name} snapshot`;

  let payload;
  try {
    payload = await exportSite(site.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Export failed';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }

  const userId = parseInt(session.user.id, 10);
  const [row] = await db
    .insert(siteSnapshots)
    .values({
      clientId: site.clientId,
      name,
      description: body.description ?? null,
      sourceSiteId: site.id,
      payload,
      isPublic: body.isPublic ?? false,
      createdBy: userId,
    })
    .returning({
      id: siteSnapshots.id,
      name: siteSnapshots.name,
      sourceSiteId: siteSnapshots.sourceSiteId,
      createdAt: siteSnapshots.createdAt,
    });

  return NextResponse.json({ success: true, data: row });
}
