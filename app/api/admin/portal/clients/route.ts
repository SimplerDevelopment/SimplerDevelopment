import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, users, clientMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const data = await db
    .select({
      id: clients.id,
      userId: clients.userId,
      company: clients.company,
      phone: clients.phone,
      website: clients.website,
      address: clients.address,
      notes: clients.notes,
      createdAt: clients.createdAt,
      userName: users.name,
      userEmail: users.email,
      userActive: users.active,
    })
    .from(clients)
    .innerJoin(users, eq(clients.userId, users.id))
    .orderBy(clients.createdAt);

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, email, password, company, phone, website, address, notes } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ success: false, message: 'Name, email, and password are required' }, { status: 400 });
  }

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ success: false, message: 'Email already exists' }, { status: 400 });
  }

  const hashed = await hash(password, 12);
  const [user] = await db.insert(users).values({ name, email, password: hashed, role: 'client', active: true }).returning();
  const [client] = await db.insert(clients).values({ userId: user.id, company, phone, website, address, notes }).returning();
  await db.insert(clientMembers).values({ clientId: client.id, userId: user.id, role: 'owner' });

  return NextResponse.json({ success: true, data: { user, client } });
}
