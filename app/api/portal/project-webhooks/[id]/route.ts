import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, projectWebhooks } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { validateWebhookUrl } from '@/lib/ssrf-guard';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeWebhook(webhookId: number, session: any): Promise<{ canEdit: boolean; hook: typeof projectWebhooks.$inferSelect } | null> {
  const [hook] = await db.select().from(projectWebhooks).where(eq(projectWebhooks.id, webhookId)).limit(1);
  if (!hook) return null;

  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return { canEdit: true, hook };

  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, hook.projectId), eq(projects.clientId, client.id))).limit(1);
  if (!proj) return null;

  return { canEdit: proj.isPrivate, hook };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const hookId = parseInt(id, 10);
  const a = await authorizeWebhook(hookId, session);
  if (!a) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!a.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { url, events, active } = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof url === 'string') {
    const check = validateWebhookUrl(url);
    if (!check.ok) return NextResponse.json({ success: false, message: check.reason }, { status: 400 });
    updates.url = url.slice(0, 500);
  }
  if (Array.isArray(events)) updates.events = events.filter(e => typeof e === 'string').slice(0, 50);
  if (typeof active === 'boolean') {
    updates.active = active;
    if (active) updates.failureCount = 0;
  }

  const [row] = await db.update(projectWebhooks).set(updates).where(eq(projectWebhooks.id, hookId)).returning();
  return NextResponse.json({ success: true, data: { ...row, secret: row.secret.slice(0, 6) + '…' } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const hookId = parseInt(id, 10);
  const a = await authorizeWebhook(hookId, session);
  if (!a) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!a.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  await db.delete(projectWebhooks).where(eq(projectWebhooks.id, hookId));
  return NextResponse.json({ success: true });
}
