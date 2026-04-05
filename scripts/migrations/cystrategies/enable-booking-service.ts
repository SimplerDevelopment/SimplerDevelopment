import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const CLIENT_ID = 98;

async function enableBooking() {
  const { db } = await import('../../../lib/db');
  const { services, clientServices } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Find the booking service
  const [bookingSvc] = await db.select().from(services).where(eq(services.category, 'booking')).limit(1);
  if (!bookingSvc) {
    console.error('No booking service found in services table');
    process.exit(1);
  }
  console.log(`Found booking service: ID ${bookingSvc.id} (${bookingSvc.name})`);

  // Check if already subscribed
  const existing = await db.select().from(clientServices)
    .where(and(eq(clientServices.clientId, CLIENT_ID), eq(clientServices.serviceId, bookingSvc.id)))
    .limit(1);

  if (existing.length > 0) {
    console.log('Client already has booking service');
    process.exit(0);
  }

  // Subscribe client to booking service
  await db.insert(clientServices).values({
    clientId: CLIENT_ID,
    serviceId: bookingSvc.id,
    status: 'active',
    startDate: new Date(),
  });

  console.log('Booking service enabled for CY Strategies');
  process.exit(0);
}

enableBooking().catch(err => { console.error(err); process.exit(1); });
