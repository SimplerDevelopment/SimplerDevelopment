import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sprints } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { isPortalStaff } from '@/lib/portal';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const staff = await isPortalStaff();
    if (!staff) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const sprintId = parseInt(id, 10);
    const body = await req.json();

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.goal !== undefined) updates.goal = body.goal;
    if (body.startDate !== undefined) updates.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) updates.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.status !== undefined) updates.status = body.status;

    const [sprint] = await db.update(sprints).set(updates).where(eq(sprints.id, sprintId)).returning();
    if (!sprint) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true, data: sprint });
  } catch (err) {
    console.error('[PATCH /api/portal/sprints/[id]]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const staff = await isPortalStaff();
    if (!staff) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    await db.delete(sprints).where(eq(sprints.id, parseInt(id, 10)));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/portal/sprints/[id]]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
