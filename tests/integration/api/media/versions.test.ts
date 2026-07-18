/**
 * Media versions —
 *   GET  /api/portal/media/[id]/versions                     (list current + history)
 *   POST /api/portal/media/[id]/versions/[versionId]/restore (revert to a snapshot)
 *
 * Cross-tenant: A must never read B's history nor restore B's snapshot.
 * Cross-media: a versionId belonging to a different mediaId on the same tenant
 * is also rejected (the restore handler scopes by both ids).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import {
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

async function seedMediaWithVersion(
  ctx: TenantCtx,
  websiteId: number,
  opts: { version?: number; suffix?: string } = {},
): Promise<{ mediaId: number; versionId: number }> {
  const sql = getTestSql();
  const ts = Date.now();
  const suffix = opts.suffix ?? String(Math.floor(Math.random() * 1e9));
  const version = opts.version ?? 2;
  const [m] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.media
      (filename, stored_filename, mime_type, file_size, url, version,
       uploaded_by, client_id, website_id)
    VALUES
      (${`current-${suffix}.txt`}, ${`s-current-${suffix}.txt`}, 'text/plain', 22,
       ${`https://s3.mock/current-${suffix}.txt`}, ${version},
       ${ctx.user.id}, ${ctx.client.id}, ${websiteId})
    RETURNING id
  `;
  // A historical snapshot version — older bytes
  const [v] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.media_versions
      (media_id, version, filename, stored_filename, mime_type, file_size, url, uploaded_by)
    VALUES
      (${m.id}, 1, ${`old-${suffix}-${ts}.txt`}, ${`s-old-${suffix}-${ts}.txt`}, 'text/plain', 11,
       ${`https://s3.mock/old-${suffix}-${ts}.txt`}, ${ctx.user.id})
    RETURNING id
  `;
  return { mediaId: m.id, versionId: v.id };
}

describe('GET /api/portal/media/[id]/versions @media @versions', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    const { websiteId } = await seedWebsite(A);
    const { mediaId } = await seedMediaWithVersion(A, websiteId);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/media/[id]/versions/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(mediaId) } });
    expect(res.status).toBe(401);
  });

  it("404 cross-tenant: A cannot read B's media versions", async () => {
    const { websiteId } = await seedWebsite(B);
    const { mediaId } = await seedMediaWithVersion(B, websiteId);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/media/[id]/versions/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(mediaId) } });
    expect(res.status).toBe(404);
  });

  it('200 + current + history payload, history newest-first', async () => {
    const { websiteId } = await seedWebsite(A);
    const { mediaId } = await seedMediaWithVersion(A, websiteId, { version: 3, suffix: 'happy' });
    // Add a second history snapshot at version=2
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.media_versions
        (media_id, version, filename, stored_filename, mime_type, file_size, url, uploaded_by)
      VALUES
        (${mediaId}, 2, 'mid.txt', 'mid.txt', 'text/plain', 15, 'https://s3.mock/mid.txt', ${A.user.id})
    `;
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/media/[id]/versions/route');
    const res = await callHandler<{
      data: {
        current: { id: number; version: number };
        history: Array<{ version: number; filename: string }>;
      };
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(mediaId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.current?.id).toBe(mediaId);
    expect(res.data?.data?.current?.version).toBe(3);
    // history sorted DESC by version
    const versions = res.data?.data?.history?.map(h => h.version) ?? [];
    expect(versions).toEqual([2, 1]);
  });
});

describe('POST /api/portal/media/[id]/versions/[versionId]/restore @media @versions @restore', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    const { websiteId } = await seedWebsite(A);
    const { mediaId, versionId } = await seedMediaWithVersion(A, websiteId);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/media/[id]/versions/[versionId]/restore/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(mediaId), versionId: String(versionId) } });
    expect(res.status).toBe(401);
  });

  it("404 cross-tenant: A cannot restore B's snapshot", async () => {
    const { websiteId: bWebsite } = await seedWebsite(B);
    const { mediaId, versionId } = await seedMediaWithVersion(B, bWebsite);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/media/[id]/versions/[versionId]/restore/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(mediaId), versionId: String(versionId) } });
    expect(res.status).toBe(404);

    // Underlying media row was not mutated.
    const sql = getTestSql();
    const [row] = await sql<{ filename: string; version: number }[]>`
      SELECT filename, version FROM ${sql(TEST_SCHEMA)}.media WHERE id = ${mediaId}
    `;
    expect(row.filename).toMatch(/^current-/);
  });

  it('404 when versionId belongs to a different media on the same tenant', async () => {
    const { websiteId } = await seedWebsite(A);
    const { mediaId: m1 } = await seedMediaWithVersion(A, websiteId, { suffix: 'first' });
    // Different media + its own version
    const { versionId: foreignVersion } = await seedMediaWithVersion(A, websiteId, { suffix: 'second' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/media/[id]/versions/[versionId]/restore/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(m1), versionId: String(foreignVersion) } });
    expect(res.status).toBe(404);
  });

  it('200 + media row reverts to snapshot, version bumps, snapshot consumed', async () => {
    const { websiteId } = await seedWebsite(A);
    const { mediaId, versionId } = await seedMediaWithVersion(A, websiteId, { version: 5, suffix: 'restoreme' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/media/[id]/versions/[versionId]/restore/route');
    const res = await callHandler<{ data: { filename: string; version: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(mediaId), versionId: String(versionId) } },
    );
    expect(res.status).toBe(200);
    // Restored content from the snapshot, version monotonically advanced
    expect(res.data?.data?.filename).toMatch(/^old-/);
    expect(res.data?.data?.version).toBe(6);

    const sql = getTestSql();
    const [m] = await sql<{ filename: string; version: number }[]>`
      SELECT filename, version FROM ${sql(TEST_SCHEMA)}.media WHERE id = ${mediaId}
    `;
    expect(m.filename).toMatch(/^old-/);
    expect(m.version).toBe(6);

    // A snapshot was added (the formerly-current state) and the consumed one was deleted.
    const versions = await sql<{ version: number; filename: string }[]>`
      SELECT version, filename FROM ${sql(TEST_SCHEMA)}.media_versions
      WHERE media_id = ${mediaId} ORDER BY version
    `;
    // Now contains the *previous current* snapshot (version=5) and the original
    // versionId we restored from must have been deleted.
    expect(versions.find(v => v.filename.startsWith('current-'))).toBeDefined();
    const stillThere = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.media_versions WHERE id = ${versionId}
    `;
    expect(stillThere.length).toBe(0);
  });
});
