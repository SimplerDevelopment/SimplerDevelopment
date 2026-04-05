import { resend } from './index';

const BASE_URL = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'bookings@simplerdevelopment.com';

interface BookingEmailData {
  guestName: string;
  guestEmail: string;
  pageTitle: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  cancelToken: string;
  bookingSlug: string;
  duration: number;
  meetingLink?: string | null;
}

function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
  }).format(date);
}

function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
}

function bookingEmailHtml(content: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Powered by SimplerDevelopment
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send booking confirmation email to the guest.
 */
export async function sendGuestConfirmation(data: BookingEmailData): Promise<void> {
  const cancelUrl = `${BASE_URL}/book/cancel?token=${data.cancelToken}`;
  const formattedStart = formatDateTime(data.startTime, data.timezone);
  const formattedEnd = formatTime(data.endTime, data.timezone);

  const html = bookingEmailHtml(`
    <h1 style="margin:0 0 8px;font-size:24px;color:#111827;">Booking Confirmed</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Your appointment has been scheduled.</p>

    <table role="presentation" width="100%" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">What</p>
          <p style="margin:0;font-size:16px;color:#111827;font-weight:600;">${data.pageTitle}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">When</p>
          <p style="margin:0;font-size:16px;color:#111827;font-weight:600;">${formattedStart}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${data.duration} minutes (until ${formattedEnd})</p>
        </td>
      </tr>
      ${data.meetingLink ? `<tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Where</p>
          <a href="${data.meetingLink}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Join Video Call</a>
        </td>
      </tr>` : ''}
    </table>

    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
      Need to make changes?
      <a href="${cancelUrl}" style="color:#2563eb;text-decoration:none;">Cancel or reschedule</a>
    </p>
  `, `Your ${data.pageTitle} appointment is confirmed for ${formattedStart}`);

  try {
    await resend.emails.send({
      from: `Booking Confirmation <${FROM_EMAIL}>`,
      to: data.guestEmail,
      subject: `Confirmed: ${data.pageTitle}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send guest confirmation email:', err);
  }
}

/**
 * Send booking notification email to the host (client).
 */
export async function sendHostNotification(
  hostEmail: string,
  data: BookingEmailData,
): Promise<void> {
  const formattedStart = formatDateTime(data.startTime, data.timezone);
  const formattedEnd = formatTime(data.endTime, data.timezone);
  const portalUrl = `${BASE_URL}/portal/tools/booking`;

  const html = bookingEmailHtml(`
    <h1 style="margin:0 0 8px;font-size:24px;color:#111827;">New Booking</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">You have a new appointment scheduled.</p>

    <table role="presentation" width="100%" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Guest</p>
          <p style="margin:0;font-size:16px;color:#111827;font-weight:600;">${data.guestName}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${data.guestEmail}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">What</p>
          <p style="margin:0;font-size:16px;color:#111827;font-weight:600;">${data.pageTitle}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">When</p>
          <p style="margin:0;font-size:16px;color:#111827;font-weight:600;">${formattedStart}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${data.duration} minutes (until ${formattedEnd})</p>
        </td>
      </tr>
      ${data.meetingLink ? `<tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Video Call</p>
          <a href="${data.meetingLink}" style="color:#2563eb;text-decoration:none;font-size:14px;">${data.meetingLink}</a>
        </td>
      </tr>` : ''}
    </table>

    <a href="${portalUrl}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">View in Portal</a>
  `, `New booking: ${data.guestName} — ${data.pageTitle}`);

  try {
    await resend.emails.send({
      from: `SimplerDevelopment <${FROM_EMAIL}>`,
      to: hostEmail,
      subject: `New Booking: ${data.guestName} — ${data.pageTitle}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send host notification email:', err);
  }
}

/**
 * Send cancellation confirmation to the guest.
 */
export async function sendCancellationEmail(
  guestEmail: string,
  guestName: string,
  pageTitle: string,
  startTime: Date,
  timezone: string,
  bookingSlug: string,
): Promise<void> {
  const formattedStart = formatDateTime(startTime, timezone);
  const rebookUrl = `${BASE_URL}/book/${bookingSlug}`;

  const html = bookingEmailHtml(`
    <h1 style="margin:0 0 8px;font-size:24px;color:#111827;">Booking Cancelled</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Your appointment has been cancelled.</p>

    <table role="presentation" width="100%" style="background:#fef2f2;border-radius:8px;padding:20px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Cancelled</p>
          <p style="margin:0;font-size:16px;color:#111827;font-weight:600;">${pageTitle}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${formattedStart}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
      Want to book a new time?
      <a href="${rebookUrl}" style="color:#2563eb;text-decoration:none;">Schedule again</a>
    </p>
  `, `Your ${pageTitle} appointment has been cancelled`);

  try {
    await resend.emails.send({
      from: `Booking Update <${FROM_EMAIL}>`,
      to: guestEmail,
      subject: `Cancelled: ${pageTitle} — ${formattedStart}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send cancellation email:', err);
  }
}
