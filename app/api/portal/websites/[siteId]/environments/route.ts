import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, websiteEnvironments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

/** GET - List environments for a website */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const [site] = await db.select().from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  const envs = await db.select().from(websiteEnvironments)
    .where(eq(websiteEnvironments.websiteId, site.id))
    .orderBy(websiteEnvironments.name);

  return NextResponse.json({ success: true, data: envs });
}
