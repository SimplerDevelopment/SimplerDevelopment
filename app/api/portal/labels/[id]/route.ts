import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanLabels, projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { canUserEditProject } from '@/lib/portal/project-access';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeLabel(labelId: number, session: any): Promise<{ canEdit: boolean } | null> {
  const [label] = await db.select().from(kanbanLabels).where(eq(kanbanLabels.id, labelId)).limit(1);
  if (!label) return null;

  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return { canEdit: true };

  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [project] = await db.select().from(projects).where(eq(projects.id, label.projectId)).limit(1);
  if (!project || project.clientId !== client.id) return null;

  return { canEdit: await canUserEditProject(userId, project.id) };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const labelId = parseInt(id, 10);
  const result = await authorizeLabel(labelId, session);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!result.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { name, color } = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim().slice(0, 50);
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) updates.color = color;

  const [row] = await db.update(kanbanLabels).set(updates).where(eq(kanbanLabels.id, labelId)).returning();
  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const labelId = parseInt(id, 10);
  const result = await authorizeLabel(labelId, session);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!result.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  await db.delete(kanbanLabels).where(eq(kanbanLabels.id, labelId));
  return NextResponse.json({ success: true });
}
