import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clientApiKeys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getClientEntitlements } from '@/lib/billing/entitlements';
import { requiredByokProviders, allByokProviders } from '@/lib/billing/domain-catalog';

/**
 * GET /api/portal/billing/byok-status
 *
 * Returns the client's billingMode, the BYOK providers required for their
 * active domains, which are connected, and which are missing.
 *
 * Auth: portal read (viewer+).
 */
export async function GET() {
  const authResult = await authorizePortal({ action: 'read' });
  if (isAuthError(authResult)) return authResult.response;

  const { client } = authResult;

  const entitlements = await getClientEntitlements(client.id, client);
  const { domains, gatingBypassed } = entitlements;

  const required = gatingBypassed
    ? allByokProviders()
    : requiredByokProviders([...domains]);

  const connectedRows = await db
    .selectDistinct({ provider: clientApiKeys.provider })
    .from(clientApiKeys)
    .where(eq(clientApiKeys.clientId, client.id));

  const connected = connectedRows.map((r) => r.provider);
  const missing = required.filter((p) => !connected.includes(p));

  return NextResponse.json({
    success: true,
    data: {
      billingMode: client.billingMode,
      required,
      connected,
      missing,
    },
  });
}
