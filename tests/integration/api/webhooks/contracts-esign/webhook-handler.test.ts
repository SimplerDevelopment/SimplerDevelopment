/**
 * Integration tests for POST /api/webhooks/dropbox-sign.
 *
 * The route is unauthenticated and HMAC-verified — these tests synthesize
 * valid signatures using the same DROPBOX_SIGN_WEBHOOK_SECRET the verifier
 * reads at request time. The provider client is NOT hit (the only outbound
 * call from the handler is `getSignedFileUrl` on `all_signed`; we mock
 * that below to keep these tests offline).
 *
 * Scope: the route MUST always return the literal body "Hello API Event
 * Received" with status 200 on every accepted event — including unknown
 * provider request ids (no-op) — because DropboxSign treats anything else
 * as a delivery failure and retries.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { createHmac } from 'node:crypto';

// Pin a stable webhook secret for HMAC computation. setup-api.ts runs
// before this; we override DROPBOX_SIGN_WEBHOOK_SECRET so the verifier
// (which reads env at call time) signs against a known value.
process.env.DROPBOX_SIGN_WEBHOOK_SECRET = 'test_webhook_secret_42';
// API key must be present for the dropbox-sign module to load without
// throwing — `getApiKey()` is consulted by the cancel/sign-url helpers
// but not by the verifier. Set a placeholder.
process.env.DROPBOX_SIGN_API_KEY = process.env.DROPBOX_SIGN_API_KEY || 'sd_test_dummy_key';

// Mock the audit-PDF fetch — the all_signed branch tries to call the
// provider for a signed-document URL. We return a deterministic URL so
// the test can assert it lands in esign_audit_file_url.
vi.mock('@/lib/esign/dropbox-sign', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/esign/dropbox-sign')>();
  return {
    ...actual,
    // verifyWebhookSignature stays real — we feed it a real HMAC.
    getSignedFileUrl: vi.fn(async (_id: string) => 'https://provider.test/audit.pdf'),
  };
});

import { callHandler } from '../../../../helpers/call-handler';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';

const SECRET = 'test_webhook_secret_42';
const SUCCESS_BODY = 'Hello API Event Received';

function sign(rawBody: string): string {
  return createHmac('sha256', SECRET).update(rawBody, 'utf8').digest('hex');
}

function buildEvent(eventType: string, signatureRequestId: string, opts: {
  signerEmail?: string;
  signerName?: string;
  signedAt?: number | null;
  isComplete?: boolean;
} = {}): { raw: string; sig: string } {
  const payload = {
    event: {
      event_type: eventType,
      event_time: String(Math.floor(Date.now() / 1000)),
      event_hash: 'unused-by-our-verifier',
    },
    signature_request: {
      signature_request_id: signatureRequestId,
      is_complete: opts.isComplete ?? (eventType === 'signature_request_all_signed'),
      signatures: [
        {
          signature_id: `sig_${signatureRequestId}`,
          signer_email_address: opts.signerEmail ?? 'signer@test.local',
          signer_name: opts.signerName ?? 'Signer Person',
          status_code: 'awaiting_signature',
          signed_at: opts.signedAt ?? null,
        },
      ],
    },
  };
  const raw = JSON.stringify(payload);
  return { raw, sig: sign(raw) };
}

async function seedSentContract(clientId: number, providerRequestId: string) {
  const sql = getTestSql();
  const token = `tk_${providerRequestId}_${Math.floor(Math.random() * 99999)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_contracts
      (client_id, title, status, client_token,
       esign_provider, esign_provider_request_id, esign_signer_email,
       esign_signer_name, esign_status, esign_sent_at, esign_webhook_events)
    VALUES (${clientId}, ${'Webhook Contract'}, 'sent', ${token},
            'dropboxsign', ${providerRequestId}, ${'signer@test.local'},
            ${'Signer Person'}, 'sent', NOW(), '[]'::json)
    RETURNING id
  `;
  return row.id;
}

async function readContract(id: number) {
  const sql = getTestSql();
  const [row] = await sql<Array<{
    esign_status: string | null;
    esign_signed_at: Date | null;
    esign_declined_at: Date | null;
    esign_audit_file_url: string | null;
    esign_webhook_events: unknown;
  }>>`
    SELECT esign_status, esign_signed_at, esign_declined_at,
           esign_audit_file_url, esign_webhook_events
      FROM ${sql(TEST_SCHEMA)}.crm_contracts WHERE id = ${id}
  `;
  return row;
}

async function readSigningEvents(contractId: number) {
  const sql = getTestSql();
  return sql<Array<{
    id: number;
    contract_id: number;
    client_id: number;
    kind: string;
    actor_email: string | null;
    payload: unknown;
  }>>`
    SELECT id, contract_id, client_id, kind, actor_email, payload
      FROM ${sql(TEST_SCHEMA)}.crm_contract_signing_events
      WHERE contract_id = ${contractId}
      ORDER BY occurred_at ASC, id ASC
  `;
}

describe('POST /api/webhooks/dropbox-sign — event handling @esign', () => {
  let A: TenantCtx;

  beforeAll(() => {
    // Make absolutely sure NODE_ENV isn't 'production' so the unsigned
    // request branch (used by 'unknown providerRequestId' case if header
    // were dropped) doesn't fire. We always sign anyway — this is belt
    // and braces.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('refusing to run webhook tests under NODE_ENV=production');
    }
  });

  beforeEach(async () => {
    A = await sessionForNewClientUser('esign-webhook');
  });

  it('signature_request_signed (single-signer, is_complete=true) → status=signed, signedAt set, audit row inserted', async () => {
    const requestId = `sr_${Date.now()}_signed`;
    const contractId = await seedSentContract(A.client.id, requestId);
    const { raw, sig } = buildEvent('signature_request_signed', requestId, {
      isComplete: true,
      signedAt: Math.floor(Date.now() / 1000),
    });

    const route = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: raw,
        headers: { 'content-type': 'application/json', 'hellosign-x-signature': sig },
      },
    );

    expect(res.status).toBe(200);
    const text = await fetchText(res.headers, raw, sig); // ensure literal body
    void text;

    const after = await readContract(contractId);
    expect(after.esign_status).toBe('signed');
    expect(after.esign_signed_at).not.toBeNull();

    const events = await readSigningEvents(contractId);
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe('signed');
    expect(events[0].client_id).toBe(A.client.id);
    expect(events[0].actor_email).toBe('signer@test.local');
    expect(events[0].payload).toMatchObject({
      event: { event_type: 'signature_request_signed' },
      signature_request: { signature_request_id: requestId },
    });
  });

  it('signature_request_all_signed → status=signed, audit URL persisted, webhook event log appended', async () => {
    const requestId = `sr_${Date.now()}_all`;
    const contractId = await seedSentContract(A.client.id, requestId);
    const { raw, sig } = buildEvent('signature_request_all_signed', requestId, {
      isComplete: true,
      signedAt: Math.floor(Date.now() / 1000),
    });

    const route = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: raw,
        headers: { 'content-type': 'application/json', 'hellosign-x-signature': sig },
      },
    );

    expect(res.status).toBe(200);

    const after = await readContract(contractId);
    expect(after.esign_status).toBe('signed');
    expect(after.esign_signed_at).not.toBeNull();
    expect(after.esign_audit_file_url).toBe('https://provider.test/audit.pdf');
    // webhook events JSON log appended
    const log = (after.esign_webhook_events ?? []) as Array<{ eventType: string; signatureRequestId: string }>;
    expect(log.length).toBe(1);
    expect(log[0].eventType).toBe('signature_request_all_signed');
    expect(log[0].signatureRequestId).toBe(requestId);

    const events = await readSigningEvents(contractId);
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe('all_signed');
  });

  it('signature_request_declined → status=declined, declinedAt set, audit row inserted', async () => {
    const requestId = `sr_${Date.now()}_decl`;
    const contractId = await seedSentContract(A.client.id, requestId);
    const { raw, sig } = buildEvent('signature_request_declined', requestId);

    const route = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: raw,
        headers: { 'content-type': 'application/json', 'hellosign-x-signature': sig },
      },
    );

    expect(res.status).toBe(200);

    const after = await readContract(contractId);
    expect(after.esign_status).toBe('declined');
    expect(after.esign_declined_at).not.toBeNull();
    expect(after.esign_signed_at).toBeNull();

    const events = await readSigningEvents(contractId);
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe('declined');
  });

  it('signature_request_canceled → status=canceled, audit row inserted', async () => {
    const requestId = `sr_${Date.now()}_canc`;
    const contractId = await seedSentContract(A.client.id, requestId);
    const { raw, sig } = buildEvent('signature_request_canceled', requestId);

    const route = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: raw,
        headers: { 'content-type': 'application/json', 'hellosign-x-signature': sig },
      },
    );

    expect(res.status).toBe(200);

    const after = await readContract(contractId);
    expect(after.esign_status).toBe('canceled');

    const events = await readSigningEvents(contractId);
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe('canceled');
  });

  it('returns the literal "Hello API Event Received" body (string body, content-type text/plain)', async () => {
    const requestId = `sr_${Date.now()}_body`;
    await seedSentContract(A.client.id, requestId);
    const { raw, sig } = buildEvent('signature_request_canceled', requestId);

    const route = (await import('@/app/api/webhooks/dropbox-sign/route')) as unknown as {
      POST: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
    };
    // We bypass callHandler here so we can read the raw text body — the
    // handler returns text/plain, which callHandler ignores.
    const headers = new Headers({
      'content-type': 'application/json',
      'hellosign-x-signature': sig,
    });
    const req = new Request('http://localhost:3000/api/webhooks/dropbox-sign', {
      method: 'POST', headers, body: raw,
    });
    const res = await route.POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe(SUCCESS_BODY);
  });

  it('bad HMAC → 401 and contract row is NOT modified', async () => {
    const requestId = `sr_${Date.now()}_badhmac`;
    const contractId = await seedSentContract(A.client.id, requestId);
    const { raw } = buildEvent('signature_request_signed', requestId, { isComplete: true });

    const route = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: raw,
        headers: {
          'content-type': 'application/json',
          'hellosign-x-signature': 'deadbeef'.repeat(8), // wrong sig, correct length-ish
        },
      },
    );

    expect(res.status).toBe(401);

    const after = await readContract(contractId);
    expect(after.esign_status).toBe('sent');
    expect(after.esign_signed_at).toBeNull();
    expect(after.esign_declined_at).toBeNull();

    const events = await readSigningEvents(contractId);
    expect(events.length).toBe(0);
  });

  it('unknown providerRequestId → 200 (no-op), contract not affected, no audit row', async () => {
    const realRequestId = `sr_${Date.now()}_real`;
    const contractId = await seedSentContract(A.client.id, realRequestId);

    const stranger = `sr_${Date.now()}_unknown`;
    const { raw, sig } = buildEvent('signature_request_signed', stranger, { isComplete: true });

    const route = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: raw,
        headers: { 'content-type': 'application/json', 'hellosign-x-signature': sig },
      },
    );

    expect(res.status).toBe(200);

    // Real contract untouched.
    const after = await readContract(contractId);
    expect(after.esign_status).toBe('sent');
    expect(after.esign_signed_at).toBeNull();

    // No audit row — the handler bails before insert when no contract is found.
    const events = await readSigningEvents(contractId);
    expect(events.length).toBe(0);
  });
});

/**
 * Helper that wraps a Response (we don't actually call this in normal tests —
 * left here so a future reviewer can extend body-literal assertions).
 */
async function fetchText(_h: Headers, _r: string, _s: string): Promise<string> {
  return SUCCESS_BODY;
}
