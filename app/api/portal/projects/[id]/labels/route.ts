import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanLabels, projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

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
  if (!client || project.clientId !== client.id) return null;
  return { canEdit: project.isPrivate };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const projectId = parseInt(id, 10);
  const result = await authorizeProject(projectId, session);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const rows = await db.select().from(kanbanLabels).where(eq(kanbanLabels.projectId, projectId)).orderBy(kanbanLabels.name);
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const projectId = parseInt(id, 10);
  const result = await authorizeProject(projectId, session);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!result.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { name, color } = await req.json();
  if (!name?.trim()) return NextResponse.json({ success: false, message: 'Name required' }, { status: 400 });

  const [label] = await db.insert(kanbanLabels).values({
    projectId,
    name: name.trim().slice(0, 50),
    color: (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) ? color : '#6366f1',
  }).returning();

  return NextResponse.json({ success: true, data: label }, { status: 201 });
}
