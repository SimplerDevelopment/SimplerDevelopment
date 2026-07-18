import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveClientSite } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { apiKeys } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function DELETE(_req: Request, { params }: { params: Promise<{ siteId: string; keyId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, keyId } = await params;
  const userId = parseInt(session.user.id, 10);
  const site = await resolveClientSite(userId, parseInt(siteId, 10));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(apiKeys).where(and(eq(apiKeys.id, parseInt(keyId, 10)), eq(apiKeys.websiteId, site.id)));

  return NextResponse.json({ success: true });
}
