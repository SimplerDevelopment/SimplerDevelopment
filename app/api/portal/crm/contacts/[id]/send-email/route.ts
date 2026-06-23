import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmContacts, crmActivities, crmEmailMessages } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resend } from '@/lib/email';

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
  const contactId = parseInt(id, 10);
  if (isNaN(contactId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  // Fetch contact and verify ownership
  const [contact] = await db
    .select({
      id: crmContacts.id,
      email: crmContacts.email,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
    })
    .from(crmContacts)
    .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, client.id)));

  if (!contact)
    return NextResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });

  if (!contact.email)
    return NextResponse.json(
      { success: false, message: 'Contact does not have an email address' },
      { status: 400 }
    );

  // Validate request body
  const body = await req.json();
  const { subject, body: emailBody, templateId } = body as {
    subject?: string;
    body?: string;
    templateId?: number;
  };

  if (!subject?.trim() || !emailBody?.trim())
    return NextResponse.json(
      { success: false, message: 'Subject and body are required' },
      { status: 400 }
    );

  // Send email via Resend
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@simplerdevelopment.com';
  const senderName = client.company || 'Simpler Development';

  try {
    const result = await resend.emails.send({
      from: `${senderName} <${fromEmail}>`,
      to: contact.email,
      subject: subject.trim(),
      html: buildEmailHtml(emailBody.trim()),
    });

    if (result.error) {
      console.error(`[crm/send-email] Resend error for contact ${contactId}:`, result.error);
      return NextResponse.json(
        { success: false, message: result.error.message || 'Failed to send email' },
        { status: 500 }
      );
    }

    // Log activity
    const descriptionSnippet = emailBody.trim().substring(0, 200) + (emailBody.length > 200 ? '...' : '');

    const [activity] = await db
      .insert(crmActivities)
      .values({
        clientId: client.id,
        contactId: contact.id,
        type: 'email',
        title: subject.trim(),
        description: descriptionSnippet,
        completedAt: new Date(),
        createdBy: userId,
      })
      .returning();

    // Thread row (Phase 1 — Spec: CRM Email Sync + Sequences). Outbound leg of
    // the unified contact email thread. Best-effort: a thread-log failure must
    // not fail the send that already succeeded.
    try {
      await db.insert(crmEmailMessages).values({
        clientId: client.id,
        contactId: contact.id,
        direction: 'outbound',
        providerMessageId: result.data?.id ?? null,
        threadKey: result.data?.id ?? null,
        fromEmail,
        toEmail: contact.email,
        subject: subject.trim(),
        snippet: descriptionSnippet,
        sentAt: new Date(),
      });
    } catch (threadErr) {
      console.error(`[crm/send-email] thread-row insert failed for contact ${contactId}:`, threadErr);
    }

    // Update lastContactedAt
    await db
      .update(crmContacts)
      .set({ lastContactedAt: new Date(), updatedAt: new Date() })
      .where(eq(crmContacts.id, contact.id));

    return NextResponse.json({
      success: true,
      data: { activityId: activity.id, messageId: result.data?.id },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[crm/send-email] Failed to send email to contact ${contactId}:`, errorMsg);
    return NextResponse.json(
      { success: false, message: 'Failed to send email' },
      { status: 500 }
    );
  }
}

function buildEmailHtml(body: string): string {
  // Convert newlines to <br> for plain text body content
  const htmlBody = body.replace(/\n/g, '<br />');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px;">
              <div style="font-size:16px;line-height:1.6;color:#333333;">
                ${htmlBody}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
