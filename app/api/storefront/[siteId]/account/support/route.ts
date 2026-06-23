import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeCustomerMessages, storeCustomerMessageReplies } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireCustomer } from '@/lib/storefront/customer-auth';

/**
 * GET /api/storefront/[siteId]/account/support — List support messages
 * POST — Create new support message
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId);
  const session = await requireCustomer(req, websiteId);
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const messages = await db.select()
    .from(storeCustomerMessages)
    .where(and(
      eq(storeCustomerMessages.websiteId, websiteId),
      eq(storeCustomerMessages.customerId, session.customerId),
    ))
    .orderBy(desc(storeCustomerMessages.updatedAt));

  return NextResponse.json({ success: true, data: messages });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId);
  const session = await requireCustomer(req, websiteId);
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { subject, category, body, orderId } = await req.json();
  if (!subject?.trim() || !body?.trim()) {
    return NextResponse.json({ success: false, message: 'Subject and message body are required' }, { status: 400 });
  }

  const [message] = await db.insert(storeCustomerMessages).values({
    websiteId,
    customerId: session.customerId,
    orderId: orderId ?? null,
    subject: subject.trim(),
    category: category ?? 'general',
  }).returning();

  // Create initial reply (the customer's message body)
  await db.insert(storeCustomerMessageReplies).values({
    messageId: message.id,
    body: body.trim(),
    isStaff: false,
    authorName: [session.firstName, session.lastName].filter(Boolean).join(' ') || session.email,
  });

  return NextResponse.json({ success: true, data: message }, { status: 201 });
}
