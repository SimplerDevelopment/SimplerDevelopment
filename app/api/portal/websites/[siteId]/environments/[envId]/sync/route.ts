import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { websiteEnvVars } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { setEnvVars } from '@/lib/vercel';
import { getEnvironmentForClient } from '@/lib/environment-helpers';
import { requireService } from '@/lib/mcp/types';

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

  // Entitlement gate (distill #1): this path drives the shared platform Vercel
  // credential. Tenant ownership alone is not enough — an unsubscribed client
  // must not push env vars (a paid hosting action) for free. Mirror the MCP
  // layer, which already gates this.
  if (!(await requireService(result.site.clientId, 'websites'))) {
    return NextResponse.json(
      { success: false, message: 'Your plan does not include hosting. Upgrade to sync environment variables.' },
      { status: 403 },
    );
  }

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

    // Audit the privileged deploy-plane action — actor + scope + which keys
    // (never values) — so platform-credential use is traceable.
    console.info('[env-sync] vercel env vars synced', {
      actorUserId: session.user.id,
      clientId: result.site.clientId,
      siteId,
      envId,
      target: result.env.vercelTarget,
      keys: vars.map((v) => v.key),
    });

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
