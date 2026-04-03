import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { validateSubdomain, isSubdomainAvailable } from '@/lib/subdomain';
import { changeSubdomain } from '@/lib/website-provisioner';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { siteId } = await params;
  const siteIdNum = parseInt(siteId);
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteIdNum), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  const body = await req.json();
  const { name, description, subdomain, githubRepoName, githubRepoUrl, deployBranch } = body;

  if (name !== undefined && !name.trim()) {
    return NextResponse.json({ success: false, message: 'Website name cannot be empty.' }, { status: 400 });
  }

  // Validate subdomain if provided
  if (subdomain !== undefined && subdomain !== null) {
    const error = validateSubdomain(subdomain);
    if (error) return NextResponse.json({ success: false, message: error }, { status: 400 });
    if (subdomain !== site.subdomain && !(await isSubdomainAvailable(subdomain, siteIdNum))) {
      return NextResponse.json({ success: false, message: 'That subdomain is already taken.' }, { status: 409 });
    }
  }

  // If subdomain is changing and site is provisioned, update infrastructure
  const subdomainChanging = subdomain !== undefined && subdomain !== site.subdomain && site.deploymentStatus === 'active';

  if (subdomainChanging) {
    try {
      await changeSubdomain(site.id, site.subdomain!, subdomain, site.vercelProjectId!);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update subdomain infrastructure';
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description.trim() || null;
  if (subdomain !== undefined && !subdomainChanging) updates.subdomain = subdomain || null;
  if (githubRepoName !== undefined) updates.githubRepoName = githubRepoName?.trim() || null;
  if (githubRepoUrl !== undefined) updates.githubRepoUrl = githubRepoUrl?.trim() || null;
  if (deployBranch !== undefined) updates.deployBranch = deployBranch?.trim() || null;

  const [updated] = await db
    .update(clientWebsites)
    .set(updates)
    .where(eq(clientWebsites.id, site.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { siteId } = await params;
  const siteIdNum = parseInt(siteId);
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteIdNum), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  await db.delete(clientWebsites).where(eq(clientWebsites.id, site.id));

  return NextResponse.json({ success: true });
}
