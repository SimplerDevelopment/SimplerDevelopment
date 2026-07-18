import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const clientId = parseInt(id, 10);
  const [data] = await db
    .select({ client: clients, user: users })
    .from(clients)
    .innerJoin(users, eq(clients.userId, users.id))
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!data) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const clientId = parseInt(id, 10);
  const body = await req.json();

  const [client] = await db
    .update(clients)
    .set({ company: body.company, phone: body.phone, website: body.website, address: body.address, notes: body.notes, updatedAt: new Date() })
    .where(eq(clients.id, clientId))
    .returning();

  if (body.name || body.active !== undefined) {
    await db.update(users).set({
      ...(body.name && { name: body.name }),
      ...(body.active !== undefined && { active: body.active }),
      updatedAt: new Date(),
    }).where(eq(users.id, client.userId));
  }

  return NextResponse.json({ success: true, data: client });
}
