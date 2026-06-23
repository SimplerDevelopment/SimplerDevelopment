import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { storeCustomerMessages, storeCustomerMessageReplies } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

// POST /api/portal/websites/[siteId]/store/customer-messages/[messageId]/reply —
// post a staff reply on a support thread and transition the message to 'replied'.
// Portal-REST mirror of the store_customer_messages_reply MCP tool. Does not email
// the customer. The message must belong to the caller's resolved site (else 404).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string; messageId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'store' });
  if (isAuthError(authResult)) return authResult.response;
  const { client } = authResult;

  const { siteId, messageId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const id = parseInt(messageId, 10);
  if (Number.isNaN(id))
    return NextResponse.json({ success: false, message: 'Invalid message id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (!body.body || typeof body.body !== 'string' || !body.body.trim()) {
    return NextResponse.json({ success: false, message: 'Reply body is required' }, { status: 400 });
  }

  // Confirm the message belongs to the caller's site before replying.
  const [msg] = await db
    .select({ id: storeCustomerMessages.id })
    .from(storeCustomerMessages)
    .where(and(eq(storeCustomerMessages.id, id), eq(storeCustomerMessages.websiteId, site.id)))
    .limit(1);
  if (!msg) return NextResponse.json({ success: false, message: 'Message not found' }, { status: 404 });

  const [reply] = await db
    .insert(storeCustomerMessageReplies)
    .values({
      messageId: id,
      body: body.body.trim(),
      isStaff: true,
      authorName: client.company ?? 'Staff',
    })
    .returning();

  await db
    .update(storeCustomerMessages)
    .set({ status: 'replied', updatedAt: new Date() })
    .where(eq(storeCustomerMessages.id, id));

  return NextResponse.json({ success: true, data: reply });
}
