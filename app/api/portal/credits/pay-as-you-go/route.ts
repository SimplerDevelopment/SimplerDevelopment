import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { setPayAsYouGo, getBalance } from '@/lib/ai-credits';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ error: 'No client' }, { status: 404 });

  const { enabled } = await req.json();
  if (typeof enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 });

  await setPayAsYouGo(client.id, enabled);
  const balance = await getBalance(client.id);

  return NextResponse.json({ payAsYouGo: balance.payAsYouGo });
}
