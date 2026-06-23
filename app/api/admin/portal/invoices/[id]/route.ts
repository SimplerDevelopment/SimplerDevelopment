import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { invoices, invoiceItems, clients, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resend } from '@/lib/email';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  return NextResponse.json({ success: true, data: { invoice, items } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  const body = await req.json();

  // Fetch the previous status so we can detect a transition to 'sent'.
  const [existing] = await db.select({ status: invoices.status, clientId: invoices.clientId, number: invoices.number })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  const [invoice] = await db.update(invoices).set({
    status: body.status,
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    notes: body.notes,
    updatedAt: new Date(),
  }).where(eq(invoices.id, invoiceId)).returning();

  // When an invoice transitions to 'sent', email the client the invoice link.
  if (existing && body.status === 'sent' && existing.status !== 'sent') {
    try {
      const [clientRow] = await db
        .select({ userEmail: users.email, userName: users.name })
        .from(clients)
        .innerJoin(users, eq(clients.userId, users.id))
        .where(eq(clients.id, existing.clientId))
        .limit(1);

      if (clientRow?.userEmail) {
        const baseUrl = process.env.NEXTAUTH_URL || 'https://app.simplerdevelopment.com';
        const invoiceLink = `${baseUrl}/portal/invoices/${invoiceId}`;
        const from = process.env.RESEND_FROM_EMAIL || 'noreply@simplerdevelopment.com';
        const invoiceNumber = invoice?.number ?? existing.number;

        await resend.emails.send({
          from: `Simpler Development Billing <${from}>`,
          to: clientRow.userEmail,
          subject: `Invoice ${invoiceNumber} is ready`,
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
              <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Invoice ${invoiceNumber} is ready</h2>
              <p style="margin:0 0 20px;font-size:15px;color:#374151;">
                Hi${clientRow.userName ? ` ${clientRow.userName}` : ''},<br /><br />
                Your invoice <strong>${invoiceNumber}</strong> from Simpler Development is ready to view and pay online.
              </p>
              <a href="${invoiceLink}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">View &amp; Pay Invoice</a>
              <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
                Or copy this link: <a href="${invoiceLink}" style="color:#6366f1;">${invoiceLink}</a>
              </p>
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
      console.error('[invoices] Failed to send invoice notification email:', emailErr);
    }
  }

  return NextResponse.json({ success: true, data: invoice });
}
