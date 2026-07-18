import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projectCustomFields, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';

async function authorize(fieldId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();

  const [field] = await db.select().from(projectCustomFields).where(eq(projectCustomFields.id, fieldId)).limit(1);
  if (!field) return null;

  const [project] = await db.select().from(projects).where(eq(projects.id, field.projectId)).limit(1);
  if (!project) return null;

  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return null;
  }
  return { field, canEdit: staff || (await canUserEditProject(userId, field.projectId)) };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fieldId = parseInt(id, 10);
  const access = await authorize(fieldId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === 'string') updates.name = body.name.trim().slice(0, 100);
  if (typeof body.required === 'boolean') updates.required = body.required;
  if (Array.isArray(body.options)) updates.options = body.options.filter((o: unknown) => typeof o === 'string').slice(0, 50);
  if (typeof body.order === 'number') updates.order = body.order;
  // kind / key are immutable — changing them silently corrupts existing values.

  const [row] = await db.update(projectCustomFields).set(updates).where(eq(projectCustomFields.id, fieldId)).returning();
  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fieldId = parseInt(id, 10);
  const access = await authorize(fieldId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  await db.delete(projectCustomFields).where(eq(projectCustomFields.id, fieldId));
  return NextResponse.json({ success: true });
}
