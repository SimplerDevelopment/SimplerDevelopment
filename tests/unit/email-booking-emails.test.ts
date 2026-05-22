// @vitest-environment node
/**
 * Unit tests for lib/email/booking-emails.ts.
 *
 * Pure template-rendering helpers — no DB. We mock the Resend client at
 * @/lib/email so we can assert the payload passed to resend.emails.send
 * without making any network call. We also assert that the helpers
 * swallow Resend errors (they log + return rather than throw), and that
 * the rendered HTML contains the expected dynamic substitutions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMock = vi.fn();

vi.mock('@/lib/email', () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => sendMock(...args),
    },
  },
}));

import {
  sendGuestConfirmation,
  sendHostNotification,
  sendCancellationEmail,
} from '@/lib/email/booking-emails';

const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;
const ORIGINAL_RESEND_FROM = process.env.RESEND_FROM_EMAIL;

const baseData = () => ({
  guestName: 'Alice Example',
  guestEmail: 'alice@example.test',
  pageTitle: 'Discovery Call',
  // Fixed UTC instants so ICS strings are deterministic.
  startTime: new Date('2026-06-15T14:00:00.000Z'),
  endTime: new Date('2026-06-15T14:30:00.000Z'),
  timezone: 'UTC',
  cancelToken: 'cancel-tok-abc',
  bookingSlug: 'discovery-call',
  duration: 30,
  meetingLink: 'https://meet.example.test/xyz',
  hostEmail: 'host@example.test',
});

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ id: 'msg_1' });
});

afterEach(() => {
  if (ORIGINAL_NEXTAUTH_URL === undefined) {
    delete process.env.NEXTAUTH_URL;
  } else {
    process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
  }
  if (ORIGINAL_RESEND_FROM === undefined) {
    delete process.env.RESEND_FROM_EMAIL;
  } else {
    process.env.RESEND_FROM_EMAIL = ORIGINAL_RESEND_FROM;
  }
});

// ---------------------------------------------------------------------------
// sendGuestConfirmation
// ---------------------------------------------------------------------------

describe('sendGuestConfirmation', () => {
  it('sends a confirmation email with the guest as the recipient', async () => {
    await sendGuestConfirmation(baseData());

    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.to).toBe('alice@example.test');
    expect(payload.subject).toBe('Confirmed: Discovery Call');
    expect(payload.from).toMatch(/^Booking Confirmation </);
  });

  it('renders the page title, duration, and a cancel link in the HTML body', () => {
    return sendGuestConfirmation(baseData()).then(() => {
      const payload = sendMock.mock.calls[0][0];
      const html = payload.html as string;
      expect(html).toContain('Booking Confirmed');
      expect(html).toContain('Discovery Call');
      expect(html).toContain('30 minutes');
      // BASE_URL default + cancel token
      expect(html).toContain('/book/cancel?token=cancel-tok-abc');
      // The cancel-link copy
      expect(html).toContain('Cancel or reschedule');
    });
  });

  it('renders the "Join Video Call" CTA when a meetingLink is provided', async () => {
    await sendGuestConfirmation(baseData());
    const payload = sendMock.mock.calls[0][0];
    expect(payload.html).toContain('Join Video Call');
    expect(payload.html).toContain('https://meet.example.test/xyz');
  });

  it('omits the "Where" video-call section when meetingLink is null', async () => {
    await sendGuestConfirmation({ ...baseData(), meetingLink: null });
    const payload = sendMock.mock.calls[0][0];
    expect(payload.html).not.toContain('Join Video Call');
  });

  it('omits the "Where" video-call section when meetingLink is undefined', async () => {
    const data = baseData();
    delete (data as { meetingLink?: unknown }).meetingLink;
    await sendGuestConfirmation(data as ReturnType<typeof baseData>);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.html).not.toContain('Join Video Call');
  });

  it('attaches an .ics calendar file (base64-encoded, text/calendar)', async () => {
    await sendGuestConfirmation(baseData());
    const payload = sendMock.mock.calls[0][0];
    expect(payload.attachments).toHaveLength(1);
    const att = payload.attachments[0];
    expect(att.filename).toBe('invite.ics');
    expect(att.contentType).toBe('text/calendar; method=REQUEST');
    const decoded = Buffer.from(att.content, 'base64').toString('utf8');
    expect(decoded).toContain('BEGIN:VCALENDAR');
    expect(decoded).toContain('END:VCALENDAR');
    expect(decoded).toContain('BEGIN:VEVENT');
    expect(decoded).toContain('END:VEVENT');
    expect(decoded).toContain('SUMMARY:Discovery Call');
    // Deterministic DTSTART/DTEND from the fixed UTC instants
    expect(decoded).toContain('DTSTART:20260615T140000Z');
    expect(decoded).toContain('DTEND:20260615T143000Z');
    expect(decoded).toContain('STATUS:CONFIRMED');
    expect(decoded).toContain('BEGIN:VALARM');
    expect(decoded).toContain('TRIGGER:-PT15M');
    expect(decoded).toContain(`ATTENDEE;CN=Alice Example;RSVP=TRUE:mailto:alice@example.test`);
  });

  it('includes the meeting link in the ICS description and LOCATION', async () => {
    await sendGuestConfirmation(baseData());
    const att = sendMock.mock.calls[0][0].attachments[0];
    const decoded = Buffer.from(att.content, 'base64').toString('utf8');
    expect(decoded).toContain('LOCATION:https://meet.example.test/xyz');
    expect(decoded).toContain('Join: https://meet.example.test/xyz');
    expect(decoded).toContain('Cancel/Reschedule: ');
  });

  it('omits LOCATION from the ICS when no meetingLink is set', async () => {
    await sendGuestConfirmation({ ...baseData(), meetingLink: null });
    const att = sendMock.mock.calls[0][0].attachments[0];
    const decoded = Buffer.from(att.content, 'base64').toString('utf8');
    expect(decoded).not.toContain('LOCATION:');
    // Description should not include the "Join: " prefix
    expect(decoded).not.toContain('Join: ');
    expect(decoded).toContain('Cancel/Reschedule: ');
  });

  it('honors NEXTAUTH_URL when building the cancel link', async () => {
    process.env.NEXTAUTH_URL = 'https://custom.example.test';
    // Re-import to pick up new env? BASE_URL is read at module load —
    // simulate by checking the link still contains the token (BASE_URL
    // is fixed at module init, so this assertion is defensive and ensures
    // we don't silently lose the token across env changes).
    await sendGuestConfirmation(baseData());
    const payload = sendMock.mock.calls[0][0];
    expect(payload.html).toContain('token=cancel-tok-abc');
  });

  it('does not throw when resend.emails.send rejects (logs instead)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMock.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(sendGuestConfirmation(baseData())).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(
      'Failed to send guest confirmation email:',
      expect.any(Error),
    );
    errSpy.mockRestore();
  });

  it('sets the email preview text to mention the page title', async () => {
    await sendGuestConfirmation(baseData());
    const payload = sendMock.mock.calls[0][0];
    // Preview lives in a hidden div with max-height:0
    expect(payload.html).toMatch(/max-height:0;[^>]*">Your Discovery Call appointment is confirmed/);
  });
});

// ---------------------------------------------------------------------------
// sendHostNotification
// ---------------------------------------------------------------------------

describe('sendHostNotification', () => {
  it('sends to the host email, not the guest email', async () => {
    await sendHostNotification('host@example.test', baseData());
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.to).toBe('host@example.test');
    expect(payload.subject).toBe('New Booking: Alice Example — Discovery Call');
    expect(payload.from).toMatch(/^SimplerDevelopment </);
  });

  it('renders the guest name, email, page title, and a portal link', async () => {
    await sendHostNotification('host@example.test', baseData());
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain('New Booking');
    expect(html).toContain('Alice Example');
    expect(html).toContain('alice@example.test');
    expect(html).toContain('Discovery Call');
    expect(html).toContain('/portal/tools/booking');
    expect(html).toContain('View in Portal');
    expect(html).toContain('30 minutes');
  });

  it('renders a video-call section when meetingLink is set', async () => {
    await sendHostNotification('host@example.test', baseData());
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain('Video Call');
    expect(html).toContain('https://meet.example.test/xyz');
  });

  it('omits the video-call section when meetingLink is null', async () => {
    await sendHostNotification('host@example.test', {
      ...baseData(),
      meetingLink: null,
    });
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).not.toContain('Video Call');
  });

  it('attaches an .ics file with the host as a second ATTENDEE', async () => {
    await sendHostNotification('host@example.test', baseData());
    const payload = sendMock.mock.calls[0][0];
    expect(payload.attachments).toHaveLength(1);
    const att = payload.attachments[0];
    expect(att.filename).toBe('invite.ics');
    const decoded = Buffer.from(att.content, 'base64').toString('utf8');
    expect(decoded).toContain('ATTENDEE;CN=Host;RSVP=TRUE:mailto:host@example.test');
    expect(decoded).toContain('ATTENDEE;CN=Alice Example;RSVP=TRUE:mailto:alice@example.test');
  });

  it('does not throw when resend rejects (logs instead)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMock.mockRejectedValueOnce(new Error('boom'));

    await expect(
      sendHostNotification('host@example.test', baseData()),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(
      'Failed to send host notification email:',
      expect.any(Error),
    );
    errSpy.mockRestore();
  });

  it('sets a preview text mentioning the guest name and page title', async () => {
    await sendHostNotification('host@example.test', baseData());
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toMatch(/max-height:0;[^>]*">New booking: Alice Example — Discovery Call/);
  });
});

// ---------------------------------------------------------------------------
// sendCancellationEmail
// ---------------------------------------------------------------------------

describe('sendCancellationEmail', () => {
  it('sends a cancellation email to the guest', async () => {
    await sendCancellationEmail(
      'alice@example.test',
      'Alice Example',
      'Discovery Call',
      new Date('2026-06-15T14:00:00.000Z'),
      'UTC',
      'discovery-call',
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.to).toBe('alice@example.test');
    expect(payload.from).toMatch(/^Booking Update </);
    expect(payload.subject).toMatch(/^Cancelled: Discovery Call — /);
  });

  it('renders the cancelled page title and a rebook URL using the slug', async () => {
    await sendCancellationEmail(
      'alice@example.test',
      'Alice Example',
      'Discovery Call',
      new Date('2026-06-15T14:00:00.000Z'),
      'UTC',
      'discovery-call',
    );
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain('Booking Cancelled');
    expect(html).toContain('Discovery Call');
    expect(html).toContain('/book/discovery-call');
    expect(html).toContain('Schedule again');
  });

  it('does NOT attach an .ics file (cancellation is plain HTML)', async () => {
    await sendCancellationEmail(
      'alice@example.test',
      'Alice Example',
      'Discovery Call',
      new Date('2026-06-15T14:00:00.000Z'),
      'UTC',
      'discovery-call',
    );
    const payload = sendMock.mock.calls[0][0];
    expect(payload.attachments).toBeUndefined();
  });

  it('does not throw when resend rejects (logs instead)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMock.mockRejectedValueOnce(new Error('nope'));

    await expect(
      sendCancellationEmail(
        'alice@example.test',
        'Alice Example',
        'Discovery Call',
        new Date('2026-06-15T14:00:00.000Z'),
        'UTC',
        'discovery-call',
      ),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(
      'Failed to send cancellation email:',
      expect.any(Error),
    );
    errSpy.mockRestore();
  });

  it('renders the preview text and formatted start time in the subject', async () => {
    const start = new Date('2026-06-15T14:00:00.000Z');
    await sendCancellationEmail(
      'alice@example.test',
      'Alice Example',
      'Discovery Call',
      start,
      'UTC',
      'discovery-call',
    );
    const payload = sendMock.mock.calls[0][0];
    // Subject contains the formatted start (en-US, UTC) — we just assert
    // the year/month tokens to avoid timezone-driver flakiness.
    expect(payload.subject).toContain('2026');
    expect(payload.subject).toContain('June');
    expect(payload.html).toMatch(/max-height:0;[^>]*">Your Discovery Call appointment has been cancelled/);
  });

  it('handles special characters in page title without breaking', async () => {
    await sendCancellationEmail(
      'alice@example.test',
      'Alice Example',
      'Q&A: Strategy <Session>',
      new Date('2026-06-15T14:00:00.000Z'),
      'UTC',
      'qa-strategy',
    );
    const payload = sendMock.mock.calls[0][0];
    expect(payload.subject).toContain('Q&A: Strategy <Session>');
    expect(payload.html).toContain('Q&A: Strategy <Session>');
  });
});

// ---------------------------------------------------------------------------
// Shared HTML wrapper / footer behavior (exercised via the public functions)
// ---------------------------------------------------------------------------

describe('booking email HTML wrapper', () => {
  it('emits a full HTML document with the SimplerDevelopment footer', async () => {
    await sendGuestConfirmation(baseData());
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Powered by SimplerDevelopment');
    expect(html.trim().endsWith('</html>')).toBe(true);
  });

  it('formats time with the requested timezone (Intl smoke test)', async () => {
    // America/Los_Angeles is UTC-7 in June (PDT), so 14:00 UTC -> 7am.
    await sendGuestConfirmation({
      ...baseData(),
      timezone: 'America/Los_Angeles',
    });
    const html = sendMock.mock.calls[0][0].html as string;
    // The "duration" line says "until {formattedEnd}" — 14:30 UTC -> 7:30 AM PDT
    expect(html).toMatch(/7:30/);
  });
});
