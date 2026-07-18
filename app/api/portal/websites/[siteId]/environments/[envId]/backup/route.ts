import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { websiteBackups } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getEnvironmentForClient, snapshotEnvironment } from '@/lib/environment-helpers';

/** GET - List backups for an environment */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; envId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, envId } = await params;
  const result = await getEnvironmentForClient(parseInt(session.user.id, 10), siteId, envId);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const backups = await db.select({
    id: websiteBackups.id,
    name: websiteBackups.name,
    createdAt: websiteBackups.createdAt,
  }).from(websiteBackups)
    .where(eq(websiteBackups.environmentId, result.env.id))
    .orderBy(desc(websiteBackups.createdAt))
    .limit(20);

  return NextResponse.json({ success: true, data: backups });
}

/** POST - Create a backup of the current environment state */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string; envId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, envId } = await params;
  const result = await getEnvironmentForClient(parseInt(session.user.id, 10), siteId, envId);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = body.name || `${result.env.name} backup — ${new Date().toLocaleString()}`;

  const snapshot = await snapshotEnvironment(result.env.id, result.site.id);

  const [backup] = await db.insert(websiteBackups)
    .values({
      environmentId: result.env.id,
      name,
      snapshot,
      createdBy: parseInt(session.user.id, 10),
    })
    .returning();

  return NextResponse.json({ success: true, data: { id: backup.id, name: backup.name }, message: 'Backup created.' });
}
