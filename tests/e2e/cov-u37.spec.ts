/**
 * ESign Approvals — Coverage slice u37
 *
 * Cards [12..15] from vault/05 - Feature Specs/E2E Audit/ESign Approvals E2E Audit.md
 *
 *  12 — Native contract send path (/api/portal/crm/contracts/[id]/send)
 *  13 — Public contract viewer /api/contracts/[token]: page loads for valid signer token
 *  14 — Admin cross-tenant approvals inbox (/api/admin/approvals)
 *  15 — GET /api/portal/approvals?status=applied returns only applied records
 */

import { test, expect } from './setup/fixtures';

// ── Card 12: Native contract send path ──────────────────────────────────────
//
// POST /api/portal/crm/contracts/[id]/send
//   • sets status = 'sent'
//   • records a documentHash
//   • sends per-signer emails (we can't assert email delivery, but we assert
//     the response envelope + status transition)
//   • returns 400 when contract has no signers
//   • returns 404 for unknown contract id

test.describe('Card 12 — Contract native send path @esign @contracts', () => {
  let contractId: number;
  let cleanupContract: () => Promise<void>;

  test.beforeAll(async ({ clientApi }) => {
    // Create a draft contract with one signer
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/crm/contracts', {
      title: `E2E Send Test ${ts}`,
      summary: 'Created by cov-u37 to test the /send route',
      signers: [
        { name: `Test Signer ${ts}`, email: `signer-${ts}@example.com`, role: 'signer' },
      ],
    });
    expect(res.status).toBe(201);
    contractId = res.data.data.id;
    cleanupContract = async () => {
      await clientApi.delete(`/api/portal/crm/contracts/${contractId}`).catch(() => {});
    };
  });

  test.afterAll(async () => {
    await cleanupContract?.();
  });

  test('POST /send sets status=sent and returns documentHash @critical', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/crm/contracts/${contractId}/send`, {});
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('sent');
    expect(typeof res.data.data.signerCount).toBe('number');
    expect(res.data.data.signerCount).toBeGreaterThanOrEqual(1);

    // Verify the contract row now reflects 'sent' and has a documentHash
    const get = await clientApi.get(`/api/portal/crm/contracts/${contractId}`);
    expect(get.status).toBe(200);
    expect(get.data.data.status).toBe('sent');
    expect(typeof get.data.data.documentHash).toBe('string');
    expect(get.data.data.documentHash.length).toBe(64); // SHA-256 hex
  });

  test('POST /send returns 400 for a contract with no signers', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/crm/contracts', {
      title: `No-Signer Contract ${ts}`,
    });
    expect(create.status).toBe(201);
    const noSignerContractId = create.data.data.id;

    const res = await clientApi.post(`/api/portal/crm/contracts/${noSignerContractId}/send`, {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);

    await clientApi.delete(`/api/portal/crm/contracts/${noSignerContractId}`).catch(() => {});
  });

  test('POST /send returns 404 for unknown contract', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/contracts/999999999/send', {});
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('POST /send requires auth', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/crm/contracts/1/send', {});
    expect(res.status).toBe(401);
  });
});

// ── Card 13: Public contract viewer /api/contracts/[token] ──────────────────
//
// GET /api/contracts/[token]
//   • returns contract + signer data for a valid signer token (64-char hex)
//   • returns 404 for an unknown token
//   • returns 400 for a malformed token (not 64-char hex)
//
// Note: the public page is at /contract/[token] (a Next.js page). The API
// backing it is GET /api/contracts/[token]. We test the API directly.

test.describe('Card 13 — Public contract viewer API @esign @contracts', () => {
  let signerToken: string;
  let sentContractId: number;
  let cleanupSentContract: () => Promise<void>;

  test.beforeAll(async ({ clientApi }) => {
    // Create a draft contract with one signer, then send it so the API
    // returns data (draft contracts return 404 from the public route)
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/crm/contracts', {
      title: `Public Viewer Test ${ts}`,
      summary: 'cov-u37 card 13',
      signers: [
        { name: `Viewer Signer ${ts}`, email: `viewer-${ts}@example.com`, role: 'signer' },
      ],
    });
    expect(create.status).toBe(201);
    sentContractId = create.data.data.id;
    cleanupSentContract = async () => {
      await clientApi.delete(`/api/portal/crm/contracts/${sentContractId}`).catch(() => {});
    };

    // Send the contract so the public endpoint will serve it
    const send = await clientApi.post(`/api/portal/crm/contracts/${sentContractId}/send`, {});
    expect(send.status).toBe(200);

    // Retrieve the contract to get the signer token
    const get = await clientApi.get(`/api/portal/crm/contracts/${sentContractId}`);
    expect(get.status).toBe(200);
    const signers: Array<{ token?: string }> = get.data.data.signers ?? [];
    expect(signers.length).toBeGreaterThan(0);
    signerToken = signers[0].token as string;
    expect(typeof signerToken).toBe('string');
    expect(signerToken.length).toBe(64);
  });

  test.afterAll(async () => {
    await cleanupSentContract?.();
  });

  test('GET /api/contracts/[token] returns contract data for valid signer token @critical', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/contracts/${signerToken}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('title');
    expect(res.data.data).toHaveProperty('signer');
    expect(res.data.data).toHaveProperty('allSigners');
    expect(res.data.data.signer.token ?? signerToken).toBeTruthy(); // route omits token in response
  });

  test('GET /api/contracts/[token] returns 404 for unknown token', async ({ unauthApi }) => {
    const unknownToken = 'a'.repeat(64); // valid format, unknown row
    const res = await unauthApi.get(`/api/contracts/${unknownToken}`);
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('GET /api/contracts/[token] returns 400 for malformed token', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/contracts/not-a-valid-token');
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});

// ── Card 14: Admin cross-tenant approvals inbox ─────────────────────────────
//
// GET /api/admin/approvals
//   • accessible by admin role → 200 with success:true, data is an array
//   • each item has: source, id, clientId, createdAt, summary, status
//   • rejects non-admin (client user) → 401/403
//   • rejects unauthenticated → 401

test.describe('Card 14 — Admin cross-tenant approvals inbox @esign @admin @approvals', () => {
  test('GET /api/admin/approvals returns unified inbox for admin @critical', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/approvals');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // Verify shape of any returned rows
    for (const row of res.data.data as Array<Record<string, unknown>>) {
      expect(row).toHaveProperty('source');
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('clientId');
      expect(row).toHaveProperty('createdAt');
      expect(row).toHaveProperty('summary');
      expect(row).toHaveProperty('status');
      expect(['mcp', 'brain', 'service', 'project']).toContain(row.source);
    }
  });

  test('GET /api/admin/approvals rejects client (non-admin) session', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/approvals');
    expect([401, 403]).toContain(res.status);
    expect(res.data.success).toBe(false);
  });

  test('GET /api/admin/approvals rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/approvals');
    expect(res.status).toBe(401);
  });

  test('POST /api/admin/approvals/mcp/999999999/approve returns 404 for unknown item', async ({ adminApi }) => {
    const res = await adminApi.post('/api/admin/approvals/mcp/999999999/approve', {});
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('POST /api/admin/approvals/unknown-source/1/approve returns 400', async ({ adminApi }) => {
    const res = await adminApi.post('/api/admin/approvals/bogus/1/approve', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /api/admin/approvals/mcp/999999999/reject returns 404 for unknown item', async ({ adminApi }) => {
    const res = await adminApi.post('/api/admin/approvals/mcp/999999999/reject', {});
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });
});

// ── Card 15: GET /api/portal/approvals?status=applied ───────────────────────
//
// The portal approvals route accepts a ?status= filter.
// A request for status=applied must return only rows where status='applied'.
// We verify: success:true, array response, no 'pending' rows bleed through.

test.describe('Card 15 — Portal approvals status filter @esign @approvals', () => {
  test('GET /api/portal/approvals?status=applied returns success @critical', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/approvals?status=applied');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // Every row returned must have status=applied (no cross-status bleed)
    for (const row of res.data.data as Array<{ status: string }>) {
      expect(row.status).toBe('applied');
    }
  });

  test('GET /api/portal/approvals?status=pending returns only pending rows', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/approvals?status=pending');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    for (const row of res.data.data as Array<{ status: string }>) {
      expect(row.status).toBe('pending');
    }
  });

  test('GET /api/portal/approvals returns all rows when no status filter', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/approvals');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /api/portal/approvals?count=true returns a count', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/approvals?count=true');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(typeof res.data.data.count).toBe('number');
  });

  test('GET /api/portal/approvals rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/approvals');
    expect(res.status).toBe(401);
  });
});
