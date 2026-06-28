import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { storeCustomerMessages } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

// GET /api/portal/websites/[siteId]/store/customer-messages — list support
// messages for the site, optionally filtered by ?status=open|replied|resolved|closed.
// Portal-REST mirror of the store_customer_messages_list MCP tool.
export async function GET(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'store' });
  if (isAuthError(authResult)) return authResult.response;

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const status = new URL(req.url).searchParams.get('status');
  const conds = [eq(storeCustomerMessages.websiteId, site.id)];
  if (status) conds.push(eq(storeCustomerMessages.status, status));

  const rows = await db
    .select()
    .from(storeCustomerMessages)
    .where(and(...conds))
    .orderBy(desc(storeCustomerMessages.createdAt))
    .limit(200);

  return NextResponse.json({ success: true, data: rows });
}
