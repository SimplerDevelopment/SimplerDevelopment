import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { suggestedProjects, suggestedProjectRequests } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export const runtime = 'nodejs';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

export async function POST(req: Request) {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { suggestedProjectId, answers, message } = body;

  if (!suggestedProjectId) return NextResponse.json({ success: false, message: 'suggestedProjectId is required' }, { status: 400 });

  const [project] = await db.select().from(suggestedProjects).where(eq(suggestedProjects.id, suggestedProjectId)).limit(1);
  if (!project || !project.active) return NextResponse.json({ success: false, message: 'Project not available' }, { status: 404 });

  const [request] = await db.insert(suggestedProjectRequests).values({
    suggestedProjectId,
    clientId: client.id,
    status: 'pending',
    answers: answers ?? null,
    message: message ?? null,
  }).returning();

  return NextResponse.json({ success: true, data: request });
}
