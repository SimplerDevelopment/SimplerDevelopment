// POST /api/portal/tickets/[id]/csat — the client rates a resolved ticket.
//
// CSAT (1..5 + optional comment) can only be submitted once a ticket is
// resolved or closed. Tenant-scoped via the help-desk service; the ticket must
// belong to the caller's client. Re-submitting overwrites the prior rating.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { supportTickets } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'help-desk' });
  if (isAuthError(authResult)) return authResult.response;
  const { client } = authResult;

  const ticketId = parseInt((await params).id, 10);
  if (Number.isNaN(ticketId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const score = Number(body.score);
  if (!Number.isInteger(score) || score < 1 || score > 5)
    return NextResponse.json({ success: false, message: 'score must be an integer 1–5' }, { status: 400 });
  const comment = typeof body.comment === 'string' ? body.comment.slice(0, 2000) : null;

  const [ticket] = await db
    .select({ id: supportTickets.id, status: supportTickets.status })
    .from(supportTickets)
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.clientId, client.id)))
    .limit(1);
  if (!ticket) return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
  if (ticket.status !== 'resolved' && ticket.status !== 'closed')
    return NextResponse.json(
      { success: false, message: 'CSAT can only be submitted on a resolved or closed ticket' },
      { status: 409 },
    );

  const [updated] = await db
    .update(supportTickets)
    .set({ csatScore: score, csatComment: comment, csatSubmittedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.clientId, client.id)))
    .returning({
      id: supportTickets.id,
      csatScore: supportTickets.csatScore,
      csatComment: supportTickets.csatComment,
      csatSubmittedAt: supportTickets.csatSubmittedAt,
    });

  return NextResponse.json({ success: true, data: updated });
}
