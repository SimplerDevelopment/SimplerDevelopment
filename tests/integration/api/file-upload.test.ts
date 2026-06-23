/**
 * Card file upload — POST /api/portal/cards/[id]/files.
 *
 * Contract:
 *   - 401 unauth
 *   - 404 when the card is not in the caller's tenant
 *   - 400 when no file is provided
 *   - 400 when file exceeds 20MB (MAX_SIZE)
 *   - 200 + row persisted on success; metadata (originalName, mimeType, fileSize)
 *     lines up with what was uploaded
 *   - S3 upload path is invoked (mocked — we're integration-testing the handler,
 *     not AWS SDK behaviour)
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: vi.fn(async (_buf: Buffer, name: string, mime: string) => ({
    url: `https://s3.mock/media/${name}`,
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
import { sessionForNewClientUser, type TenantCtx } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

async function seedCard(ownerClientId: number, ownerUserId: number): Promise<{ cardId: number; projectId: number }> {
  const sql = getTestSql();
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES ('Upload proj', ${ownerClientId}, 'active', ${ownerUserId}) RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
    VALUES (${proj.id}, ${ownerUserId}, 'owner')
  `;
  const [col] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
    VALUES (${proj.id}, 'Todo', 0) RETURNING id
  `;
  const [card] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
    VALUES (${col.id}, ${proj.id}, 'Card', 0) RETURNING id
  `;
  return { cardId: card.id, projectId: proj.id };
}

/** Build a NextRequest with a multipart form body carrying a single file. */
function buildUploadRequest(filename: string, mime: string, bytes: Buffer): NextRequest {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  return new NextRequest('http://localhost:3000/', {
    method: 'POST',
    body: form,
  });
}

async function invokeUpload(cardId: number, req: NextRequest) {
  const route = await import('@/app/api/portal/cards/[id]/files/route');
  const res = await (route.POST as (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>)(
    req, { params: Promise.resolve({ id: String(cardId) }) },
  );
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json() : null;
  return { status: res.status, data };
}

describe('POST /api/portal/cards/[id]/files @upload', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    mockedUpload.mockClear();
    [A, B] = await Promise.all([
      sessionForNewClientUser('upload-a'),
      sessionForNewClientUser('upload-b'),
    ]);
  });

  it('401 when unauthenticated', async () => {
    const { cardId } = await seedCard(A.client.id, A.user.id);
    mockedAuth.mockResolvedValue(null);
    const req = buildUploadRequest('x.png', 'image/png', Buffer.from([1, 2, 3]));
    const res = await invokeUpload(cardId, req);
    expect(res.status).toBe(401);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('404 when card belongs to a different tenant', async () => {
    const { cardId } = await seedCard(B.client.id, B.user.id);   // B's card
    mockedAuth.mockResolvedValue(A.session);                     // A's session
    const req = buildUploadRequest('x.png', 'image/png', Buffer.from([1, 2, 3]));
    const res = await invokeUpload(cardId, req);
    expect(res.status).toBe(404);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('400 when no file field is present', async () => {
    const { cardId } = await seedCard(A.client.id, A.user.id);
    mockedAuth.mockResolvedValue(A.session);

    // FormData with no file
    const form = new FormData();
    const req = new NextRequest('http://localhost:3000/', { method: 'POST', body: form });
    const res = await invokeUpload(cardId, req);
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/no file/i);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('400 when file exceeds 20MB cap', async () => {
    const { cardId } = await seedCard(A.client.id, A.user.id);
    mockedAuth.mockResolvedValue(A.session);

    // 20MB + 1 byte
    const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 0x61);
    const req = buildUploadRequest('big.bin', 'application/octet-stream', oversized);
    const res = await invokeUpload(cardId, req);
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/20MB/i);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('200 + row persisted on a normal small upload', async () => {
    const { cardId, projectId } = await seedCard(A.client.id, A.user.id);
    mockedAuth.mockResolvedValue(A.session);

    const bytes = Buffer.from('hello world');
    const req = buildUploadRequest('hello.txt', 'text/plain', bytes);
    const res = await invokeUpload(cardId, req);

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(mockedUpload).toHaveBeenCalledTimes(1);

    const sql = getTestSql();
    const [row] = await sql<{
      original_name: string; mime_type: string; file_size: number;
      card_id: number; project_id: number; user_id: number;
    }[]>`
      SELECT original_name, mime_type, file_size, card_id, project_id, user_id
      FROM ${sql(TEST_SCHEMA)}.kanban_card_files WHERE card_id = ${cardId}
    `;
    expect(row.original_name).toBe('hello.txt');
    expect(row.mime_type).toBe('text/plain');
    expect(row.file_size).toBe(bytes.length);
    expect(row.card_id).toBe(cardId);
    expect(row.project_id).toBe(projectId);
    expect(row.user_id).toBe(A.user.id);
  });

  it('upload at exactly the 20MB boundary is allowed', async () => {
    const { cardId } = await seedCard(A.client.id, A.user.id);
    mockedAuth.mockResolvedValue(A.session);
    const bytes = Buffer.alloc(20 * 1024 * 1024, 0x42);
    const req = buildUploadRequest('twenty.bin', 'application/octet-stream', bytes);
    const res = await invokeUpload(cardId, req);
    expect(res.status).toBe(200);
  });
});
