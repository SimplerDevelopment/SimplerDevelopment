import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, users, clientMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { ensureDefaultPipeline } from '@/lib/crm/default-pipeline';
import { listAdminClients } from '@/lib/admin/clients-list';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

// E2 perf — see lib/admin/clients-list.ts for the full perf-rewrite rationale.
// This route is a thin wrapper that parses cursor + limit from query params.
export async function GET(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? '100');
  const cursorCreatedAt = url.searchParams.get('cursorCreatedAt');
  const cursorId = url.searchParams.get('cursorId');

  const cursor = cursorCreatedAt && cursorId
    ? { createdAt: cursorCreatedAt, id: Number(cursorId) }
    : null;

  const { data, nextCursor } = await listAdminClients({
    limit: Number.isFinite(rawLimit) ? rawLimit : undefined,
    cursor,
  });

  return NextResponse.json({ success: true, data, nextCursor });
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
  await ensureDefaultPipeline(client.id);

  return NextResponse.json({ success: true, data: { user, client } });
}
