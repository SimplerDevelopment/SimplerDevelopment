// GET — return the snapshot payload as a downloadable JSON file.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { siteSnapshots } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function GET(
  _req: Request,
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

  const filename = `${slugify(snap.name)}-snapshot.json`;
  const body = JSON.stringify(snap.payload, null, 2);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'snapshot'
  );
}
