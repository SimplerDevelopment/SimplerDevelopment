import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
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
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, parseInt(id))).limit(1);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: site });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, domain, description, active } = body;

  const [site] = await db
    .update(clientWebsites)
    .set({
      ...(name !== undefined && { name }),
      ...(domain !== undefined && { domain: domain || null }),
      ...(description !== undefined && { description: description || null }),
      ...(active !== undefined && { active }),
      updatedAt: new Date(),
    })
    .where(eq(clientWebsites.id, parseInt(id)))
    .returning();

  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: site });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await db.delete(clientWebsites).where(eq(clientWebsites.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
