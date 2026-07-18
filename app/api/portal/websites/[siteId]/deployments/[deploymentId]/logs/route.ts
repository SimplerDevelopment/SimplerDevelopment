import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getDeploymentEvents } from '@/lib/vercel';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; deploymentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { siteId, deploymentId } = await params;
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });
  if (!site.vercelProjectId) return NextResponse.json({ success: false, message: 'Website not provisioned' }, { status: 400 });

  try {
    const events = await getDeploymentEvents(deploymentId);
    return NextResponse.json({ success: true, data: events });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch logs';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
