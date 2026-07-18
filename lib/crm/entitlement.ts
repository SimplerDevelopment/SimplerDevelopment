import { NextResponse } from 'next/server';
import { hasServiceAccess } from '@/lib/portal-auth';

/**
 * Paid-module gate: CRM writes require an active CRM (or bundle) subscription.
 * Mirrors the MCP layer's requireService(clientId, 'crm'). Returns the 403
 * response when the client is not entitled, or null when access is allowed.
 *
 * Reads stay ungated by design (ADR paid-module-entitlement-vs-scope-gating);
 * every POST/PUT/PATCH/DELETE under app/api/portal/crm/** must clear this gate
 * — enforced by tests/unit/paid-module-entitlement-guard.test.ts.
 */
export async function crmEntitlementError(clientId: number): Promise<NextResponse | null> {
  if (await hasServiceAccess(clientId, 'crm')) return null;
  return NextResponse.json(
    {
      success: false,
      message: 'This feature requires an active crm subscription.',
      requiresService: 'crm',
      upsellUrl: '/portal/services',
    },
    { status: 403 },
  );
}
