// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- googleapis mock ----
const mockHistoryList = vi.fn();
const mockMessagesGet = vi.fn();
const mockSetCredentials = vi.fn();
const mockGmailFactory = vi.fn(() => ({
  users: {
    history: {
      list: mockHistoryList,
    },
    messages: {
      get: mockMessagesGet,
    },
  },
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(function OAuth2Mock() {
        return { setCredentials: mockSetCredentials };
      }),
    },
    gmail: mockGmailFactory,
  },
}));

const gmailHistory = await import('@/lib/google/gmail-history');
const { syncHistorySince, HistoryTooOldError } = gmailHistory;

const CREDS = {
  clientId: 'cid',
  clientSecret: 'csec',
  redirectUri: 'http://localhost/cb',
};

const CONN = {
  accessToken: 'at',
  refreshToken: 'rt',
  expiresAt: new Date('2026-01-01T00:00:00Z'),
};

beforeEach(() => {
  mockHistoryList.mockReset();
  mockMessagesGet.mockReset();
  mockSetCredentials.mockReset();
  mockGmailFactory.mockClear();
});

describe('HistoryTooOldError', () => {
  it('has correct name and message', () => {
    const err = new HistoryTooOldError();
    expect(err.name).toBe('HistoryTooOldError');
    expect(err.message).toMatch(/older than Gmail retains/);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('syncHistorySince — OAuth setup', () => {
  it('configures OAuth2 client credentials from the connection', async () => {
    mockHistoryList.mockResolvedValueOnce({ data: { history: [], historyId: 'h1' } });
    await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(mockSetCredentials).toHaveBeenCalledWith({
      access_token: 'at',
      refresh_token: 'rt',
      expiry_date: CONN.expiresAt.getTime(),
    });
  });

  it('creates a gmail client with version v1', async () => {
    mockHistoryList.mockResolvedValueOnce({ data: { history: [] } });
    await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(mockGmailFactory).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v1' }),
    );
  });
});

describe('syncHistorySince — history.list errors', () => {
  it('throws HistoryTooOldError on 404 (code property)', async () => {
    mockHistoryList.mockRejectedValueOnce({ code: 404 });
    await expect(
      syncHistorySince({
        credentials: CREDS,
        connection: CONN,
        startHistoryId: 'h0',
      }),
    ).rejects.toThrow(HistoryTooOldError);
  });

  it('throws HistoryTooOldError on 404 (response.status)', async () => {
    mockHistoryList.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(
      syncHistorySince({
        credentials: CREDS,
        connection: CONN,
        startHistoryId: 'h0',
      }),
    ).rejects.toThrow(HistoryTooOldError);
  });

  it('rethrows non-404 errors', async () => {
    mockHistoryList.mockRejectedValueOnce({ code: 500, message: 'boom' });
    await expect(
      syncHistorySince({
        credentials: CREDS,
        connection: CONN,
        startHistoryId: 'h0',
      }),
    ).rejects.toMatchObject({ code: 500 });
  });

  it('rethrows generic Error objects', async () => {
    mockHistoryList.mockRejectedValueOnce(new Error('network down'));
    await expect(
      syncHistorySince({
        credentials: CREDS,
        connection: CONN,
        startHistoryId: 'h0',
      }),
    ).rejects.toThrow(/network down/);
  });
});

describe('syncHistorySince — pagination + dedup', () => {
  it('returns empty messages when no history events present', async () => {
    mockHistoryList.mockResolvedValueOnce({
      data: { history: [], historyId: 'h-final' },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages).toEqual([]);
    expect(r.latestHistoryId).toBe('h-final');
  });

  it('falls back to startHistoryId when API returns no historyId', async () => {
    mockHistoryList.mockResolvedValueOnce({ data: { history: [] } });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h-start',
    });
    expect(r.latestHistoryId).toBe('h-start');
  });

  it('handles undefined history field gracefully', async () => {
    mockHistoryList.mockResolvedValueOnce({ data: { historyId: 'h1' } });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages).toEqual([]);
  });

  it('walks multiple pages via nextPageToken', async () => {
    mockHistoryList
      .mockResolvedValueOnce({
        data: {
          history: [{ messagesAdded: [{ message: { id: 'm1' } }] }],
          nextPageToken: 'p2',
          historyId: 'h-mid',
        },
      })
      .mockResolvedValueOnce({
        data: {
          history: [{ messagesAdded: [{ message: { id: 'm2' } }] }],
          historyId: 'h-final',
        },
      });
    mockMessagesGet
      .mockResolvedValueOnce({ data: { id: 'm1', threadId: 't1' } })
      .mockResolvedValueOnce({ data: { id: 'm2', threadId: 't2' } });

    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(mockHistoryList).toHaveBeenCalledTimes(2);
    expect(r.messages.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
    expect(r.latestHistoryId).toBe('h-final');
  });

  it('passes pageToken on subsequent history.list calls', async () => {
    mockHistoryList
      .mockResolvedValueOnce({
        data: { history: [], nextPageToken: 'pg-2', historyId: 'a' },
      })
      .mockResolvedValueOnce({
        data: { history: [], historyId: 'b' },
      });
    await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    const firstCall = mockHistoryList.mock.calls[0][0];
    const secondCall = mockHistoryList.mock.calls[1][0];
    expect(firstCall.pageToken).toBeUndefined();
    expect(firstCall.userId).toBe('me');
    expect(firstCall.startHistoryId).toBe('h0');
    expect(firstCall.historyTypes).toEqual(['messageAdded']);
    expect(secondCall.pageToken).toBe('pg-2');
  });

  it('dedupes repeated message IDs across pages', async () => {
    mockHistoryList
      .mockResolvedValueOnce({
        data: {
          history: [{ messagesAdded: [{ message: { id: 'dup' } }] }],
          nextPageToken: 'p2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          history: [
            { messagesAdded: [{ message: { id: 'dup' } }, { message: { id: 'other' } }] },
          ],
          historyId: 'h',
        },
      });
    mockMessagesGet
      .mockResolvedValueOnce({ data: { id: 'dup', threadId: 't' } })
      .mockResolvedValueOnce({ data: { id: 'other', threadId: 't' } });

    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(mockMessagesGet).toHaveBeenCalledTimes(2);
    const ids = r.messages.map((m) => m.id).sort();
    expect(ids).toEqual(['dup', 'other']);
  });

  it('skips messagesAdded entries with no message.id', async () => {
    mockHistoryList.mockResolvedValueOnce({
      data: {
        history: [{ messagesAdded: [{ message: {} }, { other: 'thing' }] }],
        historyId: 'h',
      },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages).toEqual([]);
    expect(mockMessagesGet).not.toHaveBeenCalled();
  });

  it('handles history entries with undefined messagesAdded', async () => {
    mockHistoryList.mockResolvedValueOnce({
      data: {
        history: [{}, { messagesAdded: [{ message: { id: 'm1' } }] }],
        historyId: 'h',
      },
    });
    mockMessagesGet.mockResolvedValueOnce({ data: { id: 'm1', threadId: 't1' } });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages).toHaveLength(1);
  });
});

describe('syncHistorySince — messages.get behavior', () => {
  function singleAddedMessage(id: string) {
    mockHistoryList.mockResolvedValueOnce({
      data: {
        history: [{ messagesAdded: [{ message: { id } }] }],
        historyId: 'h-final',
      },
    });
  }

  it('skips messages that 404 between history.list and messages.get', async () => {
    singleAddedMessage('m-deleted');
    mockMessagesGet.mockRejectedValueOnce({ code: 404 });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages).toEqual([]);
    expect(r.latestHistoryId).toBe('h-final');
  });

  it('rethrows non-404 errors from messages.get', async () => {
    singleAddedMessage('m1');
    mockMessagesGet.mockRejectedValueOnce({ code: 500, message: 'boom' });
    await expect(
      syncHistorySince({
        credentials: CREDS,
        connection: CONN,
        startHistoryId: 'h0',
      }),
    ).rejects.toMatchObject({ code: 500 });
  });

  it('rethrows generic Error from messages.get', async () => {
    singleAddedMessage('m1');
    mockMessagesGet.mockRejectedValueOnce(new Error('network'));
    await expect(
      syncHistorySince({
        credentials: CREDS,
        connection: CONN,
        startHistoryId: 'h0',
      }),
    ).rejects.toThrow(/network/);
  });

  it('skips messages missing id or threadId', async () => {
    singleAddedMessage('m1');
    mockMessagesGet.mockResolvedValueOnce({ data: { id: 'm1' /* no threadId */ } });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages).toEqual([]);
  });

  it('calls messages.get with format=full and userId=me', async () => {
    singleAddedMessage('m1');
    mockMessagesGet.mockResolvedValueOnce({ data: { id: 'm1', threadId: 't1' } });
    await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(mockMessagesGet).toHaveBeenCalledWith({
      userId: 'me',
      id: 'm1',
      format: 'full',
    });
  });
});

describe('syncHistorySince — header + body extraction', () => {
  function pushMessage(msgData: unknown) {
    mockHistoryList.mockResolvedValueOnce({
      data: {
        history: [{ messagesAdded: [{ message: { id: 'm1' } }] }],
        historyId: 'hh',
      },
    });
    mockMessagesGet.mockResolvedValueOnce({ data: msgData });
  }

  it('parses standard headers (From/To/Subject/Message-ID)', async () => {
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        headers: [
          { name: 'From', value: 'alice@example.com' },
          { name: 'To', value: 'bob@example.com' },
          { name: 'Subject', value: 'Hello' },
          { name: 'Message-ID', value: '<abc@mail>' },
        ],
        body: {},
      },
      snippet: 'snip',
      labelIds: ['INBOX'],
      internalDate: '1700000000000',
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    const m = r.messages[0];
    expect(m.from).toBe('alice@example.com');
    expect(m.to).toBe('bob@example.com');
    expect(m.subject).toBe('Hello');
    expect(m.internetMessageId).toBe('abc@mail');
    expect(m.snippet).toBe('snip');
    expect(m.labelIds).toEqual(['INBOX']);
    expect(m.receivedAt).toEqual(new Date(1700000000000));
  });

  it('matches headers case-insensitively', async () => {
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        headers: [
          { name: 'from', value: 'lower@example.com' },
          { name: 'SUBJECT', value: 'UPPER' },
        ],
      },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].from).toBe('lower@example.com');
    expect(r.messages[0].subject).toBe('UPPER');
  });

  it('falls back to gmail-<id> when Message-ID header is missing', async () => {
    pushMessage({
      id: 'mABC',
      threadId: 't1',
      payload: { headers: [] },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].internetMessageId).toBe('gmail-mABC');
  });

  it('falls back to gmail-<id> when Message-ID strips to empty', async () => {
    pushMessage({
      id: 'mXYZ',
      threadId: 't1',
      payload: { headers: [{ name: 'Message-ID', value: '<>' }] },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].internetMessageId).toBe('gmail-mXYZ');
  });

  it('returns empty string for headers not present', async () => {
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: { headers: [{ name: 'From', value: 'x@y' }] },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].to).toBe('');
    expect(r.messages[0].subject).toBe('');
  });

  it('handles missing payload entirely', async () => {
    pushMessage({ id: 'm1', threadId: 't1' });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].from).toBe('');
    expect(r.messages[0].bodyText).toBe('');
  });

  it('extracts text/plain body from top-level payload', async () => {
    const bodyText = 'Hello body!';
    const encoded = Buffer.from(bodyText, 'utf8').toString('base64url');
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        mimeType: 'text/plain',
        body: { data: encoded },
        headers: [],
      },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].bodyText).toBe(bodyText);
  });

  it('extracts text/plain body from nested MIME parts', async () => {
    const bodyText = 'Nested text';
    const encoded = Buffer.from(bodyText, 'utf8').toString('base64url');
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/html', body: { data: 'PGh0bWw-' } },
          { mimeType: 'text/plain', body: { data: encoded } },
        ],
        headers: [],
      },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].bodyText).toBe(bodyText);
  });

  it('walks deep recursion to find text/plain', async () => {
    const bodyText = 'Deep nested';
    const encoded = Buffer.from(bodyText, 'utf8').toString('base64url');
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              {
                mimeType: 'multipart/related',
                parts: [{ mimeType: 'text/plain', body: { data: encoded } }],
              },
            ],
          },
        ],
        headers: [],
      },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].bodyText).toBe(bodyText);
  });

  it('falls back to snippet when no text/plain part exists', async () => {
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        mimeType: 'text/html',
        body: { data: 'PGh0bWw-' },
        headers: [],
      },
      snippet: 'fallback snippet',
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].bodyText).toBe('fallback snippet');
  });

  it('text/plain with empty body.data falls through to snippet', async () => {
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        mimeType: 'text/plain',
        body: { data: '' },
        headers: [],
      },
      snippet: 'snip-fallback',
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].bodyText).toBe('snip-fallback');
  });

  it('returns empty string when neither body nor snippet present', async () => {
    pushMessage({ id: 'm1', threadId: 't1', payload: { headers: [] } });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].bodyText).toBe('');
    expect(r.messages[0].snippet).toBe('');
  });

  it('defaults labelIds to empty array when missing', async () => {
    pushMessage({ id: 'm1', threadId: 't1' });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].labelIds).toEqual([]);
  });

  it('defaults receivedAt to new Date() when internalDate missing', async () => {
    pushMessage({ id: 'm1', threadId: 't1' });
    const before = Date.now();
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    const after = Date.now();
    expect(r.messages[0].receivedAt).toBeInstanceOf(Date);
    const ts = r.messages[0].receivedAt.getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('syncHistorySince — attachment extraction', () => {
  function pushMessage(msgData: unknown) {
    mockHistoryList.mockResolvedValueOnce({
      data: {
        history: [{ messagesAdded: [{ message: { id: 'm1' } }] }],
        historyId: 'hh',
      },
    });
    mockMessagesGet.mockResolvedValueOnce({ data: msgData });
  }

  it('extracts a top-level attachment', async () => {
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        body: { attachmentId: 'att-1', size: 1234 },
        headers: [],
      },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].attachments).toEqual([
      {
        attachmentId: 'att-1',
        filename: 'doc.pdf',
        contentType: 'application/pdf',
        size: 1234,
      },
    ]);
  });

  it('extracts attachments from nested parts', async () => {
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        headers: [],
        parts: [
          { mimeType: 'text/plain', body: { data: '' } },
          {
            filename: 'image.png',
            mimeType: 'image/png',
            body: { attachmentId: 'att-img', size: 5000 },
          },
          {
            parts: [
              {
                filename: 'nested.txt',
                mimeType: 'text/plain',
                body: { attachmentId: 'att-nested', size: 10 },
              },
            ],
          },
        ],
      },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    const atts = r.messages[0].attachments;
    expect(atts).toHaveLength(2);
    expect(atts.map((a) => a.attachmentId).sort()).toEqual(['att-img', 'att-nested']);
  });

  it('skips parts with filename but no attachmentId', async () => {
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        headers: [],
        parts: [
          {
            filename: 'orphan.bin',
            mimeType: 'application/octet-stream',
            body: { size: 0 },
          },
        ],
      },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].attachments).toEqual([]);
  });

  it('skips parts with attachmentId but no filename', async () => {
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        headers: [],
        parts: [
          {
            mimeType: 'image/jpeg',
            body: { attachmentId: 'att-no-name', size: 42 },
          },
        ],
      },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].attachments).toEqual([]);
  });

  it('defaults contentType + size when fields missing', async () => {
    pushMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        headers: [],
        parts: [
          {
            filename: 'mystery',
            body: { attachmentId: 'att-x' },
          },
        ],
      },
    });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].attachments[0]).toEqual({
      attachmentId: 'att-x',
      filename: 'mystery',
      contentType: 'application/octet-stream',
      size: 0,
    });
  });

  it('returns empty attachments when payload missing', async () => {
    pushMessage({ id: 'm1', threadId: 't1' });
    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h0',
    });
    expect(r.messages[0].attachments).toEqual([]);
  });
});

describe('syncHistorySince — full integration shape', () => {
  it('returns a fully-formed FetchedMessage for a typical inbound mail', async () => {
    mockHistoryList.mockResolvedValueOnce({
      data: {
        history: [{ messagesAdded: [{ message: { id: 'msgZ' } }] }],
        historyId: 'h-end',
      },
    });
    const bodyEncoded = Buffer.from('Real body here', 'utf8').toString('base64url');
    mockMessagesGet.mockResolvedValueOnce({
      data: {
        id: 'msgZ',
        threadId: 'thr1',
        snippet: 'preview',
        labelIds: ['INBOX', 'UNREAD'],
        internalDate: '1716000000000',
        payload: {
          headers: [
            { name: 'From', value: 'sender@x.com' },
            { name: 'To', value: 'me@x.com' },
            { name: 'Subject', value: 'Test subject' },
            { name: 'Message-ID', value: '<unique-id@x>' },
          ],
          parts: [
            { mimeType: 'text/plain', body: { data: bodyEncoded } },
            {
              filename: 'attach.csv',
              mimeType: 'text/csv',
              body: { attachmentId: 'a1', size: 999 },
            },
          ],
        },
      },
    });

    const r = await syncHistorySince({
      credentials: CREDS,
      connection: CONN,
      startHistoryId: 'h-start',
    });
    expect(r.latestHistoryId).toBe('h-end');
    expect(r.messages).toHaveLength(1);
    const m = r.messages[0];
    expect(m).toEqual({
      id: 'msgZ',
      threadId: 'thr1',
      internetMessageId: 'unique-id@x',
      from: 'sender@x.com',
      to: 'me@x.com',
      subject: 'Test subject',
      bodyText: 'Real body here',
      receivedAt: new Date(1716000000000),
      labelIds: ['INBOX', 'UNREAD'],
      snippet: 'preview',
      attachments: [
        {
          attachmentId: 'a1',
          filename: 'attach.csv',
          contentType: 'text/csv',
          size: 999,
        },
      ],
    });
  });
});
