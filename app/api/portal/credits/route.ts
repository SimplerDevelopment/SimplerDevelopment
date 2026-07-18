import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { getBalance, getLedger, getMonthlyUsage, getCreditPackages } from '@/lib/ai-credits';

// Cached package list — global (not per-client), admin-curated, changes rarely.
const getCreditPackagesCached = unstable_cache(
  () => getCreditPackages(),
  ['portal-credit-packages'],
  { revalidate: 300, tags: ['credit-packages'] },
);

// Per-client balance + monthly-usage snapshot. 30s TTL is short enough that
// bell-bar staleness is imperceptible but long enough to absorb fan-out from
// every page nav. Mutation paths (deductCredits, addPurchasedCredits,
// grantMonthlyCredits, setPayAsYouGo) call
// `revalidateTag('credits:'+clientId)` to invalidate immediately.
//
// The ledger is intentionally NOT cached here — it accepts arbitrary
// limit/offset pagination AND must reflect the latest mutation so the user
// sees "you just spent X" without a 30s lag.
async function getCreditSnapshotCached(clientId: number) {
  const inner = async () => {
    const [balance, monthlyUsage] = await Promise.all([
      getBalance(clientId),
      getMonthlyUsage(clientId),
    ]);
    return { balance, monthlyUsage };
  };
  try {
    // `await` inside the try so the async "incrementalCache missing" rejection
    // is caught (a bare `return promise` escapes try/catch). Falls back to the
    // uncached path outside a request context (cron/MCP/tests).
    return await unstable_cache(
      inner,
      ['portal-credit-snapshot', String(clientId)],
      { revalidate: 30, tags: ['credits', `credits:${clientId}`] },
    )();
  } catch {
    return inner();
  }
}

// Packages list is cached at module scope; guard the call so a non-request
// context (cron/MCP/tests) degrades to a direct fetch instead of throwing.
async function getCreditPackagesSafe() {
  try {
    return await getCreditPackagesCached();
  } catch {
    return getCreditPackages();
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ error: 'No client' }, { status: 404 });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const [snapshot, ledger, packages] = await Promise.all([
    getCreditSnapshotCached(client.id),
    getLedger(client.id, { limit, offset }),
    getCreditPackagesSafe(),
  ]);

  const { balance, monthlyUsage } = snapshot;

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
