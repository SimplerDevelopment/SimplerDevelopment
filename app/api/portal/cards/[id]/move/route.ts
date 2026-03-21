import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const { columnId, order } = await req.json();

  const [card] = await db
    .update(kanbanCards)
    .set({ columnId, order, updatedAt: new Date() })
    .where(eq(kanbanCards.id, cardId))
    .returning();

  return NextResponse.json({ success: true, data: card });
}
