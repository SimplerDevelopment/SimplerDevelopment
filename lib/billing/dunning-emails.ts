// Transactional billing emails sent via Resend.
//
// Three event-driven messages:
//   1. payment_failed  — dunning notice; update your payment method.
//   2. trial_will_end  — trial ending in 3 days; add a card or you'll be billed.
//   3. subscription_suspended — entitlement access suspended due to non-payment /
//                               expiry; update your payment method to re-activate.
//
// All functions are intentionally standalone (no DB imports) so they can be
// tested independently of the webhook handler.

import { resend } from '@/lib/email';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'portal@simplerdevelopment.com';
const BASE_URL = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';
const BILLING_URL = `${BASE_URL}/portal/settings/billing/plans`;

/** Common HTML shell shared by all dunning emails. */
function wrapInShell(headline: string, bodyHtml: string): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="padding:40px 32px;text-align:center;background:#fef2f2;border-bottom:1px solid #fecaca;">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#991b1b;">${headline}</h1>
  </div>
  <div style="padding:32px;">
    ${bodyHtml}
    <div style="text-align:center;margin:32px 0;">
      <a href="${BILLING_URL}"
         style="display:inline-block;padding:14px 32px;background:#2563eb;color:#ffffff;
                text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
        Update Payment Method
      </a>
    </div>
    <p style="font-size:12px;color:#94a3b8;line-height:1.5;">
      If you believe this is a mistake, reply to this email or
      contact <a href="mailto:billing@simplerdevelopment.com" style="color:#2563eb;">billing@simplerdevelopment.com</a>.
    </p>
  </div>
  <div style="padding:24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:12px;color:#94a3b8;">Simpler Development &middot; Design, Dev &amp; Automation</p>
  </div>
</div>`;
}

/**
 * Send a dunning email when an invoice payment fails.
 * Stripe retries automatically — we just notify so the client can fix the card.
 */
export async function sendPaymentFailedEmail(opts: {
  toEmail: string;
  companyName: string | null;
  invoiceUrl?: string | null;
}): Promise<void> {
  const greeting = opts.companyName ? `Hi ${opts.companyName},` : 'Hi there,';
  const invoiceLink = opts.invoiceUrl
    ? `<p style="font-size:14px;color:#334155;"><a href="${opts.invoiceUrl}" style="color:#2563eb;">View the failed invoice</a></p>`
    : '';

  const html = wrapInShell(
    'Action required: payment failed',
    `<p style="font-size:15px;color:#334155;line-height:1.6;">${greeting}</p>
     <p style="font-size:15px;color:#334155;line-height:1.6;">
       A payment for your Simpler Development subscription could not be processed.
       Stripe will retry automatically — but to avoid any interruption to your
       service please update your payment method as soon as possible.
     </p>
     ${invoiceLink}`,
  );

  await resend.emails.send({
    from: `Simpler Development Billing <${FROM_EMAIL}>`,
    to: opts.toEmail,
    subject: 'Action required: your Simpler Development payment failed',
    html,
  });
}

/**
 * Send a trial-ending reminder ~3 days before the trial expires.
 * Driven by customer.subscription.trial_will_end (fires 3 days out by default).
 */
export async function sendTrialWillEndEmail(opts: {
  toEmail: string;
  companyName: string | null;
  trialEndDate: Date;
}): Promise<void> {
  const greeting = opts.companyName ? `Hi ${opts.companyName},` : 'Hi there,';
  const formatted = opts.trialEndDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const html = wrapInShell(
    'Your free trial ends in 3 days',
    `<p style="font-size:15px;color:#334155;line-height:1.6;">${greeting}</p>
     <p style="font-size:15px;color:#334155;line-height:1.6;">
       Your Simpler Development free trial ends on <strong>${formatted}</strong>.
       After that, you'll be billed at your plan's regular rate.
     </p>
     <p style="font-size:15px;color:#334155;line-height:1.6;">
       Make sure a valid payment method is on file so your access continues
       without interruption.
     </p>`,
  );

  await resend.emails.send({
    from: `Simpler Development Billing <${FROM_EMAIL}>`,
    to: opts.toEmail,
    subject: 'Your Simpler Development trial ends in 3 days',
    html,
  });
}

/**
 * Send a service-suspended notice when a subscription moves to a terminal
 * non-paying status (canceled / unpaid / incomplete_expired).
 */
export async function sendSubscriptionSuspendedEmail(opts: {
  toEmail: string;
  companyName: string | null;
  reason: 'canceled' | 'unpaid' | 'incomplete_expired';
}): Promise<void> {
  const greeting = opts.companyName ? `Hi ${opts.companyName},` : 'Hi there,';
  const reasonCopy: Record<typeof opts.reason, string> = {
    canceled: 'your subscription has been canceled',
    unpaid: 'your subscription has been suspended due to an unpaid invoice',
    incomplete_expired: 'your subscription setup was not completed in time',
  };

  const html = wrapInShell(
    'Your Simpler Development access has been suspended',
    `<p style="font-size:15px;color:#334155;line-height:1.6;">${greeting}</p>
     <p style="font-size:15px;color:#334155;line-height:1.6;">
       Unfortunately, ${reasonCopy[opts.reason]}.
       Your portal access has been suspended until payment is resolved.
     </p>
     <p style="font-size:15px;color:#334155;line-height:1.6;">
       Update your payment method and we'll re-activate your account right away.
     </p>`,
  );

  await resend.emails.send({
    from: `Simpler Development Billing <${FROM_EMAIL}>`,
    to: opts.toEmail,
    subject: 'Your Simpler Development access has been suspended',
    html,
  });
}
