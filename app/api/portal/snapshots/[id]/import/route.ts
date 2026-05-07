// POST — apply a stored snapshot. Body:
//   { targetClientId?: number; siteId?: number; createNewSite?: boolean; newSiteName?: string }
// If `targetClientId` differs from the active client, require admin role.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { siteSnapshots } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { importSnapshot } from '@/lib/snapshots/import';
import type { SnapshotPayload } from '@/lib/snapshots/types';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  const { id } = await params;
  const [snap] = await db
    .select()
    .from(siteSnapshots)
    .where(and(eq(siteSnapshots.id, parseInt(id, 10)), eq(siteSnapshots.clientId, client.id)))
    .limit(1);

  if (!snap) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    targetClientId?: number;
    siteId?: number;
    createNewSite?: boolean;
    newSiteName?: string;
  };

  // Cross-client imports require staff role.
  const targetClientId = body.targetClientId ?? client.id;
  if (targetClientId !== client.id) {
    const role = (session.user as { role?: string })?.role;
    if (role !== 'admin' && role !== 'employee') {
      return NextResponse.json(
        { success: false, message: 'Cross-client snapshot import requires admin role' },
        { status: 403 },
      );
    }
  }

  // Default to creating a new site if neither flag is supplied — that's the
  // most common case (clone a configured site).
  const createNewSite = body.createNewSite ?? !body.siteId;

  try {
    const result = await importSnapshot(
      snap.payload as SnapshotPayload,
      targetClientId,
      {
        siteId: body.siteId,
        createNewSite,
        newSiteName: body.newSiteName,
      },
    );
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Import failed';
    return NextResponse.json({ success: false, message: msg }, { status: 400 });
  }
}
