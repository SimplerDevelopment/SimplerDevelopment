// GET — list snapshots for the active client.
// POST — register an externally-uploaded snapshot JSON (no source site).
//
// Sibling endpoint `/api/portal/sites/[siteId]/export` handles building
// snapshots from a live site.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { siteSnapshots } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import type { SnapshotPayload } from '@/lib/snapshots/types';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  // Slim projection — payload can be huge; clients fetch the full row via
  // /api/portal/snapshots/[id].
  const data = await db
    .select({
      id: siteSnapshots.id,
      name: siteSnapshots.name,
      description: siteSnapshots.description,
      sourceSiteId: siteSnapshots.sourceSiteId,
      version: siteSnapshots.version,
      isPublic: siteSnapshots.isPublic,
      createdAt: siteSnapshots.createdAt,
      updatedAt: siteSnapshots.updatedAt,
      createdBy: siteSnapshots.createdBy,
    })
    .from(siteSnapshots)
    .where(eq(siteSnapshots.clientId, client.id))
    .orderBy(desc(siteSnapshots.createdAt));

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, description, payload, isPublic } = body as {
    name?: string;
    description?: string;
    payload?: SnapshotPayload;
    isPublic?: boolean;
  };

  if (!name || !payload) {
    return NextResponse.json(
      { success: false, message: '`name` and `payload` are required' },
      { status: 400 },
    );
  }

  if (payload.schemaVersion !== 1) {
    return NextResponse.json(
      { success: false, message: `Unsupported snapshot schemaVersion ${payload.schemaVersion}` },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(siteSnapshots)
    .values({
      clientId: client.id,
      name,
      description: description ?? null,
      sourceSiteId: null,
      payload,
      isPublic: isPublic ?? false,
      createdBy: userId,
    })
    .returning({
      id: siteSnapshots.id,
      name: siteSnapshots.name,
      description: siteSnapshots.description,
      sourceSiteId: siteSnapshots.sourceSiteId,
      version: siteSnapshots.version,
      isPublic: siteSnapshots.isPublic,
      createdAt: siteSnapshots.createdAt,
    });

  return NextResponse.json({ success: true, data: row });
}
