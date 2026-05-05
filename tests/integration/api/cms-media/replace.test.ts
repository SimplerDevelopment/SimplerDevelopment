/**
 * Media replace — POST /api/portal/media/[id]/replace @cms @media @replace
 *
 * Contract:
 *   - 401 unauthenticated
 *   - 404 when media belongs to a different client (cross-tenant)
 *   - 400 when no file is provided / non-multipart
 *   - On success:
 *       * a media_versions snapshot of the prior state is inserted
 *         (old version retained — restore-able)
 *       * media row is mutated to point at the new file
 *       * media.version is incremented by 1
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: vi.fn(async (_buf: Buffer, name: string, mime: string) => ({
    url: `https://s3.mock/media/${name}-${Date.now()}`,
    storedFilename: `stored-${Date.now()}-${name}`,
    mimeType: mime,
    fileSize: _buf.length,
  })),
}));

import { auth } from '@/lib/auth';
import { uploadToS3 } from '@/lib/s3/upload';
const mockedAuth = auth as unknown as Mock;
const mockedUpload = uploadToS3 as unknown as Mock;

import { NextRequest } from 'next/server';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedMedia(
  ctx: TenantCtx,
  overrides: { filename?: string; version?: number; websiteId?: number | null } = {},
): Promise<{ id: number; version: number }> {
  const sql = getTestSql();
  const filename = overrides.filename ?? `original-${Date.now()}.png`;
  const [row] = await sql<{ id: number; version: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.media (
      filename, stored_filename, mime_type, file_size, url, version,
      uploaded_by, client_id, website_id
    ) VALUES (
      ${filename}, ${`stored-${filename}`}, 'image/png', 100,
      ${`https://s3.mock/${filename}`}, ${overrides.version ?? 1},
      ${ctx.user.id}, ${ctx.client.id}, ${overrides.websiteId ?? null}
    ) RETURNING id, version
  `;
  return row;
}

function buildReplaceRequest(filename: string, mime: string, bytes: Buffer): NextRequest {
  const form = new FormData();
  // Wrap in Uint8Array so the BlobPart type aligns with the lib.dom.d.ts version
  // that next/server's NextRequest expects (Buffer<ArrayBufferLike> doesn't satisfy BlobPart).
  form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  return new NextRequest('http://localhost:3000/', { method: 'POST', body: form });
}

async function invokeReplace(mediaId: number, req: NextRequest) {
  const route = await import('@/app/api/portal/media/[id]/replace/route');
  const handler = route.POST as unknown as (
    req: Request, ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
  const res = await handler(req, { params: Promise.resolve({ id: String(mediaId) }) });
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json() : null;
  return { status: res.status, data };
}

describe('POST /api/portal/media/[id]/replace @cms @media @replace', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    mockedUpload.mockClear();
    [A, B] = await Promise.all([
      sessionForNewClientUser('media-replace-a'),
      sessionForNewClientUser('media-replace-b'),
    ]);
  });

  it('401 when unauthenticated', async () => {
    const m = await seedMedia(A);
    mockedAuth.mockResolvedValue(null);
    const req = buildReplaceRequest('new.png', 'image/png', Buffer.from([0xff, 0xd8]));
    const res = await invokeReplace(m.id, req);
    expect(res.status).toBe(401);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('404 when media is owned by a different client (cross-tenant)', async () => {
    const m = await seedMedia(B);                  // B owns it
    mockedAuth.mockResolvedValue(A.session);       // A is calling
    const req = buildReplaceRequest('attacker.png', 'image/png', Buffer.from([1, 2, 3]));
    const res = await invokeReplace(m.id, req);
    expect(res.status).toBe(404);
    expect(mockedUpload).not.toHaveBeenCalled();

    // B's row must be untouched
    const sql = getTestSql();
    const [row] = await sql<{ filename: string; version: number }[]>`
      SELECT filename, version FROM ${sql(TEST_SCHEMA)}.media WHERE id = ${m.id}
    `;
    expect(row.version).toBe(1);
    expect(row.filename).toMatch(/^original-/);

    const versions = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.media_versions WHERE media_id = ${m.id}
    `;
    expect(versions.length).toBe(0);
  });

  it('400 when no file is provided', async () => {
    const m = await seedMedia(A);
    mockedAuth.mockResolvedValue(A.session);

    const form = new FormData();
    const req = new NextRequest('http://localhost:3000/', { method: 'POST', body: form });
    const res = await invokeReplace(m.id, req);
    expect(res.status).toBe(400);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('on success: snapshots old state to media_versions, bumps version, swaps row', async () => {
    const m = await seedMedia(A, { filename: 'before.png', version: 3 });
    mockedAuth.mockResolvedValue(A.session);

    const req = buildReplaceRequest('after.png', 'image/png', Buffer.from([0xab, 0xcd, 0xef]));
    const res = await invokeReplace(m.id, req);
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.version).toBe(4);
    expect(res.data?.data.filename).toBe('after.png');
    expect(mockedUpload).toHaveBeenCalledTimes(1);

    const sql = getTestSql();
    // Current row mutated
    const [current] = await sql<{ filename: string; version: number }[]>`
      SELECT filename, version FROM ${sql(TEST_SCHEMA)}.media WHERE id = ${m.id}
    `;
    expect(current.version).toBe(4);
    expect(current.filename).toBe('after.png');

    // Old state snapshot retained
    const versions = await sql<{ version: number; filename: string }[]>`
      SELECT version, filename FROM ${sql(TEST_SCHEMA)}.media_versions WHERE media_id = ${m.id}
    `;
    expect(versions.length).toBe(1);
    expect(versions[0].version).toBe(3);
    expect(versions[0].filename).toBe('before.png');
  });

  it('after multiple replaces, all prior versions are retained in order', async () => {
    const m = await seedMedia(A, { filename: 'v1.png', version: 1 });
    mockedAuth.mockResolvedValue(A.session);

    const r1 = await invokeReplace(m.id, buildReplaceRequest('v2.png', 'image/png', Buffer.from([1])));
    expect(r1.status).toBe(200);
    const r2 = await invokeReplace(m.id, buildReplaceRequest('v3.png', 'image/png', Buffer.from([2])));
    expect(r2.status).toBe(200);

    const sql = getTestSql();
    const [current] = await sql<{ version: number; filename: string }[]>`
      SELECT version, filename FROM ${sql(TEST_SCHEMA)}.media WHERE id = ${m.id}
    `;
    expect(current.version).toBe(3);
    expect(current.filename).toBe('v3.png');

    const versions = await sql<{ version: number; filename: string }[]>`
      SELECT version, filename FROM ${sql(TEST_SCHEMA)}.media_versions WHERE media_id = ${m.id}
      ORDER BY version ASC
    `;
    expect(versions.map(v => ({ v: v.version, f: v.filename }))).toEqual([
      { v: 1, f: 'v1.png' },
      { v: 2, f: 'v2.png' },
    ]);
  });
});
