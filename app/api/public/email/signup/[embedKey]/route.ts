// POST /api/public/email/signup/[embedKey] — public embeddable signup. Adds a
// subscriber to the form's list and enrolls them into matching list_join
// journeys. No auth (public). Body: { email, name? }.
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { emailSignupForms, emailSubscribers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { onEmailSubscriberJoined } from '@/lib/email/journey-engine';

export async function POST(req: Request, { params }: { params: Promise<{ embedKey: string }> }) {
  const { embedKey } = await params;

  const [form] = await db
    .select()
    .from(emailSignupForms)
    .where(and(eq(emailSignupForms.embedKey, embedKey), eq(emailSignupForms.enabled, true)))
    .limit(1);
  if (!form) return NextResponse.json({ success: false, message: 'Form not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : null;
  if (!email || !email.includes('@')) {
    return NextResponse.json({ success: false, message: 'A valid email is required' }, { status: 400 });
  }

  // Upsert the subscriber (idempotent on the (listId, email) unique index).
  const [inserted] = await db
    .insert(emailSubscribers)
    .values({
      listId: form.listId,
      email,
      name,
      status: 'active',
      unsubscribeToken: randomBytes(24).toString('hex'),
    })
    .onConflictDoNothing({ target: [emailSubscribers.listId, emailSubscribers.email] })
    .returning({ id: emailSubscribers.id });

  let subscriberId = inserted?.id;
  if (!subscriberId) {
    const [existing] = await db
      .select({ id: emailSubscribers.id })
      .from(emailSubscribers)
      .where(and(eq(emailSubscribers.listId, form.listId), eq(emailSubscribers.email, email)))
      .limit(1);
    subscriberId = existing?.id;
  }

  // Enroll into any active list_join journeys for this list (best-effort).
  if (subscriberId && form.clientId != null) {
    try {
      await onEmailSubscriberJoined(subscriberId, form.listId, form.clientId);
    } catch (err) {
      console.error('[email-signup] journey enrollment failed', err);
    }
  }

  if (form.redirectUrl) {
    return NextResponse.redirect(form.redirectUrl, { status: 303 });
  }
  return NextResponse.json({ success: true });
}
