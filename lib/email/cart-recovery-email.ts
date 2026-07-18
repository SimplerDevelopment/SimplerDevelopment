import { resend } from './index';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'store@simplerdevelopment.com';
const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';

/**
 * Send an abandoned-cart recovery email with a one-click recovery link.
 * Best-effort — the caller swallows failures (and stamps recovery_email_sent_at
 * regardless so we don't re-email the same cart every cron tick).
 */
export async function sendCartRecoveryEmail(opts: {
  to: string;
  websiteId: number;
  recoveryToken: string;
  itemCount: number;
  cartValue: number;
}): Promise<void> {
  const link = `${BASE_URL}/api/storefront/${opts.websiteId}/cart/recover?token=${encodeURIComponent(opts.recoveryToken)}`;
  const dollars = (opts.cartValue / 100).toFixed(2);
  await resend.emails.send({
    from: `Your Cart <${FROM_EMAIL}>`,
    to: opts.to,
    subject: 'You left items in your cart',
    html: `<p>You still have ${opts.itemCount} item${opts.itemCount === 1 ? '' : 's'} waiting in your cart (total $${dollars}).</p>
<p><a href="${link}">Return to your cart</a> to finish checking out.</p>`,
  });
}
