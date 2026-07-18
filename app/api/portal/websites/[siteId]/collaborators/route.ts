import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, githubConnections } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { addCollaborator } from '@/lib/github';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { siteId } = await params;
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });
  if (!site.githubRepoName) {
    return NextResponse.json({ success: false, message: 'Website repo has not been provisioned yet.' }, { status: 400 });
  }

  // Get the requesting user's GitHub connection
  const [ghConn] = await db
    .select()
    .from(githubConnections)
    .where(eq(githubConnections.userId, userId))
    .limit(1);

  if (!ghConn) {
    return NextResponse.json({ success: false, message: 'Connect your GitHub account first.' }, { status: 400 });
  }

  const body = await req.json();
  const permission = body.permission === 'admin' ? 'admin' : 'push';

  try {
    await addCollaborator(site.githubRepoName, ghConn.githubUsername, permission);
    return NextResponse.json({ success: true, message: `Added ${ghConn.githubUsername} as collaborator.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add collaborator';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
