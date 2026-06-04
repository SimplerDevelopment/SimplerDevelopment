import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getResend } from '@/lib/email';

// Hidden form field — bots fill it; humans don't. Drop silently with a 200
// so the bot doesn't learn it's been detected. Pair with a CAPTCHA if abuse
// shows up.
const HONEYPOT_FIELD = 'website';

// Where contact-form submissions are delivered.
const CONTACT_INBOX = 'info@simplerdevelopment.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'SimplerDevelopment <noreply@simplerdevelopment.com>';

/** Escape user-supplied text before interpolating into the email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

    // No Resend key configured (e.g. local dev): log and succeed so the form
    // still works without a mail provider.
    if (!process.env.RESEND_API_KEY) {
      console.warn('[contact] RESEND_API_KEY not set — submission logged, not emailed:', {
        name, email, subject,
      });
      return NextResponse.json({ message: 'Message sent successfully' }, { status: 200 });
    }

    const result = await getResend().emails.send({
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
