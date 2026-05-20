import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, projectWebhooks } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { generateWebhookSecret } from '@/lib/pm-webhooks';
import { validateWebhookUrl } from '@/lib/ssrf-guard';
import { canUserEditProject } from '@/lib/portal/project-access';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeProject(projectId: number, session: any): Promise<{ canEdit: boolean } | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return { canEdit: true };
  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client || client.id !== project.clientId) return null;
  return { canEdit: await canUserEditProject(userId, projectId) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const projectId = parseInt(id, 10);
  const a = await authorizeProject(projectId, session);
  if (!a) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const rows = await db.select().from(projectWebhooks)
    .where(eq(projectWebhooks.projectId, projectId))
    .orderBy(desc(projectWebhooks.createdAt));

  // Redact secret in list view
  return NextResponse.json({
    success: true,
    data: rows.map(r => ({ ...r, secret: r.secret.slice(0, 6) + '…' })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const projectId = parseInt(id, 10);
  const a = await authorizeProject(projectId, session);
  if (!a) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!a.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { url, events } = await req.json();
  if (typeof url !== 'string') {
    return NextResponse.json({ success: false, message: 'URL required' }, { status: 400 });
  }
  const check = validateWebhookUrl(url);
  if (!check.ok) return NextResponse.json({ success: false, message: check.reason }, { status: 400 });

  const secret = generateWebhookSecret();
  const [row] = await db.insert(projectWebhooks).values({
    projectId,
    url: url.slice(0, 500),
    secret,
    events: Array.isArray(events) ? events.filter(e => typeof e === 'string').slice(0, 50) : [],
    createdBy: parseInt(session.user.id, 10),
  }).returning();

  // Return full secret once (on creation only)
  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
