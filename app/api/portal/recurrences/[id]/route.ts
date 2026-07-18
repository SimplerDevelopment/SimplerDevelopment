// PATCH/DELETE one card_recurrences row. Editor+ on the parent project.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cardRecurrences, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';
import { computeNextFireAt, type Cadence } from '@/lib/portal/recurrence-scheduler';

async function authorize(recurrenceId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();

  const [rec] = await db.select().from(cardRecurrences).where(eq(cardRecurrences.id, recurrenceId)).limit(1);
  if (!rec) return null;

  const [project] = await db.select().from(projects).where(eq(projects.id, rec.projectId)).limit(1);
  if (!project) return null;

  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return null;
  }
  return { rec, canEdit: staff || (await canUserEditProject(userId, rec.projectId)) };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recurrenceId = parseInt(id, 10);
  const access = await authorize(recurrenceId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.titlePattern === 'string' || body.titlePattern === null) updates.titlePattern = body.titlePattern?.slice(0, 255) ?? null;
  if (typeof body.description === 'string' || body.description === null) updates.description = body.description?.slice(0, 5000) ?? null;
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (typeof body.dayOfWeek === 'number' || body.dayOfWeek === null) updates.dayOfWeek = body.dayOfWeek;
  if (typeof body.dayOfMonth === 'number' || body.dayOfMonth === null) updates.dayOfMonth = body.dayOfMonth;
  if (typeof body.hourUtc === 'number' && body.hourUtc >= 0 && body.hourUtc <= 23) updates.hourUtc = body.hourUtc;

  // If schedule shape changed, recompute nextFireAt from "now" using the new
  // config. Use the merged config rather than the request body alone so
  // partial updates work correctly.
  const cadenceChange = typeof body.cadence === 'string' && ['daily', 'weekly', 'monthly'].includes(body.cadence);
  if (cadenceChange) updates.cadence = body.cadence;
  const scheduleTouched = cadenceChange ||
    'dayOfWeek' in body || 'dayOfMonth' in body || 'hourUtc' in body;
  if (scheduleTouched) {
    const merged = {
      cadence: (cadenceChange ? body.cadence : access.rec.cadence) as Cadence,
      dayOfWeek: 'dayOfWeek' in body ? body.dayOfWeek : access.rec.dayOfWeek,
      dayOfMonth: 'dayOfMonth' in body ? body.dayOfMonth : access.rec.dayOfMonth,
      hourUtc: ('hourUtc' in body ? body.hourUtc : access.rec.hourUtc) as number,
    };
    updates.nextFireAt = computeNextFireAt(new Date(), merged);
  }

  const [row] = await db.update(cardRecurrences).set(updates).where(eq(cardRecurrences.id, recurrenceId)).returning();
  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recurrenceId = parseInt(id, 10);
  const access = await authorize(recurrenceId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  await db.delete(cardRecurrences).where(eq(cardRecurrences.id, recurrenceId));
  return NextResponse.json({ success: true });
}
