import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { hostedSites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const [site] = await db.select().from(hostedSites).where(eq(hostedSites.id, parseInt(id))).limit(1);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: site });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const {
    name, customDomain, railwayProjectId, railwayServiceId,
    railwayEnvironmentId, railwayDomain, status, plan, renewalDate, notes, dnsInstructions,
  } = body;

  const [site] = await db
    .update(hostedSites)
    .set({
      ...(name !== undefined && { name }),
      ...(customDomain !== undefined && { customDomain: customDomain || null }),
      ...(railwayProjectId !== undefined && { railwayProjectId: railwayProjectId || null }),
      ...(railwayServiceId !== undefined && { railwayServiceId: railwayServiceId || null }),
      ...(railwayEnvironmentId !== undefined && { railwayEnvironmentId: railwayEnvironmentId || null }),
      ...(railwayDomain !== undefined && { railwayDomain: railwayDomain || null }),
      ...(status !== undefined && { status }),
      ...(plan !== undefined && { plan }),
      ...(renewalDate !== undefined && { renewalDate: renewalDate ? new Date(renewalDate) : null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(dnsInstructions !== undefined && { dnsInstructions }),
      updatedAt: new Date(),
    })
    .where(eq(hostedSites.id, parseInt(id)))
    .returning();

  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: site });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await db.delete(hostedSites).where(eq(hostedSites.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
