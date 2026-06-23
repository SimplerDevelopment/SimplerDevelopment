import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { websiteEnvVars } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { setEnvVars } from '@/lib/vercel';
import { getEnvironmentForClient } from '@/lib/environment-helpers';

/** POST - Sync all env vars to Vercel for this environment's target */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; envId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, envId } = await params;
  const result = await getEnvironmentForClient(parseInt(session.user.id, 10), siteId, envId);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  if (!result.site.vercelProjectId) {
    return NextResponse.json({ success: false, message: 'Website must be provisioned first' }, { status: 400 });
  }

  const vars = await db.select().from(websiteEnvVars)
    .where(eq(websiteEnvVars.environmentId, result.env.id));

  if (vars.length === 0) {
    return NextResponse.json({ success: true, message: 'No env vars to sync.' });
  }

  try {
    await setEnvVars(
      result.site.vercelProjectId,
      vars.map(v => ({
        key: v.key,
        value: v.value,
        target: [result.env.vercelTarget],
      })),
    );

    // Mark all as synced
    for (const v of vars) {
      await db.update(websiteEnvVars)
        .set({ syncedToVercel: true, updatedAt: new Date() })
        .where(eq(websiteEnvVars.id, v.id));
    }

    return NextResponse.json({
      success: true,
      message: `${vars.length} variable${vars.length === 1 ? '' : 's'} synced to Vercel (${result.env.vercelTarget}).`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
