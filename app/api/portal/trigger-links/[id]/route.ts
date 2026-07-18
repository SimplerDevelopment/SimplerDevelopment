// GET / PATCH / DELETE for a single trigger link. All three are scoped by
// (id, clientId) so a tenant can never read or mutate another tenant's link.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { triggerLinks, triggerLinkClicks } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { and, desc, eq, sql } from 'drizzle-orm';

const RECENT_CLICKS_LIMIT = 25;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  const linkId = parseInt(id, 10);
  if (Number.isNaN(linkId)) {
    return NextResponse.json({ success: false, error: 'invalid id' }, { status: 400 });
  }

  const [link] = await db
    .select()
    .from(triggerLinks)
    .where(and(eq(triggerLinks.id, linkId), eq(triggerLinks.clientId, client.id)))
    .limit(1);

  if (!link) {
    return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
  }

  const recentClicks = await db
    .select({
      id: triggerLinkClicks.id,
      ip: triggerLinkClicks.ip,
      userAgent: triggerLinkClicks.userAgent,
      referer: triggerLinkClicks.referer,
      occurredAt: triggerLinkClicks.occurredAt,
    })
    .from(triggerLinkClicks)
    .where(eq(triggerLinkClicks.linkId, linkId))
    .orderBy(desc(triggerLinkClicks.occurredAt))
    .limit(RECENT_CLICKS_LIMIT);

  const [{ count: clickCount } = { count: 0 }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(triggerLinkClicks)
    .where(eq(triggerLinkClicks.linkId, linkId));

  return NextResponse.json({
    success: true,
    data: { link, clickCount, recentClicks },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  const linkId = parseInt(id, 10);
  if (Number.isNaN(linkId)) {
    return NextResponse.json({ success: false, error: 'invalid id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.destinationUrl !== undefined) {
    if (typeof body.destinationUrl !== 'string' || !body.destinationUrl) {
      return NextResponse.json({ success: false, error: 'destinationUrl must be a non-empty string' }, { status: 400 });
    }
    updates.destinationUrl = body.destinationUrl;
  }
  if (body.label !== undefined) updates.label = body.label || null;
  if (body.contactFieldKey !== undefined) updates.contactFieldKey = body.contactFieldKey || null;

  const [updated] = await db
    .update(triggerLinks)
    .set(updates)
    .where(and(eq(triggerLinks.id, linkId), eq(triggerLinks.clientId, client.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: { link: updated } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const authResult = await authorizePortal({ action: 'admin' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  const linkId = parseInt(id, 10);
  if (Number.isNaN(linkId)) {
    return NextResponse.json({ success: false, error: 'invalid id' }, { status: 400 });
  }

  const result = await db
    .delete(triggerLinks)
    .where(and(eq(triggerLinks.id, linkId), eq(triggerLinks.clientId, client.id)))
    .returning({ id: triggerLinks.id });

  if (result.length === 0) {
    return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
