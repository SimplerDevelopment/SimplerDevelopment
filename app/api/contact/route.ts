import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { escapeHtml } from '@/lib/utils/html';
import { db } from '@/lib/db';
import { crmDeals, crmPipelineStages } from '@/lib/db/schema';
import { upsertContactByEmail } from '@/lib/crm/contacts';
import { ensureDefaultPipeline } from '@/lib/crm/default-pipeline';
import { emitEvent } from '@/lib/automation/event-bus';

// Hidden form field — bots fill it; humans don't. Drop silently with a 200
// so the bot doesn't learn it's been detected. Pair with a CAPTCHA if abuse
// shows up.
const HONEYPOT_FIELD = 'website';

// Where contact-form submissions are delivered.
const CONTACT_INBOX = process.env.CONTACT_INBOX || 'info@simplerdevelopment.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'SimplerDevelopment <noreply@simplerdevelopment.com>';

// This is SimplerDevelopment's OWN marketing form, not a tenant route — there
// is no session and no site-resolver to derive a tenant from, so the owning
// client is configuration, never request input. Unset = capture is skipped and
// the form degrades to email-only (its behaviour before lead capture existed).
const AGENCY_CLIENT_ID = process.env.SD_AGENCY_CLIENT_ID
  ? Number(process.env.SD_AGENCY_CLIENT_ID)
  : null;

/**
 * Mirror an inbound contact-form submission into the CRM.
 *
 * Best-effort by design: the submitter's message is already on its way to
 * CONTACT_INBOX, so a CRM failure must never turn a delivered enquiry into a
 * 500 the visitor sees. Every failure path logs and returns.
 *
 * A deal is opened only for a *newly created* contact. Repeat submitters would
 * otherwise stack duplicate deals in the pipeline on every message; their
 * follow-ups still arrive by email. If per-submission history in the CRM is
 * wanted later, log a crm_activities row here rather than another deal.
 */
async function captureLead(input: { name: string; email: string; subject?: string; message: string }): Promise<void> {
  if (AGENCY_CLIENT_ID === null || !Number.isInteger(AGENCY_CLIENT_ID)) {
    console.warn('[contact] SD_AGENCY_CLIENT_ID unset or invalid — lead not captured to CRM');
    return;
  }

  try {
    const { contactId, created } = await upsertContactByEmail({
      clientId: AGENCY_CLIENT_ID,
      email: input.email,
      displayName: input.name,
      source: 'contact-form',
    });

    if (created) {
      const pipeline = await ensureDefaultPipeline(AGENCY_CLIENT_ID);
      const [stage] = await db.select({ id: crmPipelineStages.id })
        .from(crmPipelineStages)
        .where(eq(crmPipelineStages.pipelineId, pipeline.id))
        .orderBy(asc(crmPipelineStages.sortOrder))
        .limit(1);

      if (stage) {
        await db.insert(crmDeals).values({
          clientId: AGENCY_CLIENT_ID,
          pipelineId: pipeline.id,
          stageId: stage.id,
          title: `Contact form: ${input.subject?.trim() || 'General enquiry'}`.slice(0, 255),
          notes: input.message,
          ownerId: null,
          contactId,
        });
      } else {
        console.error('[contact] default pipeline has no stages — contact saved, deal skipped');
      }

      // userId 0 = unauthenticated public actor, matching the storefront
      // signup path. Only fired for genuinely new contacts so automation
      // rules keyed on this event don't re-fire for returning senders.
      emitEvent('crm.contact.created', AGENCY_CLIENT_ID, 0, {
        id: contactId,
        name: input.name,
        email: input.email,
        source: 'contact-form',
      });
    }
  } catch (err) {
    console.error('[contact] CRM lead capture failed', err);
  }
}


const contactSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email().max(320),
  subject: z.string().max(300).optional(),
  message: z.string().min(10).max(5000),
  // honeypot — must be empty/absent
  [HONEYPOT_FIELD]: z.string().max(0).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Honeypot check first — silently 200 so bots don't probe.
    if (typeof body[HONEYPOT_FIELD] === 'string' && body[HONEYPOT_FIELD].length > 0) {
      return NextResponse.json({ message: 'Message sent successfully' }, { status: 200 });
    }

    // Validate the request body
    const { name, email, subject, message } = contactSchema.parse(body);

    // Capture before the mail step: the provider-missing branch below returns
    // early, and a lead that only ever existed in an unsent email is exactly
    // the leak this closes. Awaited, not floated — a serverless invocation can
    // be frozen the moment the response is returned.
    await captureLead({ name, email, subject, message });

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = subject ? escapeHtml(subject) : 'No subject';
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');

    const html = `
      <h2>New Contact Form Submission</h2>
      <p><strong>From:</strong> ${safeName} (${safeEmail})</p>
      <p><strong>Subject:</strong> ${safeSubject}</p>
      <p><strong>Message:</strong></p>
      <p>${safeMessage}</p>
    `;

    // No provider configured: log and succeed so the form still works without
    // a mail provider. Mailpit local dev sets EMAIL_TRANSPORT=mailpit and uses
    // the same send path as production.
    if (process.env.EMAIL_TRANSPORT !== 'mailpit' && !process.env.RESEND_API_KEY) {
      console.warn('[contact] RESEND_API_KEY not set — submission logged, not emailed:', {
        name, email, subject,
      });
      return NextResponse.json({ message: 'Message sent successfully' }, { status: 200 });
    }

    const result = await sendEmail({
      from: FROM_EMAIL,
      to: CONTACT_INBOX,
      replyTo: email,
      subject: subject ? `Contact form: ${subject}` : 'New Contact Form Submission',
      html,
    });

    if (result.error) {
      console.error('[contact] Resend error:', JSON.stringify(result.error));
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    return NextResponse.json(
      { message: 'Message sent successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error processing contact form:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid form data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
