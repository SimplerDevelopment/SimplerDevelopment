/**
 * Integration tests for GET /api/portal/crm/contracts/[id]/sign-url.
 *
 * The route mints a one-time embedded sign URL via the DropboxSign provider.
 * It allows two roles:
 *   - the contract owner (logged-in user whose active client owns the contract)
 *   - the signer (logged-in user whose email matches contract.esignSignerEmail)
 *
 * NOTE on status codes: the brief mentions "422" for invalid status and
 * "403" for non-owner-non-signer. The route source returns 409 in both
 * "not yet sent" and "status not in {sent, viewed}" cases. We assert the
 * actual route behavior (403 for forbidden, 409 for invalid-status).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/esign/dropbox-sign', () => ({
  getEmbeddedSignUrl: vi.fn(async (_id: string) => ({
    signUrl: 'https://provider.test/embed/abc',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  })),
  createSignatureRequest: vi.fn(),
  cancelSignatureRequest: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  getSignedFileUrl: vi.fn(),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;
import { getEmbeddedSignUrl } from '@/lib/esign/dropbox-sign';
const mockedGetUrl = getEmbeddedSignUrl as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

/**
 * Seeds a contract that is mid-signature (status='sent', has a 'sent'
 * audit row carrying the signatureId so sign-url can recover it).
 */
async function seedContractInSent(opts: {
  clientId: number;
  signerEmail?: string;
  esignStatus?: string;
}) {
  const sql = getTestSql();
  const token = `tk_${Date.now()}_${Math.floor(Math.random() * 99999)}`;
  const requestId = `sr_${Date.now()}_${Math.floor(Math.random() * 99999)}`;
  const signatureId = `sig_${Date.now()}_${Math.floor(Math.random() * 99999)}`;

  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_contracts
      (client_id, title, status, client_token,
       esign_provider, esign_provider_request_id, esign_signer_email,
       esign_signer_name, esign_status, esign_sent_at)
    VALUES (${opts.clientId}, ${'Sign URL Contract'}, 'sent', ${token},
            'dropboxsign', ${requestId}, ${opts.signerEmail ?? 'signer@test.local'},
            'Signer Person', ${opts.esignStatus ?? 'sent'}, NOW())
    RETURNING id
  `;

  // Audit row containing the signatureId — required by the route.
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_contract_signing_events
      (contract_id, client_id, kind, actor_email, payload)
    VALUES (${row.id}, ${opts.clientId}, 'sent', ${opts.signerEmail ?? 'signer@test.local'},
            ${JSON.stringify({ signatureRequestId: requestId, signatureId })}::json)
  `;

  return { id: row.id, requestId, signatureId };
}

describe('GET /api/portal/crm/contracts/[id]/sign-url @esign', () => {
  let owner: TenantCtx;

  beforeEach(async () => {
    owner = await sessionForNewClientUser('signurl-owner');
    mockedGetUrl.mockClear();
    mockedGetUrl.mockResolvedValue({
      signUrl: 'https://provider.test/embed/abc',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
  });

  it('owner path: contract owner gets the embedded sign URL', async () => {
    const { id } = await seedContractInSent({ clientId: owner.client.id });
    await asTenant(owner);

    const route = await import('@/app/api/portal/crm/contracts/[id]/sign-url/route');
    const res = await callHandler<{
      success: boolean;
      data: { signUrl: string; expiresAt: string };
    }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(id) } },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.signUrl).toBe('https://provider.test/embed/abc');
    expect(typeof res.data?.data.expiresAt).toBe('string');
    expect(mockedGetUrl).toHaveBeenCalledTimes(1);
  });

  it('signer path: a logged-in user whose email matches esignSignerEmail gets the URL (and a "viewed" audit row)', async () => {
    // Create a separate user whose email matches the contract's signerEmail.
    // The user does NOT belong to the owner's client — this is the cross-
    // tenant "external signer" case the route is designed to support.
    const sql = getTestSql();
    const signerEmail = `external-signer-${Date.now()}@test.local`;
    const [signerUser] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
      VALUES (${'External Signer'}, ${signerEmail}, ${'x'}, 'editor', true)
      RETURNING id
    `;
    // We also need a client row so getPortalClient doesn't return null —
    // it would otherwise fail before the signer check. Give them an
    // unrelated solo client.
    const [signerOwnClient] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.clients (user_id, company)
      VALUES (${signerUser.id}, ${'Signer Solo Client'})
      RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.client_members (client_id, user_id, role)
      VALUES (${signerOwnClient.id}, ${signerUser.id}, 'owner')
    `;

    const { id } = await seedContractInSent({
      clientId: owner.client.id, // contract belongs to OWNER's tenant, not signer's
      signerEmail,
    });

    // Forge a session as the signer user (not the owner).
    mockedAuth.mockResolvedValue({
      user: {
        id: String(signerUser.id),
        email: signerEmail,
        name: 'External Signer',
        role: 'editor',
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const route = await import('@/app/api/portal/crm/contracts/[id]/sign-url/route');
    const res = await callHandler<{ success: boolean; data: { signUrl: string } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(id) } },
    );

    expect(res.status).toBe(200);
    expect(res.data?.data.signUrl).toBe('https://provider.test/embed/abc');

    // The signer path inserts an 'opened' audit row and promotes status sent → viewed.
    const events = await sql<Array<{ kind: string; actor_email: string | null }>>`
      SELECT kind, actor_email FROM ${sql(TEST_SCHEMA)}.crm_contract_signing_events
        WHERE contract_id = ${id} ORDER BY occurred_at ASC, id ASC
    `;
    const kinds = events.map(e => e.kind);
    expect(kinds).toContain('opened');

    const [contractAfter] = await sql<Array<{ esign_status: string | null }>>`
      SELECT esign_status FROM ${sql(TEST_SCHEMA)}.crm_contracts WHERE id = ${id}
    `;
    expect(contractAfter.esign_status).toBe('viewed');
  });

  it('forbidden: a third party (neither owner nor signer-by-email) → 403, mock NOT called', async () => {
    const stranger = await sessionForNewClientUser('signurl-stranger');
    const { id } = await seedContractInSent({
      clientId: owner.client.id,
      signerEmail: 'someone-else@test.local', // not stranger.user.email
    });
    await asTenant(stranger);

    const route = await import('@/app/api/portal/crm/contracts/[id]/sign-url/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(id) } },
    );

    expect(res.status).toBe(403);
    expect(mockedGetUrl).not.toHaveBeenCalled();
  });

  it('invalid status: contract not in {sent, viewed} → 409 (signed), mock NOT called', async () => {
    // NOTE: brief asks for 422; route returns 409. Asserting actual behavior.
    const { id } = await seedContractInSent({
      clientId: owner.client.id,
      esignStatus: 'signed',
    });
    await asTenant(owner);

    const route = await import('@/app/api/portal/crm/contracts/[id]/sign-url/route');
    const res = await callHandler<{ success: boolean; error: string }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(id) } },
    );

    expect(res.status).toBe(409);
    expect(res.data?.success).toBe(false);
    expect(mockedGetUrl).not.toHaveBeenCalled();
  });

  it('invalid status: declined → 409', async () => {
    const { id } = await seedContractInSent({
      clientId: owner.client.id,
      esignStatus: 'declined',
    });
    await asTenant(owner);

    const route = await import('@/app/api/portal/crm/contracts/[id]/sign-url/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(id) } },
    );

    expect(res.status).toBe(409);
    expect(mockedGetUrl).not.toHaveBeenCalled();
  });

  it('rejects 401 when unauthenticated', async () => {
    const { id } = await seedContractInSent({ clientId: owner.client.id });
    await asTenant(null);

    const route = await import('@/app/api/portal/crm/contracts/[id]/sign-url/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(401);
    expect(mockedGetUrl).not.toHaveBeenCalled();
  });
});
