/**
 * GET    /api/portal/chat/widgets/[id]
 * PATCH  /api/portal/chat/widgets/[id]
 * DELETE /api/portal/chat/widgets/[id]
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { chatWidgets } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { and, eq } from 'drizzle-orm';

async function loadWidget(userId: number, widgetId: number) {
  const client = await getPortalClient(userId);
  if (!client) return { error: 'Client not found', status: 404 } as const;
  const [widget] = await db
    .select()
    .from(chatWidgets)
    .where(and(eq(chatWidgets.id, widgetId), eq(chatWidgets.clientId, client.id)))
    .limit(1);
  if (!widget) return { error: 'Widget not found', status: 404 } as const;
  return { widget, client } as const;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const widgetId = Number.parseInt(id, 10);
  const result = await loadWidget(parseInt(session.user.id, 10), widgetId);
  if ('error' in result) return NextResponse.json({ success: false, message: result.error }, { status: result.status });
  return NextResponse.json({ success: true, data: result.widget });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const widgetId = Number.parseInt(id, 10);
  const result = await loadWidget(parseInt(session.user.id, 10), widgetId);
  if ('error' in result) return NextResponse.json({ success: false, message: result.error }, { status: result.status });

  const body = await req.json().catch(() => ({}));
  const patch: Partial<typeof chatWidgets.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.greetingMessage === 'string') patch.greetingMessage = body.greetingMessage;
  if (typeof body.position === 'string') patch.position = body.position;
  if (typeof body.primaryColor === 'string') patch.primaryColor = body.primaryColor;
  if (typeof body.awayMessage === 'string' || body.awayMessage === null) patch.awayMessage = body.awayMessage;

  const [updated] = await db.update(chatWidgets).set(patch).where(eq(chatWidgets.id, widgetId)).returning();
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const widgetId = Number.parseInt(id, 10);
  const result = await loadWidget(parseInt(session.user.id, 10), widgetId);
  if ('error' in result) return NextResponse.json({ success: false, message: result.error }, { status: result.status });
  await db.delete(chatWidgets).where(eq(chatWidgets.id, widgetId));
  return NextResponse.json({ success: true, data: { id: widgetId } });
}
