// @vitest-environment node
/**
 * Unit tests for /api/surveys/[slug]/upload (RESP-03).
 *
 * The MIME / size allow-list logic itself is covered in
 * `surveyFileUpload.test.ts` against `validateUploadedFile` directly. Here we
 * confirm the *route* invokes that validator, surfaces its errors, and — most
 * importantly — constructs a tenant-isolated S3 key
 * (`survey-uploads/<clientId>/<surveyId>/<uuid>-<safeName>`). That key pattern
 * is the only thing keeping a leaked URL from one tenant from being twiddled
 * to point at another's bucket prefix, so it's the most security-critical
 * assertion in the whole batch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // db.select(...).from(...).where(...).limit(...) → survey lookup
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const uploadToS3Mock = vi.fn();
  const validateUploadedFileMock = vi.fn();

  return {
    limitMock,
    whereMock,
    fromMock,
    selectMock,
    uploadToS3Mock,
    validateUploadedFileMock,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.selectMock,
  },
}));

vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: mocks.uploadToS3Mock,
}));

// We mock the validator module so route-level branches can be exercised
// without re-testing the MIME table. `MAX_SURVEY_UPLOAD_BYTES` is still
// exported as the real constant — re-exported here for the buffer-cap check.
vi.mock('@/lib/surveys/upload-validation', () => ({
  MAX_SURVEY_UPLOAD_BYTES: 10 * 1024 * 1024,
  validateUploadedFile: mocks.validateUploadedFileMock,
  sanitizeUploadFilename: (name: string | null | undefined) =>
    (name || 'upload').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120),
}));

const {
  limitMock,
  whereMock,
  fromMock,
  selectMock,
  uploadToS3Mock,
  validateUploadedFileMock,
} = mocks;

// Static import — vi.mock is hoisted, so by the time this evaluates the
// mocked `@/lib/db`, `@/lib/s3/upload`, and `@/lib/surveys/upload-validation`
// are already in place. Importing once at module load avoids paying the
// per-test dynamic-import compile cost (which can blow the default 5 s test
// timeout when this file runs alongside the full unit suite).
import { OPTIONS, POST } from '@/app/api/surveys/[slug]/upload/route';

const PARAMS = { params: Promise.resolve({ slug: 'feedback-2026' }) };

beforeEach(() => {
  selectMock.mockClear();
  fromMock.mockClear();
  whereMock.mockClear();
  limitMock.mockReset();
  uploadToS3Mock.mockReset();
  validateUploadedFileMock.mockReset();
});

function buildMultipartRequest(file: File | null) {
  const form = new FormData();
  if (file) form.append('file', file);
  return new Request('http://x/api/surveys/feedback-2026/upload', {
    method: 'POST',
    body: form,
  });
}

describe('OPTIONS /api/surveys/[slug]/upload', () => {
  it('returns 204 with CORS headers (sandboxed iframes set Origin: null)', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('POST /api/surveys/[slug]/upload', () => {
  it('403s when the survey is not active (no validator, no S3 call)', async () => {
    limitMock.mockResolvedValueOnce([
      { id: 7, clientId: 99, status: 'draft' },
    ]);

    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const res = await POST(buildMultipartRequest(file) as never, PARAMS);
    expect(res.status).toBe(403);
    expect(validateUploadedFileMock).not.toHaveBeenCalled();
    expect(uploadToS3Mock).not.toHaveBeenCalled();
  });

  it('404s when the survey slug does not exist', async () => {
    limitMock.mockResolvedValueOnce([]);
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const res = await POST(buildMultipartRequest(file) as never, PARAMS);
    expect(res.status).toBe(404);
    expect(uploadToS3Mock).not.toHaveBeenCalled();
  });

  it('400s when no "file" field is present in the multipart body', async () => {
    limitMock.mockResolvedValueOnce([
      { id: 7, clientId: 99, status: 'active' },
    ]);
    const res = await POST(buildMultipartRequest(null) as never, PARAMS);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { message: string };
    expect(json.message).toMatch(/no file/i);
    expect(uploadToS3Mock).not.toHaveBeenCalled();
  });

  it('surfaces validation errors with the right HTTP status', async () => {
    limitMock.mockResolvedValueOnce([
      { id: 7, clientId: 99, status: 'active' },
    ]);
    validateUploadedFileMock.mockReturnValueOnce({
      ok: false,
      error: 'blocked_type',
      message: 'text/html is blocked',
    });

    const file = new File(['<x>'], 'evil.html', { type: 'text/html' });
    const res = await POST(buildMultipartRequest(file) as never, PARAMS);
    // blocked_type / disallowed_type → 415; too_large → 413; empty → 400.
    expect(res.status).toBe(415);
    const json = (await res.json()) as { message: string };
    expect(json.message).toBe('text/html is blocked');
    expect(uploadToS3Mock).not.toHaveBeenCalled();
  });

  it('maps too_large validator error → 413', async () => {
    limitMock.mockResolvedValueOnce([
      { id: 7, clientId: 99, status: 'active' },
    ]);
    validateUploadedFileMock.mockReturnValueOnce({
      ok: false,
      error: 'too_large',
      message: 'over 10 MB',
    });
    const file = new File(['hello'], 'big.png', { type: 'image/png' });
    const res = await POST(buildMultipartRequest(file) as never, PARAMS);
    expect(res.status).toBe(413);
    expect(uploadToS3Mock).not.toHaveBeenCalled();
  });

  it('uploads to S3 under survey-uploads/<clientId>/<surveyId>/<uuid>-<safeName> (tenant isolation)', async () => {
    limitMock.mockResolvedValueOnce([
      { id: 777, clientId: 42, status: 'active' },
    ]);
    validateUploadedFileMock.mockReturnValueOnce({
      ok: true,
      contentType: 'image/png',
    });
    uploadToS3Mock.mockResolvedValueOnce({
      url: 'https://cdn.example.com/survey-uploads/42/777/xxx-photo.png',
      storedFilename: 'photo.png',
      mimeType: 'image/png',
      fileSize: 5,
    });

    const file = new File(['hello'], 'my photo.png', { type: 'image/png' });
    const res = await POST(buildMultipartRequest(file) as never, PARAMS);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { url: string; filename: string; contentType: string; size: number };
    };
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      url: 'https://cdn.example.com/survey-uploads/42/777/xxx-photo.png',
      contentType: 'image/png',
    });
    // safeName is the sanitized filename produced by the (mocked) sanitizer.
    expect(json.data.filename).toMatch(/^[A-Za-z0-9._-]+$/);

    // SECURITY-CRITICAL: the key the route asks S3 to put MUST start with
    // survey-uploads/<clientId>/<surveyId>/ and contain a uuid prefix on the
    // filename component. Anything looser lets a leaked URL be guessed across
    // tenants. Lock this assertion in tight.
    expect(uploadToS3Mock).toHaveBeenCalledTimes(1);
    const callArgs = uploadToS3Mock.mock.calls[0]!;
    const [buf, , mime, opts] = callArgs as [
      Buffer,
      string,
      string,
      { key: string },
    ];
    expect(Buffer.isBuffer(buf) || buf instanceof Uint8Array).toBe(true);
    expect(mime).toBe('image/png'); // validated MIME, NOT the browser MIME
    expect(opts.key).toMatch(
      /^survey-uploads\/42\/777\/[0-9a-f-]{36}-[A-Za-z0-9._-]+$/,
    );
  });

  it('returns 500 when S3 PUT throws', async () => {
    limitMock.mockResolvedValueOnce([
      { id: 7, clientId: 99, status: 'active' },
    ]);
    validateUploadedFileMock.mockReturnValueOnce({
      ok: true,
      contentType: 'image/png',
    });
    uploadToS3Mock.mockRejectedValueOnce(new Error('s3 down'));

    // Silence the route's `console.error('[survey-upload] s3 put failed', ...)`
    // so it doesn't pollute the test output.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const file = new File(['hello'], 'note.png', { type: 'image/png' });
    const res = await POST(buildMultipartRequest(file) as never, PARAMS);
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});
