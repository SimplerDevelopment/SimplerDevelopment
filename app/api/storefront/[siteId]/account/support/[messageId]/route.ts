import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeCustomerMessages, storeCustomerMessageReplies } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireCustomer } from '@/lib/storefront/customer-auth';

/**
 * GET /api/storefront/[siteId]/account/support/[messageId] — Message detail with replies
 * POST — Add reply to message
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string; messageId: string }> }) {
  const { siteId, messageId } = await params;
  const websiteId = parseInt(siteId);
  const session = await requireCustomer(req, websiteId);
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const [message] = await db.select()
    .from(storeCustomerMessages)
    .where(and(
      eq(storeCustomerMessages.id, parseInt(messageId)),
      eq(storeCustomerMessages.customerId, session.customerId),
    ))
    .limit(1);

  if (!message) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const replies = await db.select()
    .from(storeCustomerMessageReplies)
    .where(eq(storeCustomerMessageReplies.messageId, message.id))
    .orderBy(storeCustomerMessageReplies.createdAt);

  return NextResponse.json({ success: true, data: { message, replies } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string; messageId: string }> }) {
  const { siteId, messageId } = await params;
  const websiteId = parseInt(siteId);
  const session = await requireCustomer(req, websiteId);
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ success: false, message: 'Message body is required' }, { status: 400 });

  // Verify message belongs to customer
  const [message] = await db.select({ id: storeCustomerMessages.id })
    .from(storeCustomerMessages)
    .where(and(
      eq(storeCustomerMessages.id, parseInt(messageId)),
      eq(storeCustomerMessages.customerId, session.customerId),
    ))
    .limit(1);

  if (!message) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [reply] = await db.insert(storeCustomerMessageReplies).values({
    messageId: message.id,
    body: body.trim(),
    isStaff: false,
    authorName: [session.firstName, session.lastName].filter(Boolean).join(' ') || session.email,
  }).returning();

  // Update message timestamp
  await db.update(storeCustomerMessages)
    .set({ updatedAt: new Date(), status: 'open' })
    .where(eq(storeCustomerMessages.id, message.id));

  return NextResponse.json({ success: true, data: reply }, { status: 201 });
}
