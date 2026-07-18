/**
 * POST /api/portal/cms/websites/[siteId]/posts/upload-html
 *
 * Mirrors the pitch-decks upload-html contract; the divergence to verify is:
 *   - single .html still goes through `cleanEmbedHtml` + `importHtmlAssets`
 *     (both mocked here; we just confirm the path is exercised).
 *   - .zip skips both cleaners (the user has packaged a self-contained bundle)
 *     and uploads each entry under a single S3 prefix.
 *
 * The full path-traversal / mime-allowlist / size-cap matrix is covered by
 * tests/integration/api/pitch-decks/upload-html.test.ts; this file focuses on
 * what's specific to the CMS handler.
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
vi.mock('@/lib/html-asset-import', () => ({
  importHtmlAssets: vi.fn(async (html: string) => ({ html, assetCount: 0 })),
}));

import { auth } from '@/lib/auth';
import { uploadToS3 } from '@/lib/s3/upload';
import { importHtmlAssets } from '@/lib/html-asset-import';
const mockedAuth = auth as unknown as Mock;
const mockedUpload = uploadToS3 as unknown as Mock;
const mockedAssetImport = importHtmlAssets as unknown as Mock;

import { NextRequest } from 'next/server';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedSite(ctx: TenantCtx, label = 'site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}`}, ${`${label}-${Date.now()}-${Math.random()}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

function buildRequest(filename: string, mime: string, bytes: Buffer): NextRequest {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  return new NextRequest('http://localhost:3000/', {
    method: 'POST',
    body: form as unknown as BodyInit,
  });
}

async function invoke<T = unknown>(siteId: number, req: NextRequest): Promise<{ status: number; data: T | null }> {
  const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/upload-html/route');
  const res = await (route.POST as unknown as (r: Request, ctx: { params: Promise<{ siteId: string }> }) => Promise<Response>)(
    req,
    { params: Promise.resolve({ siteId: String(siteId) }) },
  );
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? ((await res.json()) as T) : null;
  return { status: res.status, data };
}

interface UploadResponse {
  success: boolean;
  message?: string;
  data?: { id: number; slug: string; websiteId: number };
}

describe('POST /api/portal/cms/websites/[siteId]/posts/upload-html @upload @cms @html-embed', () => {
  let A: TenantCtx;
  let siteId: number;

  beforeEach(async () => {
    mockedUpload.mockClear();
    mockedAssetImport.mockClear();
    A = await sessionForNewClientUser('cms-upload');
    ({ siteId } = await seedSite(A));
  });

  it('regression: single .html still runs through importHtmlAssets', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const html = Buffer.from('<!doctype html><html><body><p>hi</p></body></html>');
    const req = buildRequest('page.html', 'text/html', html);
    const res = await invoke<UploadResponse>(siteId, req);
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(mockedAssetImport).toHaveBeenCalledTimes(1);
    expect(mockedUpload).toHaveBeenCalledTimes(1);
    // Single-file path: no `key` override.
    const opts = mockedUpload.mock.calls[0][3];
    expect(opts?.key).toBeUndefined();
  });

  it('zip upload: bypasses asset importer, all entries share an S3 prefix, block url points at index', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const zip = new JSZip();
    zip.file('index.html', '<!doctype html><html><body><img src="img/x.png"></body></html>');
    zip.file('img/x.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const zipBuffer = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));

    const req = buildRequest('page.zip', 'application/zip', zipBuffer);
    const res = await invoke<UploadResponse>(siteId, req);
    expect(res.status).toBe(201);

    // importHtmlAssets is the single-file pre-processor; zip uploads must
    // not call it (the bundle is already self-contained).
    expect(mockedAssetImport).not.toHaveBeenCalled();
    expect(mockedUpload).toHaveBeenCalledTimes(2);
    const keys = mockedUpload.mock.calls.map((c) => (c[3] as { key?: string }).key as string);
    expect(keys.every((k) => /^media\/[0-9a-f-]{36}\//.test(k))).toBe(true);
    const prefixes = new Set(keys.map((k) => k.split('/').slice(0, 2).join('/')));
    expect(prefixes.size).toBe(1);
    const prefix = [...prefixes][0];
    expect(keys).toContain(`${prefix}/index.html`);
    expect(keys).toContain(`${prefix}/img/x.png`);

    // post.content should reference the index.html by its proxy URL.
    const sql = getTestSql();
    const [row] = await sql<{ content: string }[]>`
      SELECT content FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${res.data!.data!.id}
    `;
    const parsed = JSON.parse(row.content) as { blocks: Array<{ type: string; url: string }> };
    expect(parsed.blocks[0].type).toBe('html-embed');
    expect(parsed.blocks[0].url).toBe(`/api/media/proxy/${prefix}/index.html`);
  });
});
