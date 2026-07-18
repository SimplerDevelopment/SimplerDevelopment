import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { websiteEnvVars } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getEnvironmentForClient } from '@/lib/environment-helpers';

/** GET - List env vars for an environment */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; envId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, envId } = await params;
  const result = await getEnvironmentForClient(parseInt(session.user.id, 10), siteId, envId);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const vars = await db.select().from(websiteEnvVars)
    .where(eq(websiteEnvVars.environmentId, result.env.id))
    .orderBy(websiteEnvVars.key);

  return NextResponse.json({ success: true, data: vars });
}

/** POST - Add a new env var */
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
  const { key, value } = body;

  if (!key || typeof key !== 'string') {
    return NextResponse.json({ success: false, message: 'key is required' }, { status: 400 });
  }
  if (value === undefined || value === null) {
    return NextResponse.json({ success: false, message: 'value is required' }, { status: 400 });
  }

  const [newVar] = await db.insert(websiteEnvVars)
    .values({ environmentId: result.env.id, key: key.trim(), value: String(value) })
    .returning();

  return NextResponse.json({ success: true, data: newVar });
}
