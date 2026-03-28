import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { getBalance, getLedger, getMonthlyUsage, getCreditPackages } from '@/lib/ai-credits';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ error: 'No client' }, { status: 404 });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const [balance, monthlyUsage, ledger, packages] = await Promise.all([
    getBalance(client.id),
    getMonthlyUsage(client.id),
    getLedger(client.id, { limit, offset }),
    getCreditPackages(),
  ]);

  return NextResponse.json({
    balance: balance.balance,
    monthlyGrant: balance.monthlyGrant,
    payAsYouGo: balance.payAsYouGo,
    monthlyUsage,
    ledger,
    packages: packages.map(p => ({
      id: p.id,
      name: p.name,
      tokens: p.tokens,
      price: p.price,
    })),
  });
}
