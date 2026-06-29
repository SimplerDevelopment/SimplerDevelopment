// @vitest-environment node
/**
 * Unit tests for lib/microsoft/mail-ingest.ts — the Graph-message → CRM-thread
 * mapping. The DB-coupled recorder (lib/crm/inbound-email) is mocked; its DB
 * behavior is covered by the Phase 1 thread e2e + the Gmail ingest test.
 */
import { describe, it, expect, vi } from 'vitest';

const recordMock = vi.fn(async () => ({ matched: true }));
vi.mock('@/lib/crm/inbound-email', () => ({ recordInboundCrmEmail: recordMock }));

const { ingestOutlookMessageIntoCrm } = await import('@/lib/microsoft/mail-ingest');

describe('ingestOutlookMessageIntoCrm', () => {
  it('maps a Graph mail message onto the shared recorder args', async () => {
    recordMock.mockClear();
    await ingestOutlookMessageIntoCrm({
      clientId: 7,
      message: {
        id: 'AAMkADExample',
        conversationId: 'conv-1',
        subject: 'Re: proposal',
        bodyPreview: 'sounds good',
        receivedDateTime: '2026-06-22T10:00:00Z',
        from: { emailAddress: { address: 'Sender@Example.com', name: 'S' } },
        toRecipients: [{ emailAddress: { address: 'me@co.com' } }],
      },
    });
    expect(recordMock).toHaveBeenCalledTimes(1);
    const arg = recordMock.mock.calls[0][0];
    expect(arg.clientId).toBe(7);
    expect(arg.senderEmail).toBe('sender@example.com'); // normalized lowercase
    expect(arg.providerMessageId).toBe('AAMkADExample');
    expect(arg.threadKey).toBe('conv-1');
    expect(arg.toEmail).toBe('me@co.com');
    expect(arg.subject).toBe('Re: proposal');
    expect(arg.snippet).toBe('sounds good');
    expect(arg.sentAt).toBeInstanceOf(Date);
  });

  it('returns matched:false and does not record when the message has no sender', async () => {
    recordMock.mockClear();
    const r = await ingestOutlookMessageIntoCrm({ clientId: 7, message: { id: 'no-from' } });
    expect(r.matched).toBe(false);
    expect(recordMock).not.toHaveBeenCalled();
  });
});
