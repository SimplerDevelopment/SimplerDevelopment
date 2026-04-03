import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveClientSite } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { apiKeys } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateApiKey } from '@/lib/api-keys';

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const userId = parseInt(session.user.id, 10);
  const site = await resolveClientSite(userId, parseInt(siteId, 10));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.key,
      scopes: apiKeys.scopes,
      rateLimitPerMinute: apiKeys.rateLimitPerMinute,
      active: apiKeys.active,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.websiteId, site.id))
    .orderBy(apiKeys.createdAt);

  // Mask keys — only show prefix
  const masked = keys.map(k => ({
    ...k,
    keyPrefix: k.keyPrefix.slice(0, 12) + '...' + k.keyPrefix.slice(-4),
  }));

  return NextResponse.json({ success: true, data: masked });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const userId = parseInt(session.user.id, 10);
  const site = await resolveClientSite(userId, parseInt(siteId, 10));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const name = body.name?.trim() || 'Default';

  const key = generateApiKey();

  const [record] = await db.insert(apiKeys).values({
    clientId: site.clientId,
    websiteId: site.id,
    key,
    name,
    scopes: body.scopes || [],
    rateLimitPerMinute: body.rateLimitPerMinute || 60,
  }).returning();

  // Return the full key ONCE — caller must save it
  return NextResponse.json({
    success: true,
    data: { id: record.id, name: record.name, key, createdAt: record.createdAt },
  });
}
