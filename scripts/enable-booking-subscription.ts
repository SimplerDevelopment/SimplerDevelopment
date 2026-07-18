/**
 * Local-only utility: grants an active booking subscription to
 * client@example.com so the @critical booking spec (and the new
 * portal-booking-detail-baseline.spec.ts) run real assertions instead
 * of skipping. Idempotent. Not committed to the production seed flow.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

(async () => {
  const { db } = await import('../lib/db');
  const { services, clientServices, clients, users } = await import('../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'client@example.com'))
    .limit(1);
  if (!u) {
    console.error('user not found');
    process.exit(1);
  }
  const [c] = await db.select().from(clients).where(eq(clients.userId, u.id)).limit(1);
  if (!c) {
    console.error('client not found for user', u.id);
    process.exit(1);
  }

  let svc = (
    await db.select().from(services).where(eq(services.slug, 'booking-tool')).limit(1)
  )[0];
  if (!svc) {
    [svc] = await db
      .insert(services)
      .values({
        name: 'Booking Tool',
        slug: 'booking-tool',
        description: 'Calendly-style booking pages',
        category: 'booking',
        price: 1900,
        billingCycle: 'monthly',
        active: true,
      })
      .returning();
    console.log('created service', svc.id);
  }

  const existing = await db
    .select()
    .from(clientServices)
    .where(and(eq(clientServices.clientId, c.id), eq(clientServices.serviceId, svc.id)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(clientServices).values({
      clientId: c.id,
      serviceId: svc.id,
      status: 'active',
      startDate: new Date(),
    });
    console.log('subscription added for client', c.id);
  } else {
    await db
      .update(clientServices)
      .set({ status: 'active' })
      .where(eq(clientServices.id, existing[0].id));
    console.log('subscription reactivated for client', c.id);
  }
  process.exit(0);
})();
