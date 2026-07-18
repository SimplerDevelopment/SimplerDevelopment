import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, clientMembers, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { hash } from 'bcryptjs';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const clientId = parseInt(id, 10);

  const data = await db
    .select({
      memberId: clientMembers.id,
      role: clientMembers.role,
      joinedAt: clientMembers.createdAt,
      userId: users.id,
      name: users.name,
      email: users.email,
      active: users.active,
    })
    .from(clientMembers)
    .innerJoin(users, eq(users.id, clientMembers.userId))
    .where(eq(clientMembers.clientId, clientId))
    .orderBy(clientMembers.createdAt);

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const clientId = parseInt(id, 10);

  const [clientRow] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!clientRow) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();
  const { name, email, password } = body;
  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return NextResponse.json({ success: false, message: 'Name, email, and password are required' }, { status: 400 });
  }

  // Check if user already exists
  const [existing] = await db.select().from(users).where(eq(users.email, email.trim())).limit(1);

  let user = existing;
  if (!user) {
    const hashed = await hash(password, 12);
    [user] = await db.insert(users).values({
      name: name.trim(), email: email.trim(), password: hashed, role: 'client', active: true,
    }).returning();
  }

  // Check if already a member
  const [alreadyMember] = await db.select().from(clientMembers)
    .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.userId, user.id)))
    .limit(1);
  if (alreadyMember) {
    return NextResponse.json({ success: false, message: 'User is already a member of this client' }, { status: 400 });
  }

  const invitedBy = parseInt(session.user!.id, 10);
  const [member] = await db.insert(clientMembers).values({
    clientId, userId: user.id, role: 'member', invitedBy,
  }).returning();

  return NextResponse.json({ success: true, data: { ...member, name: user.name, email: user.email } }, { status: 201 });
}
