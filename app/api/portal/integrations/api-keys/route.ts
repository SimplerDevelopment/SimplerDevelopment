/**
 * BYOK provider keys — list + create.
 *
 * Stores AES-256-GCM-encrypted Anthropic / OpenAI keys per client. The raw
 * key is only ever in transit on the POST request body; it is encrypted
 * on the server before write and never returned in any response. Callers
 * see only the redacted `keyPreview` (first 6 + last 4 chars).
 *
 * Schema lives in `clientApiKeys` (see lib/db/schema/billing.ts).
 *
 * Auth: portal-scoped — the active client is resolved from the session
 * cookie. Multi-tenant isolation is enforced by `clientId` filtering on
 * every query.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientApiKeys } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { encryptApiKey, maskApiKey } from '@/lib/crypto/api-key';
import { getClientEntitlements } from '@/lib/billing/entitlements';

type Provider = 'anthropic' | 'openai' | 'resend' | 'dropbox_sign';
const ALLOWED_PROVIDERS: Provider[] = ['anthropic', 'openai', 'resend', 'dropbox_sign'];

// "Bring your own AI key" (you pay your own tokens) is a Scale-tier unlock —
// the BYOK inversion. Only the AI providers are gated; `resend`/`dropbox_sign`
// are ordinary integration credentials available on any tier.
const BYOK_AI_PROVIDERS: Provider[] = ['anthropic', 'openai'];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const rows = await db
    .select({
      id: clientApiKeys.id,
      provider: clientApiKeys.provider,
      label: clientApiKeys.label,
      encryptedKey: clientApiKeys.encryptedKey,
      lastUsedAt: clientApiKeys.lastUsedAt,
      createdAt: clientApiKeys.createdAt,
      updatedAt: clientApiKeys.updatedAt,
    })
    .from(clientApiKeys)
    .where(eq(clientApiKeys.clientId, client.id))
    .orderBy(desc(clientApiKeys.createdAt));

  // Redact: never ship the encrypted blob to the browser. Use the masked
  // display ("sk-ant-…AbC1") so users can recognise which key is which.
  const data = rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    label: r.label,
    keyPreview: maskApiKey(r.encryptedKey),
    lastUsedAt: r.lastUsedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const provider = String(body.provider ?? '').trim().toLowerCase() as Provider;
  const apiKey = String(body.apiKey ?? '').trim();
  const label: string | null = body.label ? String(body.label).trim().slice(0, 100) : null;

  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return NextResponse.json({
      success: false,
      message: `Unsupported provider. Use one of: ${ALLOWED_PROVIDERS.join(', ')}.`,
    }, { status: 400 });
  }

  // Scale-only gate: a client may only add their own AI provider key when their
  // tier is BYOK-eligible. Fail closed — a non-eligible client cannot store an
  // Anthropic/OpenAI key (and so resolveClientApiKey will never use one). The
  // resolver re-checks eligibility at inference time, so a downgrade also stops
  // BYOK from being used. Integration keys (resend/dropbox_sign) are not gated.
  if (BYOK_AI_PROVIDERS.includes(provider)) {
    const entitlements = await getClientEntitlements(client.id, client);
    if (!entitlements.byokEligible) {
      return NextResponse.json({
        success: false,
        message:
          'Bring-your-own AI keys are available on the Scale plan. ' +
          'Upgrade to Scale to use your own Anthropic or OpenAI key and pay providers directly.',
      }, { status: 403 });
    }
  }

  if (!apiKey || apiKey.length < 10) {
    return NextResponse.json({ success: false, message: 'A valid API key is required.' }, { status: 400 });
  }

  // Light shape validation — fail fast on obvious wrong-provider pastes.
  if (provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
    return NextResponse.json({
      success: false,
      message: 'Anthropic keys start with "sk-ant-". Double-check the key you pasted.',
    }, { status: 400 });
  }
  if (provider === 'openai' && !apiKey.startsWith('sk-')) {
    return NextResponse.json({
      success: false,
      message: 'OpenAI keys start with "sk-". Double-check the key you pasted.',
    }, { status: 400 });
  }

  let encryptedKey: string;
  try {
    encryptedKey = encryptApiKey(apiKey);
  } catch (err) {
    console.error('[POST /api/portal/integrations/api-keys] encrypt failed', err);
    return NextResponse.json({ success: false, message: 'Server is missing ENCRYPTION_KEY config.' }, { status: 500 });
  }

  const [record] = await db.insert(clientApiKeys).values({
    clientId: client.id,
    provider,
    encryptedKey,
    label,
  }).returning({
    id: clientApiKeys.id,
    provider: clientApiKeys.provider,
    label: clientApiKeys.label,
    createdAt: clientApiKeys.createdAt,
  });

  return NextResponse.json({
    success: true,
    data: {
      id: record.id,
      provider: record.provider,
      label: record.label,
      keyPreview: maskApiKey(encryptedKey),
      createdAt: record.createdAt,
    },
  }, { status: 201 });
}
