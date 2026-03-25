import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { validateSubdomain, isSubdomainAvailable } from '@/lib/subdomain';

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
  const { name, description, subdomain } = body;

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

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description.trim() || null;
  if (subdomain !== undefined) updates.subdomain = subdomain || null;

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
