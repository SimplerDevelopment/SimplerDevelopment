import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { addDomain } from '@/lib/vercel';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { siteId } = await params;
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });
  if (!site.vercelProjectId) {
    return NextResponse.json({ success: false, message: 'Website must be provisioned before adding a custom domain.' }, { status: 400 });
  }

  const body = await req.json();
  const { customDomain } = body;

  if (!customDomain || typeof customDomain !== 'string') {
    return NextResponse.json({ success: false, message: 'customDomain is required.' }, { status: 400 });
  }

  const cleanDomain = customDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();

  try {
    await addDomain(site.vercelProjectId, cleanDomain);

    await db.update(clientWebsites)
      .set({ domain: cleanDomain, updatedAt: new Date() })
      .where(eq(clientWebsites.id, site.id));

    return NextResponse.json({
      success: true,
      data: {
        domain: cleanDomain,
        dnsInstructions: [
          { type: 'CNAME', host: 'www', value: 'cname.vercel-dns.com', notes: 'Points www subdomain to Vercel' },
          { type: 'A', host: '@', value: '76.76.21.21', notes: 'Points root domain to Vercel' },
        ],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add domain';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
