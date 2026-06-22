// CRM email sequences — collection. Phase 2 of [[Spec - CRM Email Sync + Sequences]].
// GET  — list the client's sequences
// POST — create a sequence with inline steps
// Tenant-scoped via getPortalClient → crmSequences.clientId.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmSequences, crmSequenceSteps } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

interface StepInput {
  delayHours?: unknown;
  subject?: unknown;
  bodyHtml?: unknown;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const rows = await db
    .select()
    .from(crmSequences)
    .where(eq(crmSequences.clientId, client.id))
    .orderBy(desc(crmSequences.createdAt));

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.name !== 'string' || !body.name.trim())
    return NextResponse.json({ success: false, message: 'Sequence name is required' }, { status: 400 });

  const stepsInput: StepInput[] = Array.isArray(body.steps) ? body.steps : [];
  // Validate each step before any insert.
  let validatedSteps: { stepOrder: number; delayHours: number; subject: string; bodyHtml: string }[];
  try {
    validatedSteps = stepsInput.map((s, i) => {
      if (typeof s.subject !== 'string' || !s.subject.trim())
        throw new Error(`Step ${i + 1}: subject is required`);
      if (typeof s.bodyHtml !== 'string' || !s.bodyHtml.trim())
        throw new Error(`Step ${i + 1}: bodyHtml is required`);
      const delay = Number(s.delayHours);
      return {
        stepOrder: i,
        delayHours: Number.isFinite(delay) && delay >= 0 ? Math.floor(delay) : 0,
        subject: s.subject.trim().slice(0, 500),
        bodyHtml: s.bodyHtml,
      };
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: (err as Error).message }, { status: 400 });
  }

  const [sequence] = await db
    .insert(crmSequences)
    .values({ clientId: client.id, name: body.name.trim(), createdBy: userId })
    .returning();

  let insertedSteps: (typeof crmSequenceSteps.$inferSelect)[] = [];
  if (validatedSteps.length > 0) {
    insertedSteps = await db
      .insert(crmSequenceSteps)
      .values(validatedSteps.map((s) => ({ ...s, sequenceId: sequence.id })))
      .returning();
  }

  return NextResponse.json({ success: true, data: { ...sequence, steps: insertedSteps } }, { status: 201 });
}
