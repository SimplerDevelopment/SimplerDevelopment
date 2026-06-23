import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { websiteBackups, websiteEnvVars } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getEnvironmentForClient, snapshotEnvironment } from '@/lib/environment-helpers';

/** POST - Restore an environment from a backup */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string; envId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, envId } = await params;
  const result = await getEnvironmentForClient(parseInt(session.user.id, 10), siteId, envId);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { backupId } = body;

  if (!backupId) {
    return NextResponse.json({ success: false, message: 'backupId is required' }, { status: 400 });
  }

  const [backup] = await db.select().from(websiteBackups)
    .where(and(eq(websiteBackups.id, backupId), eq(websiteBackups.environmentId, result.env.id)))
    .limit(1);

  if (!backup) return NextResponse.json({ success: false, message: 'Backup not found' }, { status: 404 });

  // Auto-backup current state before restoring
  const currentSnapshot = await snapshotEnvironment(result.env.id, result.site.id);
  await db.insert(websiteBackups).values({
    environmentId: result.env.id,
    name: `Auto-backup before restore — ${new Date().toLocaleString()}`,
    snapshot: currentSnapshot,
    createdBy: parseInt(session.user.id, 10),
  });

  // Restore env vars: clear existing, insert from backup
  const snapshot = backup.snapshot as { envVars: Array<{ key: string; value: string }> };

  await db.delete(websiteEnvVars).where(eq(websiteEnvVars.environmentId, result.env.id));

  if (snapshot.envVars?.length) {
    await db.insert(websiteEnvVars).values(
      snapshot.envVars.map(v => ({
        environmentId: result.env.id,
        key: v.key,
        value: v.value,
        syncedToVercel: false,
      })),
    );
  }

  return NextResponse.json({ success: true, message: 'Environment restored from backup. Env vars need to be synced to Vercel.' });
}
