/**
 * POST /api/portal/tools/pitch-decks/upload-html — single .html or .zip upload.
 *
 * Contract:
 *   - 401 when unauthenticated
 *   - 400 when no file present
 *   - 400 + reject when file ext is neither html nor zip
 *   - .html upload: pre-existing single-file path still works (regression)
 *   - .zip upload: index resolved, all entries uploaded under one S3 prefix,
 *     html-embed block url points to the index, image is reachable at the
 *     proxy-relative path matching its in-archive position
 *   - Reject zip with `..` path traversal entry → 400
 *   - Reject zip exceeding total uncompressed cap → 400
 *   - Reject zip with disallowed extension (e.g. `.exe`) → 400
 *
 * uploadToS3 is mocked: tests assert what the route calls into S3 with,
 * not actual S3 round-trips.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import JSZip from 'jszip';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: vi.fn(
    async (
      _buf: Buffer,
      name: string,
      mime: string,
      options?: { key?: string }
    ) => {
      const key = options?.key ?? `media/mock-${name}`;
      const storedFilename = key.replace(/^media\//, '');
      return {
        url: `/api/media/proxy/${key}`,
        storedFilename,
        mimeType: mime,
        fileSize: _buf.length,
      };
    }
  ),
}));

import { auth } from '@/lib/auth';
import { uploadToS3 } from '@/lib/s3/upload';
const mockedAuth = auth as unknown as Mock;
const mockedUpload = uploadToS3 as unknown as Mock;

import { NextRequest } from 'next/server';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function enablePitchDeckService(ctx: TenantCtx): Promise<void> {
  const sql = getTestSql();
  const slug = `pitch-decks-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Pitch Decks', ${slug}, 'pitch-decks', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

function buildRequest(filename: string, mime: string, bytes: Buffer): NextRequest {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  return new NextRequest('http://localhost:3000/', {
    method: 'POST',
    body: form as unknown as BodyInit,
  });
}

async function invoke<T = unknown>(req: NextRequest): Promise<{ status: number; data: T | null }> {
  const route = await import('@/app/api/portal/tools/pitch-decks/upload-html/route');
  const res = await (route.POST as unknown as (r: Request) => Promise<Response>)(req);
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? ((await res.json()) as T) : null;
  return { status: res.status, data };
}

interface UploadResponse {
  success: boolean;
  message?: string;
  data?: { id: number; slug: string };
}

describe('POST /api/portal/tools/pitch-decks/upload-html @upload @pitch @html-embed', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    mockedUpload.mockClear();
    A = await sessionForNewClientUser('pitch-upload');
    await enablePitchDeckService(A);
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const req = buildRequest('x.html', 'text/html', Buffer.from('<p>hi</p>'));
    const res = await invoke(req);
    expect(res.status).toBe(401);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('400 when no file field is present', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const form = new FormData();
    const req = new NextRequest('http://localhost:3000/', { method: 'POST', body: form as unknown as BodyInit });
    const res = await invoke(req);
    expect(res.status).toBe(400);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('400 when file extension is neither html nor zip', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const req = buildRequest('evil.exe', 'application/octet-stream', Buffer.from([1, 2, 3]));
    const res = await invoke(req);
    expect(res.status).toBe(400);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('regression: single .html upload still works (existing behavior unchanged)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const html = Buffer.from('<!doctype html><html><body><h1>Hi</h1></body></html>');
    const req = buildRequest('deck.html', 'text/html', html);
    const res = await invoke<UploadResponse>(req);
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data?.id).toBeGreaterThan(0);
    expect(mockedUpload).toHaveBeenCalledTimes(1);
    // Single-file path: no `key` override, so default uuid-named key.
    const opts = mockedUpload.mock.calls[0][3];
    expect(opts?.key).toBeUndefined();
  });

  it('zip upload: all entries uploaded under shared prefix, block url points to index', async () => {
    mockedAuth.mockResolvedValue(A.session);

    const zip = new JSZip();
    zip.file('index.html', '<!doctype html><html><body><img src="logos/x.png"></body></html>');
    zip.file('logos/x.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    zip.file('styles/main.css', 'body{margin:0}');
    const zipBuffer = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));

    const req = buildRequest('deck.zip', 'application/zip', zipBuffer);
    const res = await invoke<UploadResponse>(req);
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);

    expect(mockedUpload).toHaveBeenCalledTimes(3);
    const calls = mockedUpload.mock.calls.map((c) => ({ name: c[1] as string, key: (c[3] as { key?: string } | undefined)?.key as string | undefined }));
    // All keys share the same `media/<uuid>/` prefix.
    const keys = calls.map((c) => c.key!);
    expect(keys.every((k) => /^media\/[0-9a-f-]{36}\//.test(k))).toBe(true);
    const prefixes = new Set(keys.map((k) => k.split('/').slice(0, 2).join('/')));
    expect(prefixes.size).toBe(1);

    // Image lives at the relative position the html refs.
    const prefix = [...prefixes][0];
    expect(keys).toContain(`${prefix}/index.html`);
    expect(keys).toContain(`${prefix}/logos/x.png`);
    expect(keys).toContain(`${prefix}/styles/main.css`);

    // Verify the deck row's block url points at the index.
    const sql = getTestSql();
    const [row] = await sql<{ slides: unknown }[]>`
      SELECT slides FROM ${sql(TEST_SCHEMA)}.pitch_decks WHERE id = ${res.data!.data!.id}
    `;
    const slides = row.slides as Array<{ blocks: Array<{ type: string; url: string }> }>;
    const block = slides[0]?.blocks[0];
    expect(block?.type).toBe('html-embed');
    expect(block?.url).toBe(`/api/media/proxy/${prefix}/index.html`);
  });

  it('zip upload: rejects path-traversal entry (absolute /etc/passwd) with 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    // JSZip normalizes ".." on both authoring and load (it strips them out),
    // so we craft a malicious zip via a hex-encoded archive that contains a
    // leading-slash absolute path. Generated via Python `zipfile` with
    // ZIP_STORED and the entries: index.html + /etc/passwd. Our validator
    // rejects entries starting with `/` regardless of `..` segments.
    const maliciousZipHex =
      '504b03041400000000002f62a55c1f871b600d0000000d0000000a000000696e6465782e68746' +
      'd6c3c68746d6c3e3c2f68746d6c3e504b03041400000000002f62a55c7e5304d9050000000500' +
      '00000b0000002f6574632f70617373776470776e6564504b010214031400000000002f62a55c1' +
      'f871b600d0000000d0000000a0000000000000000000000800100000000696e6465782e68746d' +
      '6c504b010214031400000000002f62a55c7e5304d905000000050000000b00000000000000000' +
      '000008001350000002f6574632f706173737764504b0506000000000200020071000000630000' +
      '000000';
    const zipBuffer = Buffer.from(maliciousZipHex, 'hex');

    const req = buildRequest('bad.zip', 'application/zip', zipBuffer);
    const res = await invoke<UploadResponse>(req);
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/illegal path/i);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('zip upload: rejects disallowed extension (.exe) with 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const zip = new JSZip();
    zip.file('index.html', '<html></html>');
    zip.file('payload.exe', Buffer.from([0x4d, 0x5a]));
    const zipBuffer = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));

    const req = buildRequest('bad.zip', 'application/zip', zipBuffer);
    const res = await invoke<UploadResponse>(req);
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/disallowed file type/i);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('zip upload: rejects zip with no html entry with 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const zip = new JSZip();
    zip.file('logos/x.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const zipBuffer = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
    const req = buildRequest('bad.zip', 'application/zip', zipBuffer);
    const res = await invoke<UploadResponse>(req);
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/no \.html/i);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('zip upload: rejects oversize zip (post-form-data total cap) with 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    // 11MB single file inside the zip — over the per-file 10MB cap.
    const big = Buffer.alloc(11 * 1024 * 1024, 0x61);
    const zip = new JSZip();
    zip.file('index.html', '<html></html>');
    zip.file('big.txt', big);
    const zipBuffer = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
    const req = buildRequest('big.zip', 'application/zip', zipBuffer);
    const res = await invoke<UploadResponse>(req);
    expect(res.status).toBe(400);
    expect(mockedUpload).not.toHaveBeenCalled();
  });
});

