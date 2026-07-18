/**
 * POST /api/webhooks/dropbox-sign
 *
 * Webhook endpoint for DropboxSign (formerly HelloSign) signature events.
 * Unauthenticated — verified via HMAC-SHA256 over the raw body.
 *
 * DropboxSign requires the response body to be the literal string
 * "Hello API Event Received" — anything else is treated as a delivery
 * failure and gets retried.
 *
 * Events handled:
 *   signature_request_signed       — one signer done; stay 'sent' until all-signed
 *   signature_request_all_signed   — terminal: status='signed', fetch audit PDF
 *   signature_request_declined     — terminal: status='declined'
 *   signature_request_canceled     — terminal: status='canceled'
 *   signature_request_viewed       — promote 'sent' → 'viewed' (best effort)
 *
 * Note: DropboxSign sends the JSON event in a multipart form field named
 * `json` (not as the request body). We support both shapes — direct JSON
 * body and form-encoded — but the HMAC always covers the `json` value
 * (not the multipart envelope). That's how the provider documents it.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { crmContracts, crmContractSigningEvents } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { verifyWebhookSignature, getSignedFileUrl } from '@/lib/esign/dropbox-sign';
import type { ContractEsignWebhookEvent } from '@/lib/db/schema/crm';

export const runtime = 'nodejs';

const SUCCESS_BODY = 'Hello API Event Received';

type DropboxSignEvent = {
  event?: {
    event_type?: string;
    event_time?: string;
    event_hash?: string;
  };
  signature_request?: {
    signature_request_id?: string;
    signatures?: Array<{
      signature_id?: string;
      signer_email_address?: string;
      signer_name?: string;
      status_code?: string;
      signed_at?: number | null;
    }>;
    is_complete?: boolean;
    is_declined?: boolean;
    files_url?: string;
  };
};

/**
 * Extracts the JSON payload from either a direct JSON body or
 * DropboxSign's multipart `json` form field. Returns the raw string
 * (for HMAC verification) and the parsed object.
 */
async function extractEventPayload(req: Request): Promise<{ raw: string; parsed: DropboxSignEvent } | null> {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const raw = await req.text();
    try {
      return { raw, parsed: JSON.parse(raw) as DropboxSignEvent };
    } catch {
      return null;
    }
  }

  // Multipart or x-www-form-urlencoded: pull the `json` field.
  try {
    const form = (await req.formData()) as unknown as globalThis.FormData;
    const value = form.get('json');
    if (typeof value !== 'string') return null;
    return { raw: value, parsed: JSON.parse(value) as DropboxSignEvent };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const sigHeader =
    req.headers.get('hellosign-x-signature') || // legacy
    req.headers.get('Hellosign-X-Signature') ||
    req.headers.get('x-hellosign-signature') ||
    req.headers.get('x-dropbox-sign-signature');

  const payload = await extractEventPayload(req);
  if (!payload) {
    return new NextResponse('invalid payload', { status: 400 });
  }

  // DropboxSign signs (api_key + event_time + event_type) by default for the
  // event_hash field. We use HMAC over the raw JSON body if a webhook secret
  // is configured — this is the recommended verification path. If no
  // signature header is present and we're not in production, accept the
  // event for local testing — never in production.
  if (sigHeader) {
    const ok = await verifyWebhookSignature(payload.raw, sigHeader);
    if (!ok) {
      return new NextResponse('invalid signature', { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return new NextResponse('missing signature', { status: 401 });
  }

  const eventType = payload.parsed.event?.event_type;
  const requestId = payload.parsed.signature_request?.signature_request_id;
  if (!eventType || !requestId) {
    // Test/ping events have no signature_request — ack and move on.
    return new NextResponse(SUCCESS_BODY, { status: 200 });
  }

  // Find the contract by provider request id.
  const [contract] = await db
    .select()
    .from(crmContracts)
    .where(eq(crmContracts.esignProviderRequestId, requestId))
    .limit(1);

  if (!contract) {
    // No matching contract — could be a test event or stale. Always ack.
    return new NextResponse(SUCCESS_BODY, { status: 200 });
  }

  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };
  let kind = 'webhook';
  let actorEmail: string | null = null;

  // Surface the signer email if this event is signer-specific.
  const signers = payload.parsed.signature_request?.signatures ?? [];
  const targetSig = signers.find(s => s.signed_at != null) || signers[0];
  if (targetSig?.signer_email_address) {
    actorEmail = targetSig.signer_email_address;
  }

  switch (eventType) {
    case 'signature_request_viewed':
      kind = 'viewed';
      if (contract.esignStatus === 'sent') {
        updates.esignStatus = 'viewed';
      }
      break;
    case 'signature_request_signed':
      kind = 'signed';
      // Single-signer flow: if all complete, the all_signed event will
      // promote to 'signed'. For multi-signer (out of v1 scope) we'd
      // promote partial states here.
      if (payload.parsed.signature_request?.is_complete) {
        updates.esignStatus = 'signed';
        updates.esignSignedAt = now;
      }
      break;
    case 'signature_request_all_signed':
      kind = 'all_signed';
      updates.esignStatus = 'signed';
      updates.esignSignedAt = now;
      // Persist the audit PDF link if we can fetch it. Best-effort.
      try {
        const auditUrl = await getSignedFileUrl(requestId);
        if (auditUrl) updates.esignAuditFileUrl = auditUrl;
      } catch (err) {
        console.error('[webhooks/dropbox-sign] getSignedFileUrl failed', err);
      }
      break;
    case 'signature_request_declined':
      kind = 'declined';
      updates.esignStatus = 'declined';
      updates.esignDeclinedAt = now;
      break;
    case 'signature_request_canceled':
      kind = 'canceled';
      updates.esignStatus = 'canceled';
      break;
    default:
      // Unknown event — still record it for audit, but don't change status.
      break;
  }

  // Append to the contract.esign_webhook_events JSON log (cap to avoid
  // unbounded growth — keep the last 50).
  const newEntry: ContractEsignWebhookEvent = {
    eventType,
    receivedAt: now.toISOString(),
    signatureRequestId: requestId,
    signatureId: targetSig?.signature_id ?? null,
  };
  const existing = (contract.esignWebhookEvents ?? []) as ContractEsignWebhookEvent[];
  const trimmed = [...existing, newEntry].slice(-50);
  updates.esignWebhookEvents = trimmed;

  await db.update(crmContracts).set(updates).where(eq(crmContracts.id, contract.id));

  await db.insert(crmContractSigningEvents).values({
    contractId: contract.id,
    clientId: contract.clientId,
    kind,
    actorEmail,
    payload: payload.parsed as unknown as Record<string, unknown>,
  });

  // Suppress unused import lint; sql helper is here for future raw-SQL use.
  void sql;

  return new NextResponse(SUCCESS_BODY, { status: 200 });
}

// GET handler for health-check pings (DropboxSign sometimes pings on registration).
export async function GET() {
  return new NextResponse(SUCCESS_BODY, { status: 200 });
}
