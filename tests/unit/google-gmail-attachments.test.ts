// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- googleapis mock ----
const mockAttachmentsGet = vi.fn();
const mockSetCredentials = vi.fn();
const mockGmailFactory = vi.fn(() => ({
  users: {
    messages: {
      attachments: {
        get: mockAttachmentsGet,
      },
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

// ---- uploadToS3 mock ----
const mockUploadToS3 = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => mockUploadToS3(...args),
}));

const { fetchAndUploadGmailAttachments } = await import(
  '@/lib/google/gmail-attachments'
);

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

const MAX_BYTES = 25 * 1024 * 1024;

beforeEach(() => {
  mockAttachmentsGet.mockReset();
  mockSetCredentials.mockReset();
  mockGmailFactory.mockClear();
  mockUploadToS3.mockReset();
  // silence intentional console output
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('fetchAndUploadGmailAttachments', () => {
  it('returns empty array immediately when refs is empty (no auth/Gmail calls)', async () => {
    const out = await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm1',
      refs: [],
    });
    expect(out).toEqual([]);
    expect(mockSetCredentials).not.toHaveBeenCalled();
    expect(mockGmailFactory).not.toHaveBeenCalled();
    expect(mockAttachmentsGet).not.toHaveBeenCalled();
    expect(mockUploadToS3).not.toHaveBeenCalled();
  });

  it('configures OAuth2 client credentials from the connection', async () => {
    mockAttachmentsGet.mockResolvedValueOnce({
      data: { data: Buffer.from('hi').toString('base64url') },
    });
    mockUploadToS3.mockResolvedValueOnce({
      url: '/api/media/proxy/media/u-1.txt',
      mimeType: 'text/plain',
      fileSize: 2,
    });
    await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm1',
      refs: [
        {
          attachmentId: 'a1',
          filename: 'f.txt',
          contentType: 'text/plain',
          size: 2,
        },
      ],
    });
    expect(mockSetCredentials).toHaveBeenCalledWith({
      access_token: 'at',
      refresh_token: 'rt',
      expiry_date: CONN.expiresAt.getTime(),
    });
    expect(mockGmailFactory).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v1' }),
    );
  });

  it('uploads a single attachment and returns metadata with the storage key', async () => {
    const raw = 'hello world';
    mockAttachmentsGet.mockResolvedValueOnce({
      data: { data: Buffer.from(raw).toString('base64url') },
    });
    mockUploadToS3.mockResolvedValueOnce({
      url: '/api/media/proxy/media/abc.txt',
      mimeType: 'text/plain',
      fileSize: raw.length,
    });

    const out = await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'msg-7',
      refs: [
        {
          attachmentId: 'aid-1',
          filename: 'hello.txt',
          contentType: 'text/plain',
          size: raw.length,
        },
      ],
    });

    expect(out).toEqual([
      {
        key: 'media/abc.txt',
        filename: 'hello.txt',
        contentType: 'text/plain',
        size: raw.length,
      },
    ]);

    // Verify Gmail API call shape
    expect(mockAttachmentsGet).toHaveBeenCalledWith({
      userId: 'me',
      messageId: 'msg-7',
      id: 'aid-1',
    });

    // Verify uploadToS3 was given a decoded Buffer
    const [bufArg, nameArg, mimeArg] = mockUploadToS3.mock.calls[0];
    expect(Buffer.isBuffer(bufArg)).toBe(true);
    expect(bufArg.toString('utf8')).toBe(raw);
    expect(nameArg).toBe('hello.txt');
    expect(mimeArg).toBe('text/plain');
  });

  it('strips the /api/media/proxy/ prefix from the upload url to derive the key', async () => {
    mockAttachmentsGet.mockResolvedValueOnce({
      data: { data: Buffer.from('x').toString('base64url') },
    });
    mockUploadToS3.mockResolvedValueOnce({
      url: '/api/media/proxy/media/nested/path.png',
      mimeType: 'image/png',
      fileSize: 1,
    });
    const out = await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm',
      refs: [
        {
          attachmentId: 'a',
          filename: 'x.png',
          contentType: 'image/png',
          size: 1,
        },
      ],
    });
    expect(out[0].key).toBe('media/nested/path.png');
  });

  it('leaves the url unchanged as the key when it does not start with the proxy prefix', async () => {
    mockAttachmentsGet.mockResolvedValueOnce({
      data: { data: Buffer.from('x').toString('base64url') },
    });
    mockUploadToS3.mockResolvedValueOnce({
      url: 'media/already-bare.png',
      mimeType: 'image/png',
      fileSize: 1,
    });
    const out = await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm',
      refs: [
        {
          attachmentId: 'a',
          filename: 'x.png',
          contentType: 'image/png',
          size: 1,
        },
      ],
    });
    expect(out[0].key).toBe('media/already-bare.png');
  });

  it('uses contentType + fileSize from the S3 result, not the ref', async () => {
    mockAttachmentsGet.mockResolvedValueOnce({
      data: { data: Buffer.from('abc').toString('base64url') },
    });
    mockUploadToS3.mockResolvedValueOnce({
      url: '/api/media/proxy/media/k',
      mimeType: 'application/octet-stream', // S3 sniffed/normalized
      fileSize: 999, // independent of ref.size
    });
    const out = await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm',
      refs: [
        {
          attachmentId: 'a',
          filename: 'mystery.bin',
          contentType: 'text/plain', // ref says one thing
          size: 3, // ref says one thing
        },
      ],
    });
    expect(out[0].contentType).toBe('application/octet-stream');
    expect(out[0].size).toBe(999);
  });

  it('skips attachments larger than the 25 MB cap and never calls Gmail or S3 for them', async () => {
    const out = await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm',
      refs: [
        {
          attachmentId: 'big',
          filename: 'big.bin',
          contentType: 'application/octet-stream',
          size: MAX_BYTES + 1,
        },
      ],
    });
    expect(out).toEqual([]);
    expect(mockAttachmentsGet).not.toHaveBeenCalled();
    expect(mockUploadToS3).not.toHaveBeenCalled();
  });

  it('allows attachments exactly at the 25 MB cap (boundary)', async () => {
    mockAttachmentsGet.mockResolvedValueOnce({
      data: { data: Buffer.from('x').toString('base64url') },
    });
    mockUploadToS3.mockResolvedValueOnce({
      url: '/api/media/proxy/media/k',
      mimeType: 'application/octet-stream',
      fileSize: 1,
    });
    const out = await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm',
      refs: [
        {
          attachmentId: 'a',
          filename: 'boundary.bin',
          contentType: 'application/octet-stream',
          size: MAX_BYTES, // not > MAX, so it proceeds
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(mockAttachmentsGet).toHaveBeenCalledTimes(1);
  });

  it('skips attachment when Gmail returns no data field', async () => {
    mockAttachmentsGet.mockResolvedValueOnce({ data: {} });
    const out = await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm',
      refs: [
        {
          attachmentId: 'a',
          filename: 'empty.txt',
          contentType: 'text/plain',
          size: 1,
        },
      ],
    });
    expect(out).toEqual([]);
    expect(mockUploadToS3).not.toHaveBeenCalled();
  });

  it('skips attachment when Gmail attachments.get throws (auth/404 etc.)', async () => {
    mockAttachmentsGet.mockRejectedValueOnce(new Error('403 forbidden'));
    const out = await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm',
      refs: [
        {
          attachmentId: 'a',
          filename: 'oops.txt',
          contentType: 'text/plain',
          size: 1,
        },
      ],
    });
    expect(out).toEqual([]);
    expect(mockUploadToS3).not.toHaveBeenCalled();
  });

  it('skips attachment when uploadToS3 throws but continues with later refs', async () => {
    mockAttachmentsGet
      .mockResolvedValueOnce({
        data: { data: Buffer.from('one').toString('base64url') },
      })
      .mockResolvedValueOnce({
        data: { data: Buffer.from('two').toString('base64url') },
      });
    mockUploadToS3
      .mockRejectedValueOnce(new Error('S3 down'))
      .mockResolvedValueOnce({
        url: '/api/media/proxy/media/two-key',
        mimeType: 'text/plain',
        fileSize: 3,
      });

    const out = await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm',
      refs: [
        {
          attachmentId: 'a1',
          filename: 'one.txt',
          contentType: 'text/plain',
          size: 3,
        },
        {
          attachmentId: 'a2',
          filename: 'two.txt',
          contentType: 'text/plain',
          size: 3,
        },
      ],
    });

    expect(out).toEqual([
      {
        key: 'media/two-key',
        filename: 'two.txt',
        contentType: 'text/plain',
        size: 3,
      },
    ]);
  });

  it('continues past a too-large attachment to upload the next valid one', async () => {
    mockAttachmentsGet.mockResolvedValueOnce({
      data: { data: Buffer.from('small').toString('base64url') },
    });
    mockUploadToS3.mockResolvedValueOnce({
      url: '/api/media/proxy/media/small-key',
      mimeType: 'text/plain',
      fileSize: 5,
    });

    const out = await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm',
      refs: [
        {
          attachmentId: 'big',
          filename: 'big.bin',
          contentType: 'application/octet-stream',
          size: MAX_BYTES + 1,
        },
        {
          attachmentId: 'a',
          filename: 'small.txt',
          contentType: 'text/plain',
          size: 5,
        },
      ],
    });

    expect(out).toEqual([
      {
        key: 'media/small-key',
        filename: 'small.txt',
        contentType: 'text/plain',
        size: 5,
      },
    ]);
    // Gmail/S3 only called for the small one
    expect(mockAttachmentsGet).toHaveBeenCalledTimes(1);
    expect(mockUploadToS3).toHaveBeenCalledTimes(1);
  });

  it('uploads multiple attachments and preserves order', async () => {
    mockAttachmentsGet
      .mockResolvedValueOnce({
        data: { data: Buffer.from('a').toString('base64url') },
      })
      .mockResolvedValueOnce({
        data: { data: Buffer.from('bb').toString('base64url') },
      })
      .mockResolvedValueOnce({
        data: { data: Buffer.from('ccc').toString('base64url') },
      });
    mockUploadToS3
      .mockResolvedValueOnce({
        url: '/api/media/proxy/media/k1',
        mimeType: 'text/plain',
        fileSize: 1,
      })
      .mockResolvedValueOnce({
        url: '/api/media/proxy/media/k2',
        mimeType: 'text/plain',
        fileSize: 2,
      })
      .mockResolvedValueOnce({
        url: '/api/media/proxy/media/k3',
        mimeType: 'text/plain',
        fileSize: 3,
      });

    const out = await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm',
      refs: [
        {
          attachmentId: 'a1',
          filename: 'one.txt',
          contentType: 'text/plain',
          size: 1,
        },
        {
          attachmentId: 'a2',
          filename: 'two.txt',
          contentType: 'text/plain',
          size: 2,
        },
        {
          attachmentId: 'a3',
          filename: 'three.txt',
          contentType: 'text/plain',
          size: 3,
        },
      ],
    });

    expect(out.map((u) => u.key)).toEqual(['media/k1', 'media/k2', 'media/k3']);
    expect(out.map((u) => u.filename)).toEqual([
      'one.txt',
      'two.txt',
      'three.txt',
    ]);
  });

  it('decodes base64url (URL-safe alphabet) correctly when computing the buffer', async () => {
    // Bytes 0xfb 0xff produce '-_8' in base64url (vs '+/8=' in std base64).
    // If the function used 'base64' instead of 'base64url', the '-' and '_'
    // would be silently mangled.
    const bytes = Buffer.from([0xfb, 0xff]);
    const encoded = bytes.toString('base64url');
    expect(encoded).toContain('-');
    expect(encoded).toContain('_');

    mockAttachmentsGet.mockResolvedValueOnce({ data: { data: encoded } });
    let receivedBuf: Buffer | null = null;
    mockUploadToS3.mockImplementationOnce((buf: Buffer) => {
      receivedBuf = buf;
      return Promise.resolve({
        url: '/api/media/proxy/media/k',
        mimeType: 'application/octet-stream',
        fileSize: buf.length,
      });
    });

    await fetchAndUploadGmailAttachments({
      credentials: CREDS,
      connection: CONN,
      messageId: 'm',
      refs: [
        {
          attachmentId: 'a',
          filename: 'bin.dat',
          contentType: 'application/octet-stream',
          size: 2,
        },
      ],
    });

    expect(receivedBuf).not.toBeNull();
    expect(Buffer.compare(receivedBuf!, bytes)).toBe(0);
  });
});
