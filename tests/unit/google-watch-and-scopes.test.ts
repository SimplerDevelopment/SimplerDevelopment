// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- googleapis mock ----
const mockUsersWatch = vi.fn();
const mockUsersStop = vi.fn();
const mockSetCredentials = vi.fn();
const mockOAuth2Ctor = vi.fn(function OAuth2Mock() {
  // @ts-expect-error – mock ctor
  this.setCredentials = mockSetCredentials;
});
const mockGmailFactory = vi.fn(() => ({
  users: {
    watch: mockUsersWatch,
    stop: mockUsersStop,
  },
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: mockOAuth2Ctor,
    },
    gmail: mockGmailFactory,
  },
}));

const watchModule = await import('@/lib/google/gmail-watch');
const scopesModule = await import('@/lib/google/scopes');
const { startGmailWatch, stopGmailWatch } = watchModule;
const { SCOPES, scopesForSurfaces } = scopesModule;

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
  mockUsersWatch.mockReset();
  mockUsersStop.mockReset();
  mockSetCredentials.mockReset();
  mockOAuth2Ctor.mockClear();
  mockGmailFactory.mockClear();
});

// ---------------------------------------------------------------------------
// scopes.ts
// ---------------------------------------------------------------------------

describe('lib/google/scopes — SCOPES table', () => {
  it('always contains identity scopes', () => {
    expect(SCOPES.identity).toEqual([
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ]);
  });

  it('has gmail readonly scope', () => {
    expect(SCOPES.gmail).toEqual(['https://www.googleapis.com/auth/gmail.readonly']);
  });

  it('has calendar readonly + events readonly scopes', () => {
    expect(SCOPES.calendar).toContain('https://www.googleapis.com/auth/calendar.readonly');
    expect(SCOPES.calendar).toContain(
      'https://www.googleapis.com/auth/calendar.events.readonly',
    );
  });

  it('has drive full + metadata readonly scopes', () => {
    expect(SCOPES.drive).toContain('https://www.googleapis.com/auth/drive');
    expect(SCOPES.drive).toContain('https://www.googleapis.com/auth/drive.metadata.readonly');
  });

  it('has contacts readonly scope', () => {
    expect(SCOPES.contacts).toEqual(['https://www.googleapis.com/auth/contacts.readonly']);
  });

  it('declares the canonical set of surfaces', () => {
    expect(Object.keys(SCOPES).sort()).toEqual(
      ['identity', 'gmail', 'calendar', 'drive', 'contacts'].sort(),
    );
  });
});

describe('lib/google/scopes — scopesForSurfaces()', () => {
  it('returns identity scopes when surfaces is empty', () => {
    const out = scopesForSurfaces([]);
    expect(out).toEqual([...SCOPES.identity]);
  });

  it('always includes identity scopes even when not requested', () => {
    const out = scopesForSurfaces(['gmail']);
    for (const s of SCOPES.identity) {
      expect(out).toContain(s);
    }
  });

  it('appends gmail scopes when gmail surface is included', () => {
    const out = scopesForSurfaces(['gmail']);
    expect(out).toContain('https://www.googleapis.com/auth/gmail.readonly');
  });

  it('merges multiple surfaces without duplicates', () => {
    const out = scopesForSurfaces(['gmail', 'calendar', 'drive']);
    // No duplicates: a Set of the output has the same size as the array.
    expect(new Set(out).size).toBe(out.length);
    // Includes everything from each surface.
    for (const s of [...SCOPES.identity, ...SCOPES.gmail, ...SCOPES.calendar, ...SCOPES.drive]) {
      expect(out).toContain(s);
    }
  });

  it('dedupes when identity surface is explicitly requested', () => {
    const out = scopesForSurfaces(['identity', 'identity', 'gmail']);
    expect(new Set(out).size).toBe(out.length);
  });

  it('returns a plain array (not a Set)', () => {
    const out = scopesForSurfaces(['contacts']);
    expect(Array.isArray(out)).toBe(true);
  });

  it('returns a fresh array each call (no shared mutation)', () => {
    const a = scopesForSurfaces(['gmail']);
    const b = scopesForSurfaces(['gmail']);
    expect(a).not.toBe(b);
    a.push('mutated');
    expect(b).not.toContain('mutated');
  });
});

// ---------------------------------------------------------------------------
// gmail-watch.ts
// ---------------------------------------------------------------------------

describe('lib/google/gmail-watch — startGmailWatch', () => {
  it('builds an OAuth2 client with the supplied credentials', async () => {
    mockUsersWatch.mockResolvedValueOnce({
      data: { historyId: 'h1', expiration: '1700000000000' },
    });
    await startGmailWatch({
      credentials: CREDS,
      connection: CONN,
      topicName: 'projects/x/topics/t',
    });
    expect(mockOAuth2Ctor).toHaveBeenCalledWith(
      CREDS.clientId,
      CREDS.clientSecret,
      CREDS.redirectUri,
    );
  });

  it('feeds the connection tokens into setCredentials', async () => {
    mockUsersWatch.mockResolvedValueOnce({
      data: { historyId: 'h1', expiration: '1700000000000' },
    });
    await startGmailWatch({
      credentials: CREDS,
      connection: CONN,
      topicName: 'projects/x/topics/t',
    });
    expect(mockSetCredentials).toHaveBeenCalledWith({
      access_token: 'at',
      refresh_token: 'rt',
      expiry_date: CONN.expiresAt.getTime(),
    });
  });

  it('creates a Gmail v1 client', async () => {
    mockUsersWatch.mockResolvedValueOnce({
      data: { historyId: 'h1', expiration: '1700000000000' },
    });
    await startGmailWatch({
      credentials: CREDS,
      connection: CONN,
      topicName: 'projects/x/topics/t',
    });
    expect(mockGmailFactory).toHaveBeenCalledWith(expect.objectContaining({ version: 'v1' }));
  });

  it('defaults labelIds to ["INBOX"] with include action', async () => {
    mockUsersWatch.mockResolvedValueOnce({
      data: { historyId: 'h1', expiration: '1700000000000' },
    });
    await startGmailWatch({
      credentials: CREDS,
      connection: CONN,
      topicName: 'projects/x/topics/t',
    });
    expect(mockUsersWatch).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        topicName: 'projects/x/topics/t',
        labelIds: ['INBOX'],
        labelFilterAction: 'include',
      },
    });
  });

  it('honors caller-supplied labelIds', async () => {
    mockUsersWatch.mockResolvedValueOnce({
      data: { historyId: 'h1', expiration: '1700000000000' },
    });
    await startGmailWatch({
      credentials: CREDS,
      connection: CONN,
      topicName: 'projects/x/topics/t',
      labelIds: ['CATEGORY_PERSONAL', 'IMPORTANT'],
    });
    expect(mockUsersWatch).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          labelIds: ['CATEGORY_PERSONAL', 'IMPORTANT'],
        }),
      }),
    );
  });

  it('returns historyId and parses expiration string to Date', async () => {
    const expirationMs = 1_700_000_000_000;
    mockUsersWatch.mockResolvedValueOnce({
      data: { historyId: 'h42', expiration: String(expirationMs) },
    });
    const r = await startGmailWatch({
      credentials: CREDS,
      connection: CONN,
      topicName: 'projects/x/topics/t',
    });
    expect(r.historyId).toBe('h42');
    expect(r.expiration).toBeInstanceOf(Date);
    expect(r.expiration.getTime()).toBe(expirationMs);
  });

  it('throws when historyId is missing', async () => {
    mockUsersWatch.mockResolvedValueOnce({ data: { expiration: '1700000000000' } });
    await expect(
      startGmailWatch({
        credentials: CREDS,
        connection: CONN,
        topicName: 'projects/x/topics/t',
      }),
    ).rejects.toThrow(/missing historyId or expiration/);
  });

  it('throws when expiration is missing', async () => {
    mockUsersWatch.mockResolvedValueOnce({ data: { historyId: 'h1' } });
    await expect(
      startGmailWatch({
        credentials: CREDS,
        connection: CONN,
        topicName: 'projects/x/topics/t',
      }),
    ).rejects.toThrow(/missing historyId or expiration/);
  });

  it('throws when expiration is unparseable', async () => {
    mockUsersWatch.mockResolvedValueOnce({
      data: { historyId: 'h1', expiration: 'not-a-number' },
    });
    await expect(
      startGmailWatch({
        credentials: CREDS,
        connection: CONN,
        topicName: 'projects/x/topics/t',
      }),
    ).rejects.toThrow(/missing historyId or expiration/);
  });

  it('propagates errors from gmail.users.watch', async () => {
    mockUsersWatch.mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(
      startGmailWatch({
        credentials: CREDS,
        connection: CONN,
        topicName: 'projects/x/topics/t',
      }),
    ).rejects.toThrow(/quota exceeded/);
  });
});

describe('lib/google/gmail-watch — stopGmailWatch', () => {
  it('builds an OAuth2 client with the supplied credentials', async () => {
    mockUsersStop.mockResolvedValueOnce({ data: {} });
    await stopGmailWatch({ credentials: CREDS, connection: CONN });
    expect(mockOAuth2Ctor).toHaveBeenCalledWith(
      CREDS.clientId,
      CREDS.clientSecret,
      CREDS.redirectUri,
    );
  });

  it('feeds connection tokens into setCredentials', async () => {
    mockUsersStop.mockResolvedValueOnce({ data: {} });
    await stopGmailWatch({ credentials: CREDS, connection: CONN });
    expect(mockSetCredentials).toHaveBeenCalledWith({
      access_token: 'at',
      refresh_token: 'rt',
      expiry_date: CONN.expiresAt.getTime(),
    });
  });

  it('calls gmail.users.stop with userId=me', async () => {
    mockUsersStop.mockResolvedValueOnce({ data: {} });
    await stopGmailWatch({ credentials: CREDS, connection: CONN });
    expect(mockUsersStop).toHaveBeenCalledWith({ userId: 'me' });
  });

  it('resolves to void', async () => {
    mockUsersStop.mockResolvedValueOnce({ data: {} });
    const r = await stopGmailWatch({ credentials: CREDS, connection: CONN });
    expect(r).toBeUndefined();
  });

  it('propagates errors from gmail.users.stop', async () => {
    mockUsersStop.mockRejectedValueOnce(new Error('not authorized'));
    await expect(
      stopGmailWatch({ credentials: CREDS, connection: CONN }),
    ).rejects.toThrow(/not authorized/);
  });
});
