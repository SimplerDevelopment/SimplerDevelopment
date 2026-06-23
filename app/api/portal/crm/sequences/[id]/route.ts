// CRM email sequence — single-row. Phase 2 of [[Spec - CRM Email Sync + Sequences]].
// GET (with steps) · PATCH (name/enabled) · DELETE. Tenant-scoped by clientId.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmSequences, crmSequenceSteps } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

async function loadForClient(seqId: number, clientId: number) {
  const [row] = await db
    .select()
    .from(crmSequences)
    .where(and(eq(crmSequences.id, seqId), eq(crmSequences.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const seqId = parseInt((await params).id, 10);
  if (Number.isNaN(seqId)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  const sequence = await loadForClient(seqId, client.id);
  if (!sequence) return NextResponse.json({ success: false, message: 'Sequence not found' }, { status: 404 });

  const steps = await db
    .select()
    .from(crmSequenceSteps)
    .where(eq(crmSequenceSteps.sequenceId, seqId))
    .orderBy(asc(crmSequenceSteps.stepOrder));

  return NextResponse.json({ success: true, data: { ...sequence, steps } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const seqId = parseInt((await params).id, 10);
  if (Number.isNaN(seqId)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim())
      return NextResponse.json({ success: false, message: 'Name must be non-empty' }, { status: 400 });
    updates.name = body.name.trim();
  }
  if (body.enabled !== undefined) updates.enabled = !!body.enabled;

  const [row] = await db
    .update(crmSequences)
    .set(updates)
    .where(and(eq(crmSequences.id, seqId), eq(crmSequences.clientId, client.id)))
    .returning();
  if (!row) return NextResponse.json({ success: false, message: 'Sequence not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const seqId = parseInt((await params).id, 10);
  if (Number.isNaN(seqId)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const [row] = await db
    .delete(crmSequences)
    .where(and(eq(crmSequences.id, seqId), eq(crmSequences.clientId, client.id)))
    .returning();
  if (!row) return NextResponse.json({ success: false, message: 'Sequence not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
