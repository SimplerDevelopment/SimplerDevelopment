/**
 * Seed data for email transactional testing.
 *
 * Creates:
 * - A test website with email templates for all 10 events
 * - A test order with items (for order email events)
 * - A test store customer (for account email events)
 * - A test booking page + booking (for booking email events)
 *
 * Usage: npx tsx scripts/seed-email-test-data.ts
 */

import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';

dotenv.config({ path: '.env' });

async function seed() {
  const { db } = await import('../lib/db');
  const {
    users, clients,
    websiteEmailTemplates,
    orders, orderItems, orderStatusHistory,
    storeCustomers,
    bookingPages, bookings,
    storeSettings,
  } = await import('../lib/db/schema');
  const { eq, and, sql } = await import('drizzle-orm');
  const { getDefaultTemplates } = await import('../lib/email/default-email-templates');

  console.log('Seeding email test data...');

  // ── Find or create test user + client ──────────────────────────────────────
  const testEmail = 'emailtest@simplerdevelopment.com';
  let [user] = await db.select().from(users).where(eq(users.email, testEmail)).limit(1);

  if (!user) {
    [user] = await db.insert(users).values({
      name: 'Email Test User',
      email: testEmail,
      password: await hash('test123456', 10),
      role: 'client',
      active: true,
    }).returning();
    console.log(`  Created user: ${user.email} (id: ${user.id})`);
  }

  let [client] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (!client) {
    [client] = await db.insert(clients).values({
      userId: user.id,
      companyName: 'Email Test Co',
      contactName: 'Email Tester',
      email: testEmail,
    }).returning();
    console.log(`  Created client: ${client.companyName} (id: ${client.id})`);
  }

  // ── Find or create test website (raw SQL to avoid deploy_branch column mismatch) ──
  let siteRow = await db.execute<{ id: number; name: string }>(sql`
    SELECT id, name FROM client_websites
    WHERE client_id = ${client.id} AND name = 'Email Test Store'
    LIMIT 1
  `);
  let site: { id: number; name: string };

  if (siteRow.length === 0) {
    const inserted = await db.execute<{ id: number; name: string }>(sql`
      INSERT INTO client_websites (client_id, name, subdomain, active)
      VALUES (${client.id}, 'Email Test Store', 'email-test-store', true)
      RETURNING id, name
    `);
    site = inserted[0];
    console.log(`  Created website: ${site.name} (id: ${site.id})`);
  } else {
    site = siteRow[0];
  }

  // ── Seed email templates for all events ────────────────────────────────────
  const defaults = getDefaultTemplates();
  let templatesCreated = 0;

  for (const tmpl of defaults) {
    const [existing] = await db.select({ id: websiteEmailTemplates.id })
      .from(websiteEmailTemplates)
      .where(and(
        eq(websiteEmailTemplates.websiteId, site.id),
        eq(websiteEmailTemplates.event, tmpl.event),
      ))
      .limit(1);

    if (!existing) {
      await db.insert(websiteEmailTemplates).values({
        websiteId: site.id,
        event: tmpl.event,
        name: tmpl.name,
        subject: tmpl.subject,
        description: tmpl.description,
        htmlContent: tmpl.htmlContent,
        blockContent: { blocks: tmpl.blocks },
        variables: tmpl.variables,
        enabled: true,
        isRequired: tmpl.isRequired,
        createdBy: user.id,
      });
      templatesCreated++;
    }
  }
  console.log(`  Email templates: ${templatesCreated} created (${defaults.length - templatesCreated} already existed)`);

  // ── Seed store settings (enable customer accounts) ─────────────────────────
  const existingSettings = await db.execute<{ website_id: number }>(sql`
    SELECT website_id FROM store_settings WHERE website_id = ${site.id} LIMIT 1
  `);

  if (existingSettings.length === 0) {
    await db.execute(sql`
      INSERT INTO store_settings (website_id, enable_customer_accounts, store_name, currency)
      VALUES (${site.id}, true, 'Email Test Store', 'usd')
    `);
    console.log('  Created store settings');
  }

  // ── Seed a test order with items ───────────────────────────────────────────
  const orderNumber = 'ORD-EMAIL-TEST-001';
  let [order] = await db.select().from(orders)
    .where(and(eq(orders.websiteId, site.id), eq(orders.orderNumber, orderNumber)))
    .limit(1);

  if (!order) {
    [order] = await db.insert(orders).values({
      websiteId: site.id,
      orderNumber,
      customerEmail: 'info+order_test@simplerdevelopment.com',
      customerName: 'Jane Smith',
      shippingAddress: {
        line1: '123 Main St', line2: 'Apt 4B', city: 'New York', state: 'NY', postalCode: '10001', country: 'US',
      },
      billingAddress: {
        line1: '123 Main St', line2: 'Apt 4B', city: 'New York', state: 'NY', postalCode: '10001', country: 'US',
      },
      subtotal: 12999,
      shippingTotal: 999,
      taxTotal: 1001,
      discountTotal: 0,
      total: 14999,
      paymentStatus: 'paid',
      status: 'confirmed',
      paidAt: new Date(),
    }).returning();

    await db.insert(orderItems).values([
      {
        orderId: order.id,
        productName: 'Premium Widget',
        variantName: 'Blue / Large',
        sku: 'WDG-BL-LG',
        unitPrice: 7999,
        quantity: 1,
        total: 7999,
      },
      {
        orderId: order.id,
        productName: 'Basic Gadget',
        sku: 'GDG-001',
        unitPrice: 2500,
        quantity: 2,
        total: 5000,
      },
    ]);

    await db.insert(orderStatusHistory).values({
      orderId: order.id,
      status: 'confirmed',
      note: 'Test order created',
    });

    console.log(`  Created test order: ${orderNumber} (id: ${order.id})`);
  }

  // ── Seed test store customer ───────────────────────────────────────────────
  const customerEmail = 'info+account_test@simplerdevelopment.com';
  const [existingCustomer] = await db.select({ id: storeCustomers.id })
    .from(storeCustomers)
    .where(and(eq(storeCustomers.websiteId, site.id), eq(storeCustomers.email, customerEmail)))
    .limit(1);

  if (!existingCustomer) {
    await db.insert(storeCustomers).values({
      websiteId: site.id,
      email: customerEmail,
      passwordHash: await hash('testpassword123', 10),
      firstName: 'Jane',
      lastName: 'Smith',
      emailVerified: true,
      status: 'active',
    });
    console.log(`  Created test customer: ${customerEmail}`);
  }

  // ── Seed test booking page + booking ───────────────────────────────────────
  let [page] = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.clientId, client.id), eq(bookingPages.slug, 'email-test-consult')))
    .limit(1);

  if (!page) {
    [page] = await db.insert(bookingPages).values({
      clientId: client.id,
      title: 'Strategy Consultation',
      slug: 'email-test-consult',
      description: 'A 30-minute strategy session.',
      duration: 30,
      timezone: 'America/New_York',
      availableHours: {
        monday: { start: '09:00', end: '17:00' },
        tuesday: { start: '09:00', end: '17:00' },
        wednesday: { start: '09:00', end: '17:00' },
        thursday: { start: '09:00', end: '17:00' },
        friday: { start: '09:00', end: '17:00' },
      },
      bufferBefore: 0,
      bufferAfter: 15,
      minNoticeMins: 60,
      maxAdvanceDays: 60,
      active: true,
    }).returning();
    console.log(`  Created booking page: ${page.title} (slug: ${page.slug})`);
  }

  // Seed a test booking
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 3);
  futureDate.setHours(14, 0, 0, 0);

  const [existingBooking] = await db.select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.bookingPageId, page.id), eq(bookings.guestEmail, 'info+booking_test@simplerdevelopment.com')))
    .limit(1);

  if (!existingBooking) {
    await db.insert(bookings).values({
      bookingPageId: page.id,
      clientId: client.id,
      guestName: 'Jane Smith',
      guestEmail: 'info+booking_test@simplerdevelopment.com',
      startTime: futureDate,
      endTime: new Date(futureDate.getTime() + 30 * 60 * 1000),
      timezone: 'America/New_York',
      cancelToken: 'test-cancel-token-email-001',
      status: 'confirmed',
    });
    console.log('  Created test booking');
  }

  console.log('\nEmail test data seeded successfully!');
  console.log(`\nTo trigger test emails:`);
  console.log(`  curl -X POST http://localhost:3000/api/test/email-events -H "Content-Type: application/json" -d '{"event":"all","websiteId":${site.id}}'`);
  console.log(`\nWebsite ID: ${site.id}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
