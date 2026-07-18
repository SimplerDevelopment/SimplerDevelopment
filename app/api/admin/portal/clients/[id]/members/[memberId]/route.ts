import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientMembers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id, memberId } = await params;
  const clientId = parseInt(id, 10);
  const memberRowId = parseInt(memberId, 10);

  const [member] = await db.select().from(clientMembers)
    .where(and(eq(clientMembers.id, memberRowId), eq(clientMembers.clientId, clientId)))
    .limit(1);

  if (!member) return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });
  if (member.role === 'owner') return NextResponse.json({ success: false, message: 'Cannot remove the account owner' }, { status: 400 });

  await db.delete(clientMembers).where(eq(clientMembers.id, memberRowId));
  return NextResponse.json({ success: true });
}
