/**
 * Test endpoint to trigger transactional email events.
 * POST /api/test/email-events
 * Body: { event: string } or { event: "all" }
 *
 * Only available in development or when TEST_EMAIL_SECRET matches.
 */

import { NextResponse } from 'next/server';
import {
  sendTransactionalEmail,
  formatCents,
  formatAddress,
  formatEmailDate,
  buildItemsHtml,
} from '@/lib/email/send-transactional';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

const TEST_EMAIL_BASE = 'info';
const TEST_EMAIL_DOMAIN = 'simplerdevelopment.com';

function testEmail(eventName: string): string {
  return `${TEST_EMAIL_BASE}+${eventName}@${TEST_EMAIL_DOMAIN}`;
}

interface TestEventResult {
  event: string;
  to: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

async function getTestWebsiteId(): Promise<number> {
  // Find or use the first website
  const [site] = await db.select({ id: clientWebsites.id })
    .from(clientWebsites)
    .limit(1);
  if (!site) throw new Error('No website found. Run seed script first.');
  return site.id;
}

const SAMPLE_ORDER = {
  orderNumber: 'ORD-TEST-001',
  orderDate: formatEmailDate(new Date()),
  orderTotal: formatCents(14999),
  subtotal: formatCents(12999),
  shippingTotal: formatCents(999),
  taxTotal: formatCents(1001),
  discountTotal: formatCents(0),
  itemCount: '2',
  shippingAddress: formatAddress({
    line1: '123 Main St', line2: 'Apt 4B', city: 'New York', state: 'NY', postalCode: '10001', country: 'US',
  }),
  billingAddress: formatAddress({
    line1: '123 Main St', line2: 'Apt 4B', city: 'New York', state: 'NY', postalCode: '10001', country: 'US',
  }),
};

const SAMPLE_ITEMS = buildItemsHtml([
  { productName: 'Premium Widget', variantName: 'Blue / Large', quantity: 1, unitPrice: 7999, total: 7999 },
  { productName: 'Basic Gadget', variantName: null, quantity: 2, unitPrice: 2500, total: 5000 },
]);

const SAMPLE_CUSTOMER = {
  firstName: 'Jane',
  lastName: 'Smith',
  fullName: 'Jane Smith',
};

async function triggerEvent(event: string, websiteId: number): Promise<TestEventResult> {
  const to = testEmail(event.replace('.', '_'));
  const baseUrl = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';

  // Resolve the website domain for correct storefront URLs
  const [site] = await db.select({
    domain: clientWebsites.domain,
    subdomain: clientWebsites.subdomain,
  }).from(clientWebsites).where(eq(clientWebsites.id, websiteId)).limit(1);
  const domainSlug = site?.domain || site?.subdomain || '';
  const storefrontBase = domainSlug ? `${baseUrl}/sites/${domainSlug}` : baseUrl;

  const commonVars = {
    ...SAMPLE_CUSTOMER,
    email: to,
    ...SAMPLE_ORDER,
    itemsHtml: SAMPLE_ITEMS,
    orderUrl: `${storefrontBase}/account/orders/${SAMPLE_ORDER.orderNumber}`,
  };

  const eventVariables: Record<string, Record<string, string>> = {
    'order.confirmed': commonVars,
    'order.shipped': {
      ...commonVars,
      trackingNumber: '1Z999AA10123456784',
      trackingUrl: 'https://track.example.com/1Z999AA10123456784',
      shippingMethod: 'USPS Priority Mail',
      estimatedDelivery: 'April 7, 2026',
    },
    'order.delivered': commonVars,
    'order.cancelled': {
      ...commonVars,
      cancellationReason: 'Customer requested cancellation',
    },
    'order.refunded': {
      ...commonVars,
      refundAmount: formatCents(7999),
    },
    'payment.failed': {
      ...commonVars,
      retryUrl: `${storefrontBase}/account/orders/${SAMPLE_ORDER.orderNumber}`,
    },
    'account.welcome': {
      ...SAMPLE_CUSTOMER,
      email: to,
    },
    'account.password_reset': {
      ...SAMPLE_CUSTOMER,
      email: to,
      resetUrl: `${storefrontBase}/account/reset-password?token=test-reset-token-abc123`,
    },
    'booking.confirmed': {
      ...SAMPLE_CUSTOMER,
      email: to,
      bookingDate: 'April 5, 2026 at 2:00 PM EST',
      bookingService: 'Strategy Consultation',
      bookingDuration: '30 minutes',
      cancelUrl: `${baseUrl}/book/cancel?token=test-cancel-token`,
    },
    'booking.cancelled': {
      ...SAMPLE_CUSTOMER,
      email: to,
      bookingDate: 'April 5, 2026 at 2:00 PM EST',
      bookingService: 'Strategy Consultation',
    },
  };

  const variables = eventVariables[event];
  if (!variables) {
    return { event, to, success: false, error: `Unknown event: ${event}` };
  }

  const fromNames: Record<string, string> = {
    'order.confirmed': 'Order Confirmation',
    'order.shipped': 'Shipping Update',
    'order.delivered': 'Delivery Confirmation',
    'order.cancelled': 'Order Update',
    'order.refunded': 'Refund Confirmation',
    'payment.failed': 'Payment Update',
    'account.welcome': 'Welcome',
    'account.password_reset': 'Password Reset',
    'booking.confirmed': 'Booking Confirmation',
    'booking.cancelled': 'Booking Update',
  };

  const result = await sendTransactionalEmail({
    websiteId,
    event,
    to,
    fromName: fromNames[event] || 'Test',
    variables,
  });

  return { event, to, ...result };
}

const ALL_EVENTS = [
  'order.confirmed',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
  'order.refunded',
  'payment.failed',
  'account.welcome',
  'account.password_reset',
  'booking.confirmed',
  'booking.cancelled',
];

export async function POST(req: Request) {
  // Only allow in development or with secret
  if (process.env.NODE_ENV === 'production') {
    const secret = req.headers.get('x-test-secret');
    if (secret !== process.env.TEST_EMAIL_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const body = await req.json();
  const websiteId = body.websiteId || await getTestWebsiteId();
  const events = body.event === 'all' ? ALL_EVENTS : [body.event];

  const results: TestEventResult[] = [];
  for (const event of events) {
    const result = await triggerEvent(event, websiteId);
    results.push(result);
  }

  const allSuccess = results.every(r => r.success);

  return NextResponse.json({
    success: allSuccess,
    results,
    summary: {
      total: results.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    },
  });
}

export async function GET() {
  return NextResponse.json({
    events: ALL_EVENTS,
    usage: 'POST with { "event": "order.confirmed" } or { "event": "all" }',
  });
}
