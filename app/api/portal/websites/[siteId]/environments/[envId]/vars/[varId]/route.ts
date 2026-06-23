import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { websiteEnvVars } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getEnvironmentForClient } from '@/lib/environment-helpers';

/** PATCH - Update an env var */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ siteId: string; envId: string; varId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, envId, varId } = await params;
  const result = await getEnvironmentForClient(parseInt(session.user.id, 10), siteId, envId);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date(), syncedToVercel: false };
  if (body.key !== undefined) updates.key = body.key.trim();
  if (body.value !== undefined) updates.value = String(body.value);

  await db.update(websiteEnvVars)
    .set(updates)
    .where(and(eq(websiteEnvVars.id, parseInt(varId)), eq(websiteEnvVars.environmentId, result.env.id)));

  return NextResponse.json({ success: true, message: 'Updated.' });
}

/** DELETE - Remove an env var */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; envId: string; varId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, envId, varId } = await params;
  const result = await getEnvironmentForClient(parseInt(session.user.id, 10), siteId, envId);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(websiteEnvVars)
    .where(and(eq(websiteEnvVars.id, parseInt(varId)), eq(websiteEnvVars.environmentId, result.env.id)));

  return NextResponse.json({ success: true, message: 'Deleted.' });
}
