import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { validateSubdomain, isSubdomainAvailable } from '@/lib/subdomain';
import { changeSubdomain } from '@/lib/website-provisioner';
import { parseSiteIdParam } from '@/lib/api/parse-params';

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
  const parsed = parseSiteIdParam(siteId);
  if (!parsed.ok) return parsed.response;
  const siteIdNum = parsed.value;
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteIdNum), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  const body = await req.json();
  const { name, description, subdomain, githubRepoName, githubRepoUrl, deployBranch, publicAccess, previewCode } = body;

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

  // If subdomain is changing, update infrastructure (DNS + optionally Vercel)
  const subdomainChanging = subdomain !== undefined && subdomain !== site.subdomain;

  if (subdomainChanging) {
    try {
      if (site.subdomain) {
        // Existing subdomain — change it (handles old cleanup + new creation)
        await changeSubdomain(site.id, site.subdomain, subdomain, site.vercelProjectId || null);
      } else if (subdomain) {
        // First time setting subdomain — just create DNS + update DB
        const { createCnameRecord } = await import('@/lib/cloudflare-dns');
        if (site.vercelProjectId) {
          const { addDomain, getDomainConfig } = await import('@/lib/vercel');
          const fullDomain = `${subdomain}.simplerdevelopment.com`;
          await addDomain(site.vercelProjectId, fullDomain);
          const config = await getDomainConfig(fullDomain);
          const target = config.cnames[0] || 'cname.vercel-dns.com';
          await createCnameRecord(subdomain, target);
        } else {
          const platformDomain = process.env.RAILWAY_PUBLIC_DOMAIN || 'simplerdevelopment.com';
          await createCnameRecord(subdomain, platformDomain);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update subdomain infrastructure';
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description.trim() || null;
  if (subdomain !== undefined) {
    updates.subdomain = subdomain || null;
    updates.vercelDomain = subdomain ? `${subdomain}.simplerdevelopment.com` : null;
  }
  if (githubRepoName !== undefined) updates.githubRepoName = githubRepoName?.trim() || null;
  if (githubRepoUrl !== undefined) updates.githubRepoUrl = githubRepoUrl?.trim() || null;
  if (publicAccess !== undefined) updates.publicAccess = !!publicAccess;
  if (deployBranch !== undefined) updates.deployBranch = deployBranch?.trim() || null;
  if (previewCode !== undefined) {
    if (previewCode === null || previewCode === '') {
      updates.previewCode = null;
    } else if (typeof previewCode === 'string') {
      const normalized = previewCode.trim().toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z0-9-]{4,64}$/.test(normalized)) {
        return NextResponse.json(
          { success: false, message: 'Preview code must be 4-64 chars (letters, numbers, hyphens).' },
          { status: 400 },
        );
      }
      // Surface a friendly conflict if the code is already taken by another site.
      const [clash] = await db
        .select({ id: clientWebsites.id })
        .from(clientWebsites)
        .where(eq(clientWebsites.previewCode, normalized))
        .limit(1);
      if (clash && clash.id !== site.id) {
        return NextResponse.json(
          { success: false, message: 'That preview code is already in use on another site.' },
          { status: 409 },
        );
      }
      updates.previewCode = normalized;
    }
  }

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
  const parsed = parseSiteIdParam(siteId);
  if (!parsed.ok) return parsed.response;
  const siteIdNum = parsed.value;
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteIdNum), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  await db.delete(clientWebsites).where(eq(clientWebsites.id, site.id));

  return NextResponse.json({ success: true });
}
