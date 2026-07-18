/**
 * GET  /api/portal/chat/widgets — list widgets for the active client.
 * POST /api/portal/chat/widgets — create a widget for a site.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { chatWidgets, clientWebsites } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { and, eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const data = await db
    .select()
    .from(chatWidgets)
    .where(eq(chatWidgets.clientId, client.id))
    .orderBy(chatWidgets.createdAt);
  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const siteId = Number.parseInt(String(body.siteId ?? ''), 10);
  if (!Number.isInteger(siteId) || siteId <= 0) {
    return NextResponse.json({ success: false, message: 'siteId is required' }, { status: 400 });
  }

  // Verify the site belongs to the active client (multi-tenant guard).
  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteId), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  if (!site) return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });

  // Unique on siteId — block duplicate widget creation per site.
  const [existing] = await db.select().from(chatWidgets).where(eq(chatWidgets.siteId, siteId)).limit(1);
  if (existing) {
    return NextResponse.json({ success: false, message: 'Widget already exists for this site' }, { status: 409 });
  }

  const [created] = await db
    .insert(chatWidgets)
    .values({
      clientId: client.id,
      siteId,
      enabled: body.enabled ?? true,
      greetingMessage: body.greetingMessage ?? 'Hi there! How can we help?',
      position: body.position ?? 'bottom-right',
      primaryColor: body.primaryColor ?? '#0070f3',
      awayMessage: body.awayMessage ?? null,
      brainEnabled: false,
    })
    .returning();

  return NextResponse.json({ success: true, data: created });
}
