import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getClientEntitlements } from '@/lib/billing/entitlements';

export async function GET() {
  const auth = await authorizePortal({ action: 'read' });
  if (isAuthError(auth)) return auth.response;

  const ent = await getClientEntitlements(auth.client.id, {
    billingMode: auth.client.billingMode,
    brainTrialUntil: auth.client.brainTrialUntil,
    byokEligibleOverride: auth.client.byokEligibleOverride,
  });

  return NextResponse.json({
    success: true,
    data: {
      mode: ent.mode,
      domains: [...ent.domains],
      hasBundle: ent.hasBundle,
      gatingBypassed: ent.gatingBypassed,
    },
  });
}
