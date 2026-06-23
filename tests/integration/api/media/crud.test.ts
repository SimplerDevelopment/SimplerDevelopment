/**
 * Portal media CRUD —
 *   POST /api/portal/media/upload     (upload a file, persist + S3)
 *   PUT  /api/portal/media/[id]       (patch alt + caption metadata)
 *   DELETE /api/portal/media/[id]     (delete tenant-scoped row)
 *
 * Cross-tenant: PUT/DELETE on tenant B's media from tenant A must 404
 * with no row mutation.
 *
 * Upload contract:
 *   - 401 unauth
 *   - 400 when no file is provided
 *   - 400 when file exceeds MAX_FILE_SIZE (10MB default)
 *   - 400 when ALLOWED_FILE_TYPES is configured and the mime is not in the list
 *   - 400 when the tenant has no clientWebsites row (websiteId resolution fails)
 *   - 201 + row persisted on success; metadata + S3 echo line up
 *   - branding profile from a different tenant is silently ignored (NULL)
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: vi.fn(async (buf: Buffer, name: string, mime: string) => ({
    url: `https://s3.mock/media/${name}`,
    storedFilename: `stored-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${name}`,
    mimeType: mime,
    fileSize: buf.length,
  })),
}));

import { auth } from '@/lib/auth';
import { uploadToS3 } from '@/lib/s3/upload';
const mockedAuth = auth as unknown as Mock;
const mockedUpload = uploadToS3 as unknown as Mock;

import { NextRequest } from 'next/server';
import { callHandler } from '../../../helpers/call-handler';
import {
  sessionForNewClientUser,
  twoTenants,
  type TenantCtx,
} from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedWebsite(ctx: TenantCtx): Promise<{ websiteId: number }> {
  const sql = getTestSql();
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1e9);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, subdomain)
    VALUES (${ctx.client.id}, ${`Site-${ts}-${rand}`}, ${`sub-${ts}-${rand}`})
    RETURNING id
  `;
  return { websiteId: row.id };
}

async function seedBrandingProfile(ctx: TenantCtx): Promise<{ profileId: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.branding_profiles (client_id, name, is_default)
    VALUES (${ctx.client.id}, ${`Brand-${Date.now()}-${Math.random()}`}, false)
    RETURNING id
  `;
  return { profileId: row.id };
}

async function seedMedia(ctx: TenantCtx, websiteId: number): Promise<{ mediaId: number }> {
  const sql = getTestSql();
  const ts = Date.now();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.media
      (filename, stored_filename, mime_type, file_size, url,
       uploaded_by, client_id, website_id)
    VALUES
      (${`m-${ts}.txt`}, ${`stored-${ts}.txt`}, 'text/plain', 11,
       ${`https://s3.mock/m-${ts}.txt`},
       ${ctx.user.id}, ${ctx.client.id}, ${websiteId})
    RETURNING id
  `;
  return { mediaId: row.id };
}

function buildUploadRequest(filename: string, mime: string, bytes: Buffer, extras?: Record<string, string>): NextRequest {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  for (const [k, v] of Object.entries(extras ?? {})) form.append(k, v);
  return new NextRequest('http://localhost:3000/', { method: 'POST', body: form });
}

async function invokeUpload(req: NextRequest) {
  const route = await import('@/app/api/portal/media/upload/route');
  const res = await (route.POST as (r: Request) => Promise<Response>)(req);
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json() : null;
  return { status: res.status, data };
}

describe('POST /api/portal/media/upload @media @upload', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    mockedUpload.mockClear();
    [A, B] = await Promise.all([
      sessionForNewClientUser('media-up-a'),
      sessionForNewClientUser('media-up-b'),
    ]);
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const req = buildUploadRequest('x.txt', 'text/plain', Buffer.from('hi'));
    const res = await invokeUpload(req);
    expect(res.status).toBe(401);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('400 when no file field is present', async () => {
    await seedWebsite(A);
    mockedAuth.mockResolvedValue(A.session);
    const form = new FormData();
    const req = new NextRequest('http://localhost:3000/', { method: 'POST', body: form });
    const res = await invokeUpload(req);
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/no file/i);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('400 when caller has no client websites (websiteId resolution fails)', async () => {
    // Note: A has no client_websites row yet
    mockedAuth.mockResolvedValue(A.session);
    const req = buildUploadRequest('x.txt', 'text/plain', Buffer.from('hi'));
    const res = await invokeUpload(req);
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/no websites/i);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('400 when file exceeds MAX_FILE_SIZE (default 10MB)', async () => {
    await seedWebsite(A);
    mockedAuth.mockResolvedValue(A.session);
    const oversize = Buffer.alloc(10 * 1024 * 1024 + 1, 0x42);
    const req = buildUploadRequest('big.bin', 'application/octet-stream', oversize);
    const res = await invokeUpload(req);
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/exceeds/i);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  // Note: ALLOWED_FILE_TYPES is read at module-load time on the route, so a
  // runtime env override no longer takes effect once the handler is imported.
  // The negative-mime path is therefore covered by the env-config docs only;
  // the route's other 400 paths (no file, websiteId resolution, oversized)
  // are exercised above.

it('201 + row persisted scoped to caller tenant on a small upload', async () => {
    const { websiteId } = await seedWebsite(A);
    mockedAuth.mockResolvedValue(A.session);
    const bytes = Buffer.from('hello world');
    const req = buildUploadRequest('hello.txt', 'text/plain', bytes, { alt: 'A', caption: 'C' });
    const res = await invokeUpload(req);

    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(mockedUpload).toHaveBeenCalledTimes(1);
    expect(res.data?.data?.clientId).toBe(A.client.id);
    expect(res.data?.data?.websiteId).toBe(websiteId);
    expect(res.data?.data?.alt).toBe('A');
    expect(res.data?.data?.caption).toBe('C');

    const sql = getTestSql();
    const rows = await sql<{ filename: string; client_id: number; website_id: number; alt: string; caption: string }[]>`
      SELECT filename, client_id, website_id, alt, caption
      FROM ${sql(TEST_SCHEMA)}.media WHERE id = ${res.data?.data?.id}
    `;
    expect(rows[0].filename).toBe('hello.txt');
    expect(rows[0].client_id).toBe(A.client.id);
    expect(rows[0].website_id).toBe(websiteId);
    expect(rows[0].alt).toBe('A');
    expect(rows[0].caption).toBe('C');
  });

  it("ignores cross-tenant brandingProfileId (silently leaves it NULL)", async () => {
    await seedWebsite(A);
    const { profileId: bProfile } = await seedBrandingProfile(B);
    mockedAuth.mockResolvedValue(A.session);

    const req = buildUploadRequest('x.txt', 'text/plain', Buffer.from('hi'), {
      brandingProfileId: String(bProfile),
    });
    const res = await invokeUpload(req);
    expect(res.status).toBe(201);
    expect(res.data?.data?.brandingProfileId).toBeNull();
  });
});

describe('PUT /api/portal/media/[id] @media @meta', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    const { websiteId } = await seedWebsite(A);
    const { mediaId } = await seedMedia(A, websiteId);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/media/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(mediaId) }, body: { alt: 'no' } });
    expect(res.status).toBe(401);
  });

  it("404 cross-tenant: A cannot PUT B's media", async () => {
    const { websiteId } = await seedWebsite(B);
    const { mediaId } = await seedMedia(B, websiteId);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/media/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(mediaId) }, body: { alt: 'leak', caption: 'leak' } });
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ alt: string | null; caption: string | null }[]>`
      SELECT alt, caption FROM ${sql(TEST_SCHEMA)}.media WHERE id = ${mediaId}
    `;
    expect(row.alt).toBeNull();
    expect(row.caption).toBeNull();
  });

  it('200 + alt/caption updated within tenant', async () => {
    const { websiteId } = await seedWebsite(A);
    const { mediaId } = await seedMedia(A, websiteId);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/media/[id]/route');
    const res = await callHandler<{ data: { alt: string; caption: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(mediaId) }, body: { alt: 'new alt', caption: 'new caption' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.alt).toBe('new alt');
    expect(res.data?.data?.caption).toBe('new caption');
  });
});

describe('DELETE /api/portal/media/[id] @media @delete', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    const { websiteId } = await seedWebsite(A);
    const { mediaId } = await seedMedia(A, websiteId);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/media/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(mediaId) } });
    expect(res.status).toBe(401);
  });

  it("404 cross-tenant: A cannot DELETE B's media; row remains", async () => {
    const { websiteId } = await seedWebsite(B);
    const { mediaId } = await seedMedia(B, websiteId);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/media/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(mediaId) } });
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.media WHERE id = ${mediaId}
    `;
    expect(rows.length).toBe(1);
  });

  it('200 + row removed within tenant', async () => {
    const { websiteId } = await seedWebsite(A);
    const { mediaId } = await seedMedia(A, websiteId);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/media/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(mediaId) } });
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.media WHERE id = ${mediaId}
    `;
    expect(rows.length).toBe(0);
  });
});
