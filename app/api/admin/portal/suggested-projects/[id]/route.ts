import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { suggestedProjects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const [row] = await db
    .update(suggestedProjects)
    .set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.estimatedPrice !== undefined && { estimatedPrice: body.estimatedPrice }),
      ...(body.estimatedTimeline !== undefined && { estimatedTimeline: body.estimatedTimeline }),
      ...(body.features !== undefined && { features: body.features }),
      ...(body.icon !== undefined && { icon: body.icon }),
      ...(body.active !== undefined && { active: body.active }),
      ...(body.clientId !== undefined && { clientId: body.clientId }),
      ...(body.order !== undefined && { order: body.order }),
      ...(body.surveyFields !== undefined && { surveyFields: body.surveyFields }),
      updatedAt: new Date(),
    })
    .where(eq(suggestedProjects.id, parseInt(id, 10)))
    .returning();

  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await db.delete(suggestedProjects).where(eq(suggestedProjects.id, parseInt(id, 10)));
  return NextResponse.json({ success: true });
}
