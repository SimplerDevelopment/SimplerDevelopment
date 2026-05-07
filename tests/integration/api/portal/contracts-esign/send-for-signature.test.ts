/**
 * Integration tests for POST /api/portal/crm/contracts/[id]/send-for-signature.
 *
 * The provider client is mocked via vi.mock('@/lib/esign/dropbox-sign') —
 * the route's two outbound calls (createSignatureRequest + the env read in
 * getApiKey) become deterministic. We also stub renderContractPdf so we
 * don't need pdf-lib's font assets and so the test stays fast.
 *
 * Coverage:
 *   - Happy path: persists provider request id + 'sent' status + sentAt
 *     + audit row of kind='sent' with signatureId in payload.
 *   - State machine: route is a 409 (NOT 422 — see note below) when the
 *     contract is already in a blocking status (sent/viewed/signed). The
 *     spec text in the brief says 422; the route source returns 409. We
 *     assert the actual route behavior and document the discrepancy.
 *   - Tenancy: cross-client send returns 404 (route filters by clientId).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/esign/dropbox-sign', () => ({
  createSignatureRequest: vi.fn(async () => ({
    signatureRequestId: 'mock_sr_id_123',
    signatureId: 'mock_sig_id_456',
  })),
  getEmbeddedSignUrl: vi.fn(),
  cancelSignatureRequest: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  getSignedFileUrl: vi.fn(),
}));

// Stub the PDF renderer — we don't need a real PDF; the route only uses the
// returned Buffer to hand to createSignatureRequest (which is mocked).
vi.mock('@/lib/esign/contract-pdf', () => ({
  renderContractPdf: vi.fn(async () => Buffer.from('%PDF-1.4 mock')),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;
import { createSignatureRequest } from '@/lib/esign/dropbox-sign';
const mockedCreateSig = createSignatureRequest as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedContract(opts: {
  clientId: number;
  esignStatus?: string | null;
  esignProviderRequestId?: string | null;
}) {
  const sql = getTestSql();
  const token = `tk_${Date.now()}_${Math.floor(Math.random() * 99999)}`;
  const status = opts.esignStatus ?? null;
  const providerReq = opts.esignProviderRequestId ?? null;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_contracts
      (client_id, title, status, client_token, esign_status, esign_provider_request_id)
    VALUES (${opts.clientId}, ${'Send Test Contract'}, 'draft', ${token},
            ${status}, ${providerReq})
    RETURNING id
  `;
  return row.id;
}

describe('POST /api/portal/crm/contracts/[id]/send-for-signature @esign', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('contracts-send');
    mockedCreateSig.mockClear();
    mockedCreateSig.mockResolvedValue({
      signatureRequestId: 'mock_sr_id_123',
      signatureId: 'mock_sig_id_456',
    });
  });

  it('happy path: persists providerRequestId, status="sent", sentAt set, audit "sent" event with signatureId', async () => {
    const id = await seedContract({ clientId: A.client.id });
    await asTenant(A);

    const route = await import('@/app/api/portal/crm/contracts/[id]/send-for-signature/route');
    const res = await callHandler<{
      success: boolean;
      data: { esignStatus: string; esignProviderRequestId: string; signatureId: string };
    }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(id) },
        body: { signerEmail: 'signer@test.local', signerName: 'Test Signer' },
      },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.esignStatus).toBe('sent');
    expect(res.data?.data.esignProviderRequestId).toBe('mock_sr_id_123');
    expect(res.data?.data.signatureId).toBe('mock_sig_id_456');

    expect(mockedCreateSig).toHaveBeenCalledTimes(1);

    const sql = getTestSql();
    const [row] = await sql<Array<{
      esign_status: string | null;
      esign_provider: string | null;
      esign_provider_request_id: string | null;
      esign_signer_email: string | null;
      esign_signer_name: string | null;
      esign_sent_at: Date | null;
    }>>`
      SELECT esign_status, esign_provider, esign_provider_request_id,
             esign_signer_email, esign_signer_name, esign_sent_at
        FROM ${sql(TEST_SCHEMA)}.crm_contracts WHERE id = ${id}
    `;
    expect(row.esign_status).toBe('sent');
    expect(row.esign_provider).toBe('dropboxsign');
    expect(row.esign_provider_request_id).toBe('mock_sr_id_123');
    expect(row.esign_signer_email).toBe('signer@test.local');
    expect(row.esign_signer_name).toBe('Test Signer');
    expect(row.esign_sent_at).not.toBeNull();

    // Audit event: kind='sent', payload includes signatureId so sign-url can recover it.
    const events = await sql<Array<{
      kind: string;
      actor_email: string | null;
      payload: { signatureId?: string; signatureRequestId?: string } | null;
    }>>`
      SELECT kind, actor_email, payload FROM ${sql(TEST_SCHEMA)}.crm_contract_signing_events
        WHERE contract_id = ${id} ORDER BY occurred_at ASC, id ASC
    `;
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe('sent');
    expect(events[0].actor_email).toBe('signer@test.local');
    expect(events[0].payload?.signatureId).toBe('mock_sig_id_456');
    expect(events[0].payload?.signatureRequestId).toBe('mock_sr_id_123');
  });

  it('rejects 400 when signerEmail or signerName is missing', async () => {
    const id = await seedContract({ clientId: A.client.id });
    await asTenant(A);

    const route = await import('@/app/api/portal/crm/contracts/[id]/send-for-signature/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(id) }, body: { signerEmail: '', signerName: '' } },
    );
    expect(res.status).toBe(400);
    expect(mockedCreateSig).not.toHaveBeenCalled();
  });

  it('rejects 401 when unauthenticated', async () => {
    const id = await seedContract({ clientId: A.client.id });
    await asTenant(null);

    const route = await import('@/app/api/portal/crm/contracts/[id]/send-for-signature/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(id) },
        body: { signerEmail: 'a@b.test', signerName: 'A' },
      },
    );
    expect(res.status).toBe(401);
    expect(mockedCreateSig).not.toHaveBeenCalled();
  });

  it('contract already signed: blocked by state machine (route returns 409)', async () => {
    // NOTE: brief asks for 422 here, but the route source explicitly returns
    // 409 Conflict for blocking statuses (sent/viewed/signed). We assert the
    // actual route behavior — a future change to 422 would require a code
    // edit, which is out of scope for this test ticket.
    const id = await seedContract({ clientId: A.client.id, esignStatus: 'signed' });
    await asTenant(A);

    const route = await import('@/app/api/portal/crm/contracts/[id]/send-for-signature/route');
    const res = await callHandler<{ success: boolean; error: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(id) },
        body: { signerEmail: 'signer@test.local', signerName: 'Test Signer' },
      },
    );
    expect(res.status).toBe(409);
    expect(res.data?.success).toBe(false);
    expect(mockedCreateSig).not.toHaveBeenCalled();
  });

  it('contract already in "sent" state: blocked (409)', async () => {
    const id = await seedContract({
      clientId: A.client.id, esignStatus: 'sent', esignProviderRequestId: 'sr_existing',
    });
    await asTenant(A);

    const route = await import('@/app/api/portal/crm/contracts/[id]/send-for-signature/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(id) },
        body: { signerEmail: 'signer@test.local', signerName: 'Test Signer' },
      },
    );
    expect(res.status).toBe(409);
  });

  it('@tenancy: A cannot send for B\'s contract — 404, B contract untouched, mock NOT called', async () => {
    const B = await sessionForNewClientUser('contracts-send-b');
    const idB = await seedContract({ clientId: B.client.id });
    await asTenant(A);

    const route = await import('@/app/api/portal/crm/contracts/[id]/send-for-signature/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(idB) },
        body: { signerEmail: 'attacker@evil.test', signerName: 'Bad' },
      },
    );
    expect(res.status).toBe(404);
    expect(mockedCreateSig).not.toHaveBeenCalled();

    // B's contract untouched.
    const sql = getTestSql();
    const [bRow] = await sql<Array<{
      esign_status: string | null;
      esign_provider_request_id: string | null;
      esign_signer_email: string | null;
    }>>`
      SELECT esign_status, esign_provider_request_id, esign_signer_email
        FROM ${sql(TEST_SCHEMA)}.crm_contracts WHERE id = ${idB}
    `;
    expect(bRow.esign_status).toBeNull();
    expect(bRow.esign_provider_request_id).toBeNull();
    expect(bRow.esign_signer_email).toBeNull();
  });
});
