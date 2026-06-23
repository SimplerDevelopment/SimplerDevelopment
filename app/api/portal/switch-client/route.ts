import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClients } from '@/lib/portal-client';
import { COOKIE_NAME } from '@/lib/active-client';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { clientId } = await req.json();
  if (!clientId || typeof clientId !== 'number') {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }

  const userId = parseInt(session.user.id, 10);
  const allClients = await getPortalClients(userId);

  const target = allClients.find(c => c.id === clientId);
  if (!target) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const response = NextResponse.json({
    activeClientId: target.id,
    company: target.company,
  });

  response.cookies.set(COOKIE_NAME, String(target.id), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    secure: process.env.NODE_ENV === 'production',
    domain: process.env.NODE_ENV === 'production' ? '.simplerdevelopment.com' : undefined,
  });

  return response;
}
