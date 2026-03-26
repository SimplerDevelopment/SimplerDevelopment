import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientDnsProviders } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { verifyCredentials as verifyGoDaddy } from '@/lib/godaddy-dns';
import { verifyCredentials as verifyCloudflare } from '@/lib/cloudflare-client-dns';

/** GET - List connected DNS providers */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const providers = await db
    .select({
      id: clientDnsProviders.id,
      provider: clientDnsProviders.provider,
      createdAt: clientDnsProviders.createdAt,
    })
    .from(clientDnsProviders)
    .where(eq(clientDnsProviders.clientId, client.id));

  return NextResponse.json({ success: true, data: providers });
}

/** POST - Add or update DNS provider credentials */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();
  const { provider, apiKey, apiSecret } = body;

  if (!provider || !['godaddy', 'cloudflare'].includes(provider)) {
    return NextResponse.json({ success: false, message: 'provider must be "godaddy" or "cloudflare"' }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ success: false, message: 'apiKey is required' }, { status: 400 });
  }

  if (provider === 'godaddy' && !apiSecret) {
    return NextResponse.json({ success: false, message: 'GoDaddy requires both apiKey and apiSecret' }, { status: 400 });
  }

  // Verify the credentials work
  try {
    if (provider === 'godaddy') {
      const result = await verifyGoDaddy({ apiKey, apiSecret });
      if (!result.valid) {
        return NextResponse.json({ success: false, message: 'Invalid GoDaddy API credentials. Check your key and secret.' }, { status: 400 });
      }
    } else {
      const result = await verifyCloudflare({ apiKey });
      if (!result.valid) {
        return NextResponse.json({ success: false, message: 'Invalid Cloudflare API token. Make sure it has DNS edit permissions.' }, { status: 400 });
      }
    }
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to verify credentials. Check your API keys.' }, { status: 400 });
  }

  // Upsert credentials
  const [existing] = await db
    .select()
    .from(clientDnsProviders)
    .where(and(eq(clientDnsProviders.clientId, client.id), eq(clientDnsProviders.provider, provider)))
    .limit(1);

  if (existing) {
    await db.update(clientDnsProviders)
      .set({ apiKey, apiSecret: apiSecret || null, updatedAt: new Date() })
      .where(eq(clientDnsProviders.id, existing.id));
  } else {
    await db.insert(clientDnsProviders).values({
      clientId: client.id,
      provider,
      apiKey,
      apiSecret: apiSecret || null,
    });
  }

  return NextResponse.json({
    success: true,
    message: `${provider === 'godaddy' ? 'GoDaddy' : 'Cloudflare'} API credentials saved and verified.`,
  });
}

/** DELETE - Remove DNS provider credentials */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const provider = searchParams.get('provider');

  if (!provider) {
    return NextResponse.json({ success: false, message: 'provider query param required' }, { status: 400 });
  }

  await db.delete(clientDnsProviders)
    .where(and(eq(clientDnsProviders.clientId, client.id), eq(clientDnsProviders.provider, provider)));

  return NextResponse.json({ success: true, message: 'Provider credentials removed.' });
}
