import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmProposals } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

// Basic RFC-5322-lite check — good enough to reject obvious junk
// (e.g. empty strings, missing `@`, spaces). Not a full validator.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const proposalId = parseInt(id, 10);
  if (isNaN(proposalId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  // Parse body defensively — empty body should still surface as a clean 400
  // (not a 500 from JSON.parse).
  let body: { recipientEmail?: unknown } = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid recipient email' },
      { status: 400 }
    );
  }

  const recipientEmail =
    typeof body.recipientEmail === 'string' ? body.recipientEmail.trim() : '';

  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    return NextResponse.json(
      { success: false, error: 'invalid recipient email' },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select({ id: crmProposals.id, clientToken: crmProposals.clientToken, status: crmProposals.status })
    .from(crmProposals)
    .where(and(eq(crmProposals.id, proposalId), eq(crmProposals.clientId, client.id)));

  if (!existing)
    return NextResponse.json({ success: false, message: 'Proposal not found' }, { status: 404 });

  if (existing.status !== 'draft' && existing.status !== 'sent') {
    return NextResponse.json(
      { success: false, message: `Cannot send a proposal with status "${existing.status}"` },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(crmProposals)
    .set({
      status: 'sent',
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(crmProposals.id, proposalId))
    .returning();

  return NextResponse.json({
    success: true,
    data: {
      ...updated,
      proposalUrl: `/proposal/${existing.clientToken}`,
    },
  });
}
