// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- googleapis mock ----
const mockChangesGetStartPageToken = vi.fn();
const mockChangesList = vi.fn();
const mockChangesWatch = vi.fn();
const mockChannelsStop = vi.fn();
const mockFilesList = vi.fn();
const mockFilesGet = vi.fn();
const mockFilesExport = vi.fn();
const mockSetCredentials = vi.fn();
const mockDriveFactory = vi.fn(() => ({
  changes: {
    getStartPageToken: mockChangesGetStartPageToken,
    list: mockChangesList,
    watch: mockChangesWatch,
  },
  channels: {
    stop: mockChannelsStop,
  },
  files: {
    list: mockFilesList,
    get: mockFilesGet,
    export: mockFilesExport,
  },
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(function OAuth2Mock() {
        return { setCredentials: mockSetCredentials };
      }),
    },
    drive: mockDriveFactory,
  },
}));

// ---- crypto mock (stable channel id/token) ----
vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    randomUUID: vi.fn(() => 'fixed-uuid-1234'),
    randomBytes: vi.fn(() => ({ toString: () => 'fixed-hex-token' })),
  };
});

// ---- db mock ----
const mockWhere = vi.fn(() => Promise.resolve());
const mockSet = vi.fn(() => ({ where: mockWhere }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));

vi.mock('@/lib/db', () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  googleWorkspaceUserConnections: { id: 'id-column' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ __eq: [col, val] })),
}));

// ---- brain mocks ----
const mockCreateMeetingFromAdapter = vi.fn();
vi.mock('@/lib/brain/meetings', () => ({
  createMeetingFromAdapter: (...args: unknown[]) => mockCreateMeetingFromAdapter(...args),
}));

const mockGetOrCreateBrainProfile = vi.fn();
vi.mock('@/lib/brain/profiles', () => ({
  getOrCreateBrainProfile: (...args: unknown[]) => mockGetOrCreateBrainProfile(...args),
}));

const mockGetMeetingAdapter = vi.fn();
vi.mock('@/lib/brain/meeting-sources', () => ({
  getMeetingAdapter: (...args: unknown[]) => mockGetMeetingAdapter(...args),
}));

const driveChanges = await import('@/lib/google/drive-changes');
const {
  getDriveStartPageToken,
  findMeetRecordingsFolderId,
  syncDriveChangesForConnection,
  subscribeDriveChanges,
  stopDriveChanges,
  backfillMeetRecordingsFolder,
} = driveChanges;

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
  mockChangesGetStartPageToken.mockReset();
  mockChangesList.mockReset();
  mockChangesWatch.mockReset();
  mockChannelsStop.mockReset();
  mockFilesList.mockReset();
  mockFilesGet.mockReset();
  mockFilesExport.mockReset();
  mockSetCredentials.mockReset();
  mockDriveFactory.mockClear();
  mockUpdate.mockClear();
  mockSet.mockClear();
  mockWhere.mockClear();
  mockCreateMeetingFromAdapter.mockReset();
  mockGetOrCreateBrainProfile.mockReset();
  mockGetMeetingAdapter.mockReset();
  mockGetOrCreateBrainProfile.mockResolvedValue({ id: 99, name: 'Brain' });
  mockGetMeetingAdapter.mockReturnValue({ id: 'google_meet_recording' });
});

describe('getDriveStartPageToken', () => {
  it('returns the startPageToken from Drive API', async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({ data: { startPageToken: 'tok-1' } });
    const token = await getDriveStartPageToken({ credentials: CREDS, connection: CONN });
    expect(token).toBe('tok-1');
    expect(mockChangesGetStartPageToken).toHaveBeenCalledWith({});
  });

  it('throws if Drive returns no token', async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({ data: {} });
    await expect(
      getDriveStartPageToken({ credentials: CREDS, connection: CONN }),
    ).rejects.toThrow(/no token/);
  });

  it('configures OAuth2 client credentials from the connection', async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({ data: { startPageToken: 'x' } });
    await getDriveStartPageToken({ credentials: CREDS, connection: CONN });
    expect(mockSetCredentials).toHaveBeenCalledWith({
      access_token: 'at',
      refresh_token: 'rt',
      expiry_date: CONN.expiresAt.getTime(),
    });
  });
});

describe('findMeetRecordingsFolderId', () => {
  it('prefers an owned folder over an unowned one', async () => {
    mockFilesList.mockResolvedValueOnce({
      data: {
        files: [
          { id: 'shared-1', ownedByMe: false },
          { id: 'mine-1', ownedByMe: true },
        ],
      },
    });
    const id = await findMeetRecordingsFolderId({ credentials: CREDS, connection: CONN });
    expect(id).toBe('mine-1');
  });

  it('falls back to first file if none are owned', async () => {
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: 'shared-1', ownedByMe: false }] },
    });
    const id = await findMeetRecordingsFolderId({ credentials: CREDS, connection: CONN });
    expect(id).toBe('shared-1');
  });

  it('returns null when no folder exists', async () => {
    mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
    const id = await findMeetRecordingsFolderId({ credentials: CREDS, connection: CONN });
    expect(id).toBeNull();
  });

  it('returns null when files field is absent', async () => {
    mockFilesList.mockResolvedValueOnce({ data: {} });
    const id = await findMeetRecordingsFolderId({ credentials: CREDS, connection: CONN });
    expect(id).toBeNull();
  });

  it('queries Drive with the correct folder name + mime filter', async () => {
    mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
    await findMeetRecordingsFolderId({ credentials: CREDS, connection: CONN });
    const call = mockFilesList.mock.calls[0][0];
    expect(call.q).toContain("name = 'Meet Recordings'");
    expect(call.q).toContain('application/vnd.google-apps.folder');
    expect(call.q).toContain('trashed = false');
    expect(call.spaces).toBe('drive');
  });
});

describe('syncDriveChangesForConnection', () => {
  const baseConn = {
    ...CONN,
    id: 42,
    driveStartPageToken: 'start-tok',
  };

  it('throws if connection has no driveStartPageToken', async () => {
    await expect(
      syncDriveChangesForConnection({
        credentials: CREDS,
        connection: { ...baseConn, driveStartPageToken: null },
        clientId: 1,
        userId: 2,
        meetRecordingsFolderId: 'folder-x',
      }),
    ).rejects.toThrow(/driveStartPageToken/);
  });

  it('throws if google_meet_recording adapter is not registered', async () => {
    mockGetMeetingAdapter.mockReturnValueOnce(undefined);
    mockChangesList.mockResolvedValueOnce({ data: { changes: [], newStartPageToken: 'np' } });
    await expect(
      syncDriveChangesForConnection({
        credentials: CREDS,
        connection: baseConn,
        clientId: 1,
        userId: 2,
        meetRecordingsFolderId: 'folder-x',
      }),
    ).rejects.toThrow(/adapter not registered/);
  });

  it('no-ops gracefully when folder unknown and findMeetRecordingsFolderId returns null', async () => {
    mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
    mockChangesList.mockResolvedValueOnce({
      data: { newStartPageToken: 'bumped-tok' },
    });
    const result = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: null,
    });
    expect(result.scanned).toBe(0);
    expect(result.ingested).toBe(0);
    expect(result.newPageToken).toBe('bumped-tok');
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ driveStartPageToken: 'bumped-tok' }),
    );
  });

  it('does not persist if folder-less changes.list returns no newStartPageToken', async () => {
    mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
    mockChangesList.mockResolvedValueOnce({ data: {} });
    const result = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: null,
    });
    expect(result.newPageToken).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('skips removed changes', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: {
        changes: [{ fileId: 'f1', removed: true }],
        newStartPageToken: 'np',
      },
    });
    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.scanned).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.ingested).toBe(0);
  });

  it('skips changes with no file', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: { changes: [{ fileId: 'f1', removed: false }], newStartPageToken: 'np' },
    });
    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.skipped).toBe(1);
    expect(r.ingested).toBe(0);
  });

  it('skips trashed files', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: {
        changes: [
          {
            fileId: 'f1',
            removed: false,
            file: {
              id: 'f1',
              trashed: true,
              parents: ['folder-x'],
              mimeType: 'application/vnd.google-apps.document',
            },
          },
        ],
        newStartPageToken: 'np',
      },
    });
    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.skipped).toBe(1);
    expect(r.ingested).toBe(0);
  });

  it('skips files not in the Meet Recordings folder', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: {
        changes: [
          {
            fileId: 'f1',
            file: {
              id: 'f1',
              parents: ['other-folder'],
              mimeType: 'application/vnd.google-apps.document',
            },
          },
        ],
        newStartPageToken: 'np',
      },
    });
    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.skipped).toBe(1);
  });

  it('skips non-Google-Doc files', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: {
        changes: [
          {
            fileId: 'f1',
            file: {
              id: 'f1',
              parents: ['folder-x'],
              mimeType: 'application/pdf',
            },
          },
        ],
        newStartPageToken: 'np',
      },
    });
    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.skipped).toBe(1);
  });

  it('ingests a valid Google Doc in the folder', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: {
        changes: [
          {
            fileId: 'f1',
            file: {
              id: 'f1',
              name: 'My Meeting',
              parents: ['folder-x'],
              mimeType: 'application/vnd.google-apps.document',
            },
          },
        ],
        newStartPageToken: 'np-final',
      },
    });
    mockFilesGet.mockResolvedValueOnce({
      data: {
        id: 'f1',
        name: 'My Meeting',
        createdTime: '2026-01-02T00:00:00Z',
        webViewLink: 'https://docs.google.com/d/f1',
      },
    });
    mockFilesExport.mockResolvedValueOnce({ data: 'Hello world transcript' });
    mockCreateMeetingFromAdapter.mockResolvedValueOnce({ id: 999 });

    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 7,
      userId: 8,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.scanned).toBe(1);
    expect(r.ingested).toBe(1);
    expect(r.skipped).toBe(0);
    expect(r.newPageToken).toBe('np-final');
    expect(mockCreateMeetingFromAdapter).toHaveBeenCalledTimes(1);
    const call = mockCreateMeetingFromAdapter.mock.calls[0][0];
    expect(call.adapterId).toBe('google_meet_recording');
    expect(call.input.fileId).toBe('f1');
    expect(call.input.name).toBe('My Meeting');
    expect(call.input.text).toBe('Hello world transcript');
    expect(call.input.parentFolderId).toBe('folder-x');
    expect(call.ctx.clientId).toBe(7);
    expect(call.ctx.userId).toBe(8);
  });

  it('skips file when getFileMeta returns null (404 between change and read)', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: {
        changes: [
          {
            fileId: 'f1',
            file: {
              id: 'f1',
              parents: ['folder-x'],
              mimeType: 'application/vnd.google-apps.document',
            },
          },
        ],
        newStartPageToken: 'np',
      },
    });
    mockFilesGet.mockRejectedValueOnce(new Error('404 not found'));
    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.skipped).toBe(1);
    expect(r.ingested).toBe(0);
    expect(r.errors).toHaveLength(0);
  });

  it('records error when getFileMeta throws non-404', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: {
        changes: [
          {
            fileId: 'f1',
            file: {
              id: 'f1',
              parents: ['folder-x'],
              mimeType: 'application/vnd.google-apps.document',
            },
          },
        ],
        newStartPageToken: 'np',
      },
    });
    mockFilesGet.mockRejectedValueOnce(new Error('500 server boom'));
    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toEqual({ fileId: 'f1', error: '500 server boom' });
  });

  it('skips files whose exported text is empty', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: {
        changes: [
          {
            fileId: 'f1',
            file: {
              id: 'f1',
              parents: ['folder-x'],
              mimeType: 'application/vnd.google-apps.document',
            },
          },
        ],
        newStartPageToken: 'np',
      },
    });
    mockFilesGet.mockResolvedValueOnce({ data: { id: 'f1', name: 'n' } });
    mockFilesExport.mockResolvedValueOnce({ data: '   \n  ' });
    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.skipped).toBe(1);
    expect(r.ingested).toBe(0);
  });

  it('handles non-string export data via String() coercion', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: {
        changes: [
          {
            fileId: 'f1',
            file: {
              id: 'f1',
              parents: ['folder-x'],
              mimeType: 'application/vnd.google-apps.document',
            },
          },
        ],
        newStartPageToken: 'np',
      },
    });
    mockFilesGet.mockResolvedValueOnce({ data: { id: 'f1', name: 'n' } });
    // Export returns object — gets coerced to '[object Object]' (truthy non-blank)
    mockFilesExport.mockResolvedValueOnce({ data: { foo: 'bar' } });
    mockCreateMeetingFromAdapter.mockResolvedValueOnce({ id: 1 });
    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.ingested).toBe(1);
  });

  it('records error when createMeetingFromAdapter throws', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: {
        changes: [
          {
            fileId: 'f1',
            file: {
              id: 'f1',
              parents: ['folder-x'],
              mimeType: 'application/vnd.google-apps.document',
            },
          },
        ],
        newStartPageToken: 'np',
      },
    });
    mockFilesGet.mockResolvedValueOnce({ data: { id: 'f1', name: 'n' } });
    mockFilesExport.mockResolvedValueOnce({ data: 'transcript content' });
    mockCreateMeetingFromAdapter.mockRejectedValueOnce(new Error('dedup fail'));
    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.errors).toEqual([{ fileId: 'f1', error: 'dedup fail' }]);
    expect(r.ingested).toBe(0);
  });

  it('records error using String() when non-Error is thrown', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: {
        changes: [
          {
            fileId: 'f1',
            file: {
              id: 'f1',
              parents: ['folder-x'],
              mimeType: 'application/vnd.google-apps.document',
            },
          },
        ],
        newStartPageToken: 'np',
      },
    });
    mockFilesGet.mockResolvedValueOnce({ data: { id: 'f1', name: 'n' } });
    mockFilesExport.mockResolvedValueOnce({ data: 'x' });
    mockCreateMeetingFromAdapter.mockRejectedValueOnce('plain string err');
    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.errors[0].error).toBe('plain string err');
  });

  it('paginates through multiple changes.list pages', async () => {
    mockChangesList
      .mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'f1',
              file: {
                id: 'f1',
                parents: ['folder-x'],
                mimeType: 'application/vnd.google-apps.document',
              },
            },
          ],
          nextPageToken: 'page-2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          changes: [{ fileId: 'f2', removed: true }],
          newStartPageToken: 'final-tok',
        },
      });
    mockFilesGet.mockResolvedValueOnce({ data: { id: 'f1', name: 'n' } });
    mockFilesExport.mockResolvedValueOnce({ data: 'text' });
    mockCreateMeetingFromAdapter.mockResolvedValueOnce({ id: 1 });

    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(mockChangesList).toHaveBeenCalledTimes(2);
    expect(r.scanned).toBe(2);
    expect(r.ingested).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.newPageToken).toBe('final-tok');
  });

  it('falls back to startToken when no newStartPageToken is ever returned', async () => {
    mockChangesList.mockResolvedValueOnce({ data: { changes: [] } });
    const r = await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.newPageToken).toBe('start-tok');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ driveStartPageToken: 'start-tok' }),
    );
  });

  it('uses meta.name when file.name absent; falls back to default when both absent', async () => {
    mockChangesList.mockResolvedValueOnce({
      data: {
        changes: [
          {
            fileId: 'f1',
            file: {
              id: 'f1',
              parents: ['folder-x'],
              mimeType: 'application/vnd.google-apps.document',
            },
          },
        ],
        newStartPageToken: 'np',
      },
    });
    mockFilesGet.mockResolvedValueOnce({ data: { id: 'f1' } }); // no name on meta
    mockFilesExport.mockResolvedValueOnce({ data: 'text' });
    mockCreateMeetingFromAdapter.mockResolvedValueOnce({});
    await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    const arg = mockCreateMeetingFromAdapter.mock.calls[0][0];
    expect(arg.input.name).toBe('(Meet recording)');
    expect(arg.input.createdTime).toBeNull();
    expect(arg.input.webViewLink).toBeNull();
  });

  it('uses cached folderId when provided and never calls files.list', async () => {
    mockChangesList.mockResolvedValueOnce({ data: { changes: [], newStartPageToken: 'np' } });
    await syncDriveChangesForConnection({
      credentials: CREDS,
      connection: baseConn,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'cached-folder',
    });
    expect(mockFilesList).not.toHaveBeenCalled();
  });
});

describe('subscribeDriveChanges', () => {
  const baseConn = { ...CONN, driveStartPageToken: 'start' };

  it('returns channel info on success', async () => {
    const exp = String(Date.now() + 1000);
    mockChangesWatch.mockResolvedValueOnce({
      data: { resourceId: 'res-1', expiration: exp },
    });
    const result = await subscribeDriveChanges({
      credentials: CREDS,
      connection: baseConn,
      webhookAddress: 'https://example.com/webhook',
    });
    expect(result.channelId).toBe('fixed-uuid-1234');
    expect(result.channelToken).toBe('fixed-hex-token');
    expect(result.resourceId).toBe('res-1');
    expect(result.expiration).toBeInstanceOf(Date);
    expect(result.expiration.getTime()).toBe(parseInt(exp, 10));
  });

  it('passes pageToken + webhook config to drive.changes.watch', async () => {
    mockChangesWatch.mockResolvedValueOnce({
      data: { resourceId: 'r', expiration: String(Date.now() + 1000) },
    });
    await subscribeDriveChanges({
      credentials: CREDS,
      connection: baseConn,
      webhookAddress: 'https://hook.example.com',
      ttlMs: 5000,
    });
    const call = mockChangesWatch.mock.calls[0][0];
    expect(call.pageToken).toBe('start');
    expect(call.requestBody.type).toBe('web_hook');
    expect(call.requestBody.address).toBe('https://hook.example.com');
    expect(call.requestBody.id).toBe('fixed-uuid-1234');
    expect(call.requestBody.token).toBe('fixed-hex-token');
    // expiration is roughly Date.now()+5000 as a string
    expect(typeof call.requestBody.expiration).toBe('string');
  });

  it('defaults ttl to 1 day when not provided', async () => {
    const before = Date.now();
    mockChangesWatch.mockResolvedValueOnce({
      data: { resourceId: 'r', expiration: String(Date.now() + 1000) },
    });
    await subscribeDriveChanges({
      credentials: CREDS,
      connection: baseConn,
      webhookAddress: 'https://h',
    });
    const expStr = mockChangesWatch.mock.calls[0][0].requestBody.expiration;
    const expNum = parseInt(expStr, 10);
    expect(expNum).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(expNum).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000 + 1000);
  });

  it('throws if Drive returns no resourceId', async () => {
    mockChangesWatch.mockResolvedValueOnce({ data: { expiration: '12345' } });
    await expect(
      subscribeDriveChanges({
        credentials: CREDS,
        connection: baseConn,
        webhookAddress: 'https://h',
      }),
    ).rejects.toThrow(/no resourceId/);
  });

  it('throws if Drive returns non-numeric expiration', async () => {
    mockChangesWatch.mockResolvedValueOnce({
      data: { resourceId: 'r', expiration: 'not-a-number' },
    });
    await expect(
      subscribeDriveChanges({
        credentials: CREDS,
        connection: baseConn,
        webhookAddress: 'https://h',
      }),
    ).rejects.toThrow(/non-numeric expiration/);
  });

  it('throws if Drive returns undefined expiration', async () => {
    mockChangesWatch.mockResolvedValueOnce({ data: { resourceId: 'r' } });
    await expect(
      subscribeDriveChanges({
        credentials: CREDS,
        connection: baseConn,
        webhookAddress: 'https://h',
      }),
    ).rejects.toThrow(/non-numeric expiration/);
  });
});

describe('stopDriveChanges', () => {
  it('calls channels.stop with id + resourceId', async () => {
    mockChannelsStop.mockResolvedValueOnce({});
    await stopDriveChanges({
      credentials: CREDS,
      connection: CONN,
      channelId: 'ch-1',
      resourceId: 'res-1',
    });
    expect(mockChannelsStop).toHaveBeenCalledWith({
      requestBody: { id: 'ch-1', resourceId: 'res-1' },
    });
  });

  it('swallows 404-style errors as idempotent', async () => {
    mockChannelsStop.mockRejectedValueOnce(new Error('404 not found'));
    await expect(
      stopDriveChanges({
        credentials: CREDS,
        connection: CONN,
        channelId: 'ch-1',
        resourceId: 'res-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('swallows "gone" errors as idempotent', async () => {
    mockChannelsStop.mockRejectedValueOnce(new Error('channel gone'));
    await expect(
      stopDriveChanges({
        credentials: CREDS,
        connection: CONN,
        channelId: 'c',
        resourceId: 'r',
      }),
    ).resolves.toBeUndefined();
  });

  it('rethrows non-404 errors', async () => {
    mockChannelsStop.mockRejectedValueOnce(new Error('500 boom'));
    await expect(
      stopDriveChanges({
        credentials: CREDS,
        connection: CONN,
        channelId: 'c',
        resourceId: 'r',
      }),
    ).rejects.toThrow(/500/);
  });

  it('handles non-Error throws via String()', async () => {
    mockChannelsStop.mockRejectedValueOnce('plain 404 string');
    await expect(
      stopDriveChanges({
        credentials: CREDS,
        connection: CONN,
        channelId: 'c',
        resourceId: 'r',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('backfillMeetRecordingsFolder', () => {
  it('throws if adapter not registered', async () => {
    mockGetMeetingAdapter.mockReturnValueOnce(undefined);
    await expect(
      backfillMeetRecordingsFolder({
        credentials: CREDS,
        connection: CONN,
        clientId: 1,
        userId: 2,
        meetRecordingsFolderId: 'folder-x',
      }),
    ).rejects.toThrow(/adapter not registered/);
  });

  it('ingests files from the folder', async () => {
    mockFilesList.mockResolvedValueOnce({
      data: {
        files: [
          { id: 'a', name: 'Aaa', createdTime: '2026-01-01', webViewLink: 'https://a' },
          { id: 'b', name: 'Bbb', createdTime: '2026-01-02', webViewLink: 'https://b' },
        ],
        nextPageToken: undefined,
      },
    });
    mockFilesExport.mockResolvedValue({ data: 'transcript' });
    mockCreateMeetingFromAdapter.mockResolvedValue({});

    const r = await backfillMeetRecordingsFolder({
      credentials: CREDS,
      connection: CONN,
      clientId: 7,
      userId: 9,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.scanned).toBe(2);
    expect(r.ingested).toBe(2);
    expect(r.skipped).toBe(0);
    expect(mockCreateMeetingFromAdapter).toHaveBeenCalledTimes(2);
    const firstCall = mockCreateMeetingFromAdapter.mock.calls[0][0];
    expect(firstCall.input.parentFolderId).toBe('folder-x');
    expect(firstCall.ctx.clientId).toBe(7);
  });

  it('skips files with empty exported text', async () => {
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: 'a', name: 'A' }] },
    });
    mockFilesExport.mockResolvedValueOnce({ data: '   ' });
    const r = await backfillMeetRecordingsFolder({
      credentials: CREDS,
      connection: CONN,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.skipped).toBe(1);
    expect(r.ingested).toBe(0);
  });

  it('skips files with no id', async () => {
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ name: 'orphan' }] },
    });
    const r = await backfillMeetRecordingsFolder({
      credentials: CREDS,
      connection: CONN,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.skipped).toBe(1);
    expect(r.scanned).toBe(0);
  });

  it('records error when createMeetingFromAdapter throws', async () => {
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: 'a', name: 'A' }] },
    });
    mockFilesExport.mockResolvedValueOnce({ data: 'text' });
    mockCreateMeetingFromAdapter.mockRejectedValueOnce(new Error('boom'));
    const r = await backfillMeetRecordingsFolder({
      credentials: CREDS,
      connection: CONN,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.errors).toEqual([{ fileId: 'a', error: 'boom' }]);
  });

  it('records error using String() for non-Error throws', async () => {
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: 'a', name: 'A' }] },
    });
    mockFilesExport.mockResolvedValueOnce({ data: 'text' });
    mockCreateMeetingFromAdapter.mockRejectedValueOnce({ weird: 'object' });
    const r = await backfillMeetRecordingsFolder({
      credentials: CREDS,
      connection: CONN,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].fileId).toBe('a');
  });

  it('uses default name when file.name absent', async () => {
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: 'a' }] },
    });
    mockFilesExport.mockResolvedValueOnce({ data: 'text' });
    mockCreateMeetingFromAdapter.mockResolvedValueOnce({});
    await backfillMeetRecordingsFolder({
      credentials: CREDS,
      connection: CONN,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    const arg = mockCreateMeetingFromAdapter.mock.calls[0][0];
    expect(arg.input.name).toBe('(Meet recording)');
    expect(arg.input.createdTime).toBeNull();
    expect(arg.input.webViewLink).toBeNull();
  });

  it('respects the default limit of 50', async () => {
    // Make 3 pages of 100 each, but limit (default 50) should clamp pageSize
    // First page returns no nextPageToken so loop ends after 1 fetch.
    mockFilesList.mockResolvedValueOnce({
      data: { files: [], nextPageToken: undefined },
    });
    const r = await backfillMeetRecordingsFolder({
      credentials: CREDS,
      connection: CONN,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    expect(r.scanned).toBe(0);
    expect(mockFilesList.mock.calls[0][0].pageSize).toBe(50); // min(100, 50-0)
  });

  it('paginates while under limit, stops when nextPageToken absent', async () => {
    mockFilesList
      .mockResolvedValueOnce({
        data: {
          files: [{ id: 'a', name: 'A' }],
          nextPageToken: 'p2',
        },
      })
      .mockResolvedValueOnce({
        data: { files: [{ id: 'b', name: 'B' }] },
      });
    mockFilesExport.mockResolvedValue({ data: 'text' });
    mockCreateMeetingFromAdapter.mockResolvedValue({});
    const r = await backfillMeetRecordingsFolder({
      credentials: CREDS,
      connection: CONN,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
      limit: 10,
    });
    expect(mockFilesList).toHaveBeenCalledTimes(2);
    expect(r.ingested).toBe(2);
  });

  it('caps ingestion at limit even if folder has more files', async () => {
    mockFilesList.mockResolvedValueOnce({
      data: {
        files: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
          { id: 'c', name: 'C' },
        ],
      },
    });
    mockFilesExport.mockResolvedValue({ data: 'text' });
    mockCreateMeetingFromAdapter.mockResolvedValue({});
    const r = await backfillMeetRecordingsFolder({
      credentials: CREDS,
      connection: CONN,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
      limit: 2,
    });
    expect(r.scanned).toBe(2);
    expect(r.ingested).toBe(2);
  });

  it('stops paging once collected.length >= limit', async () => {
    mockFilesList.mockResolvedValueOnce({
      data: {
        files: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
        nextPageToken: 'p2',
      },
    });
    mockFilesExport.mockResolvedValue({ data: 'text' });
    mockCreateMeetingFromAdapter.mockResolvedValue({});
    await backfillMeetRecordingsFolder({
      credentials: CREDS,
      connection: CONN,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
      limit: 2,
    });
    // Loop condition `collected.length < limit` fails after first page even
    // though nextPageToken exists.
    expect(mockFilesList).toHaveBeenCalledTimes(1);
  });

  it('passes correct query for folder + mime filter', async () => {
    mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
    await backfillMeetRecordingsFolder({
      credentials: CREDS,
      connection: CONN,
      clientId: 1,
      userId: 2,
      meetRecordingsFolderId: 'folder-x',
    });
    const call = mockFilesList.mock.calls[0][0];
    expect(call.q).toContain("'folder-x' in parents");
    expect(call.q).toContain('trashed = false');
    expect(call.q).toContain('application/vnd.google-apps.document');
    expect(call.orderBy).toBe('createdTime');
  });
});
