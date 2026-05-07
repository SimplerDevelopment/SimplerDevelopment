import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Hidden form field — bots fill it; humans don't. Drop silently with a 200
// so the bot doesn't learn it's been detected. Defense in depth before this
// route gets wired to Resend (TODO below); pair with a CAPTCHA when sending
// is enabled.
const HONEYPOT_FIELD = 'website';

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
    const validatedData = contactSchema.parse(body);

    // TODO: In Phase 7, integrate with Resend to send emails
    // For now, just log the submission

    // Simulate email sending
    // In production, this would use Resend:
    // const { Resend } = require('resend');
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({
    //   from: 'info@simplerdevelopment.com',
    //   to: 'admin@simplerdevelopment.com',
    //   subject: validatedData.subject || 'New Contact Form Submission',
    //   html: `
    //     <h2>New Contact Form Submission</h2>
    //     <p><strong>From:</strong> ${validatedData.name} (${validatedData.email})</p>
    //     <p><strong>Subject:</strong> ${validatedData.subject || 'No subject'}</p>
    //     <p><strong>Message:</strong></p>
    //     <p>${validatedData.message}</p>
    //   `,
    // });

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
