import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../lib/db');
  const { services, clientServices } = await import('../lib/db/schema');
  const { eq, and, not, like } = await import('drizzle-orm');

  const CLIENT_ID = 103; // Post Captain Consulting

  // All real active services (skip test services prefixed with __)
  const allServices = await db
    .select({ id: services.id, name: services.name, category: services.category })
    .from(services)
    .where(and(eq(services.active, true), not(like(services.name, '\\_\\_%'))));

  console.log(`Granting ${allServices.length} services to client ${CLIENT_ID}:`);

  for (const svc of allServices) {
    const [existing] = await db
      .select({ id: clientServices.id, status: clientServices.status })
      .from(clientServices)
      .where(and(eq(clientServices.clientId, CLIENT_ID), eq(clientServices.serviceId, svc.id)))
      .limit(1);

    if (existing) {
      if (existing.status !== 'active') {
        await db
          .update(clientServices)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(clientServices.id, existing.id));
        console.log(`  [reactivated] ${svc.name} (${svc.category})`);
      } else {
        console.log(`  [already active] ${svc.name} (${svc.category})`);
      }
    } else {
      await db.insert(clientServices).values({
        clientId: CLIENT_ID,
        serviceId: svc.id,
        status: 'active',
        startDate: new Date(),
      });
      console.log(`  [granted] ${svc.name} (${svc.category})`);
    }
  }

  console.log('Done.');
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
