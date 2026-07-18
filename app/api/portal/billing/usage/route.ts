import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { computeUsageSnapshot } from '@/lib/billing/usage-alerts';
import { getBalance } from '@/lib/ai-credits';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/billing/usage
 *
 * Returns the client's current-period usage snapshot, pay-as-you-go flag,
 * and AI credit balance.
 *
 * Response:
 *   { success: true, data: { snapshot, payAsYouGo, creditBalance } }
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  const [snapshot, creditBalance] = await Promise.all([
    computeUsageSnapshot(client.id),
    getBalance(client.id),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      snapshot,
      payAsYouGo: creditBalance.payAsYouGo,
      creditBalance: {
        balance: creditBalance.balance,
        monthlyGrant: creditBalance.monthlyGrant,
      },
    },
  });
}
