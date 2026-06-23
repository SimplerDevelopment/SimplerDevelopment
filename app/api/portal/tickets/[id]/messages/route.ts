import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { supportTickets, ticketMessages, clients, users } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';
import { resend } from '@/lib/email';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';

  if (!isStaff) {
    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    const [ticket] = await db.select().from(supportTickets)
      .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.clientId, client.id))).limit(1);
    if (!ticket) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  if (!body.body?.trim()) return NextResponse.json({ success: false, message: 'Message body is required' }, { status: 400 });

  const isInternal = isStaff ? (body.isInternal ?? false) : false;

  const [msg] = await db.insert(ticketMessages).values({
    ticketId,
    authorId: userId,
    body: body.body,
    isInternal,
  }).returning();

  // Auto-advance ticket status + stamp first-response SLA timer.
  //
  // `firstResponseAt` tracks STAFF responsiveness — it must only be stamped
  // when a staff user (admin/employee) posts a public (non-internal) reply
  // and the ticket has not already recorded a first response. Internal notes
  // and client replies must not stop the SLA clock.
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (ticket) {
    const updates: Record<string, unknown> = {};
    if ((ticket.status === 'waiting_on_customer' || ticket.status === 'waiting') && !isStaff) {
      updates.status = 'open';
    } else if (ticket.status === 'open' && isStaff) {
      updates.status = 'in_progress';
    }
    if (isStaff && !isInternal && !ticket.firstResponseAt) {
      updates.firstResponseAt = new Date();
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.update(supportTickets).set(updates).where(eq(supportTickets.id, ticketId));
    }

    // Email the client when a staff member posts a non-internal public reply.
    if (isStaff && !isInternal) {
      try {
        const [clientRow] = await db
          .select({ userEmail: users.email, userName: users.name })
          .from(clients)
          .innerJoin(users, eq(clients.userId, users.id))
          .where(eq(clients.id, ticket.clientId))
          .limit(1);

        if (clientRow?.userEmail) {
          const baseUrl = process.env.NEXTAUTH_URL || 'https://app.simplerdevelopment.com';
          const portalLink = `${baseUrl}/portal/tickets/${ticketId}`;
          const from = process.env.RESEND_FROM_EMAIL || 'noreply@simplerdevelopment.com';

          await resend.emails.send({
            from: `Simpler Development Support <${from}>`,
            to: clientRow.userEmail,
            subject: `New reply on ticket #${ticket.number}`,
            html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px;">
              <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">New reply on ticket #${ticket.number}</h2>
              <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Subject: ${ticket.subject}</p>
              <div style="margin:20px 0;padding:16px;background:#f9fafb;border-left:4px solid #6366f1;border-radius:4px;">
                <p style="margin:0;font-size:15px;color:#374151;white-space:pre-wrap;">${msg.body}</p>
              </div>
              <a href="${portalLink}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View ticket</a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">Powered by SimplerDevelopment</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
          });
        }
      } catch (emailErr) {
        // Non-fatal — log but do not fail the API response.
        console.error('[tickets] Failed to send reply notification email:', emailErr);
      }
    }
  }

  return NextResponse.json({ success: true, data: msg });
}
