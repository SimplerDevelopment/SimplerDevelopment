import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCardTimeLogs } from '@/lib/db/schema';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const { minutes, note } = await req.json();

  if (!minutes || minutes <= 0) {
    return NextResponse.json({ success: false, message: 'minutes must be > 0' }, { status: 400 });
  }

  const [log] = await db.insert(kanbanCardTimeLogs).values({
    cardId,
    userId: parseInt(session.user.id, 10),
    minutes,
    note: note ?? null,
  }).returning();

  return NextResponse.json({ success: true, data: { ...log, userName: session.user.name ?? null } });
}
