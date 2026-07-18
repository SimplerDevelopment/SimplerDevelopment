import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { websiteEnvironments, websiteEnvVars, websiteBackups } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getEnvironmentForClient, snapshotEnvironment } from '@/lib/environment-helpers';

/** POST - Copy env vars from another environment into this one */
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
  const { fromEnvironmentId } = body;

  if (!fromEnvironmentId) {
    return NextResponse.json({ success: false, message: 'fromEnvironmentId is required' }, { status: 400 });
  }

  // Verify source environment belongs to the same website
  const [source] = await db.select().from(websiteEnvironments)
    .where(and(eq(websiteEnvironments.id, fromEnvironmentId), eq(websiteEnvironments.websiteId, result.site.id)))
    .limit(1);

  if (!source) return NextResponse.json({ success: false, message: 'Source environment not found' }, { status: 404 });

  // Auto-backup current target state before overwriting
  const currentSnapshot = await snapshotEnvironment(result.env.id, result.site.id);
  await db.insert(websiteBackups).values({
    environmentId: result.env.id,
    name: `Auto-backup before copy from ${source.name} — ${new Date().toLocaleString()}`,
    snapshot: currentSnapshot,
    createdBy: parseInt(session.user.id, 10),
  });

  // Get source env vars
  const sourceVars = await db.select({ key: websiteEnvVars.key, value: websiteEnvVars.value })
    .from(websiteEnvVars)
    .where(eq(websiteEnvVars.environmentId, source.id));

  // Replace target env vars
  await db.delete(websiteEnvVars).where(eq(websiteEnvVars.environmentId, result.env.id));

  if (sourceVars.length) {
    await db.insert(websiteEnvVars).values(
      sourceVars.map(v => ({
        environmentId: result.env.id,
        key: v.key,
        value: v.value,
        syncedToVercel: false,
      })),
    );
  }

  return NextResponse.json({
    success: true,
    message: `Copied ${sourceVars.length} variable${sourceVars.length === 1 ? '' : 's'} from ${source.name}. Sync to Vercel to apply.`,
  });
}
