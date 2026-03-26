import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, websiteDomains, clientDnsProviders } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { configureVercelDns as godaddyConfigureDns } from '@/lib/godaddy-dns';
import { configureVercelDns as cloudflareConfigureDns } from '@/lib/cloudflare-client-dns';

/** POST - Auto-configure DNS records via the client's DNS provider */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string; domainId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, domainId } = await params;
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  const [domainRecord] = await db
    .select()
    .from(websiteDomains)
    .where(and(eq(websiteDomains.id, parseInt(domainId)), eq(websiteDomains.websiteId, site.id)))
    .limit(1);

  if (!domainRecord) return NextResponse.json({ success: false, message: 'Domain not found' }, { status: 404 });

  const body = await req.json();
  const { provider } = body; // 'godaddy' | 'cloudflare'

  if (!provider || !['godaddy', 'cloudflare'].includes(provider)) {
    return NextResponse.json({ success: false, message: 'provider must be "godaddy" or "cloudflare"' }, { status: 400 });
  }

  // Look up the client's stored credentials for this provider
  const [providerCreds] = await db
    .select()
    .from(clientDnsProviders)
    .where(and(eq(clientDnsProviders.clientId, client.id), eq(clientDnsProviders.provider, provider)))
    .limit(1);

  if (!providerCreds) {
    return NextResponse.json({
      success: false,
      message: `No ${provider === 'godaddy' ? 'GoDaddy' : 'Cloudflare'} API credentials found. Please add your API key first.`,
      code: 'NO_CREDENTIALS',
    }, { status: 400 });
  }

  try {
    let result;

    if (provider === 'godaddy') {
      if (!providerCreds.apiSecret) {
        return NextResponse.json({ success: false, message: 'GoDaddy requires both API key and secret.' }, { status: 400 });
      }
      result = await godaddyConfigureDns(
        { apiKey: providerCreds.apiKey, apiSecret: providerCreds.apiSecret },
        domainRecord.domain,
      );
    } else {
      result = await cloudflareConfigureDns(
        { apiKey: providerCreds.apiKey },
        domainRecord.domain,
      );
    }

    // Update domain record
    await db.update(websiteDomains).set({
      dnsProvider: provider,
      dnsConfigured: true,
      dnsConfiguredAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(websiteDomains.id, domainRecord.id));

    return NextResponse.json({
      success: true,
      message: `DNS records configured via ${provider === 'godaddy' ? 'GoDaddy' : 'Cloudflare'}. Verification may take a few minutes.`,
      data: { records: result.records },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to configure DNS';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
