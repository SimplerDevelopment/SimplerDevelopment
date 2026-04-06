import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function enableAllServices() {
  const { db } = await import('../../../lib/db');
  const { services, clientServices, clients, users } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Find client
  const [user] = await db.select().from(users).where(eq(users.email, 'cystrategies@simplerdevelopment.com')).limit(1);
  if (!user) { console.error('User not found'); process.exit(1); }

  const [client] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (!client) { console.error('Client not found'); process.exit(1); }

  console.log(`Client: ${client.id} (${client.companyName})`);

  // Get all available services
  const allServices = await db.select().from(services);
  console.log(`\nAvailable services (${allServices.length}):`);
  allServices.forEach(s => console.log(`  - [${s.id}] ${s.name} (${s.category})`));

  // Get existing subscriptions
  const existing = await db.select().from(clientServices).where(eq(clientServices.clientId, client.id));
  const existingServiceIds = new Set(existing.map(e => e.serviceId));
  console.log(`\nExisting subscriptions: ${existing.length}`);

  // Enable all missing services
  let added = 0;
  for (const svc of allServices) {
    if (existingServiceIds.has(svc.id)) {
      console.log(`  [skip] ${svc.name} - already subscribed`);
      continue;
    }
    await db.insert(clientServices).values({
      clientId: client.id,
      serviceId: svc.id,
      status: 'active',
      startDate: new Date(),
    });
    console.log(`  [added] ${svc.name} (${svc.category})`);
    added++;
  }

  // Also activate any suspended/cancelled ones
  let reactivated = 0;
  for (const sub of existing) {
    if (sub.status !== 'active') {
      await db.update(clientServices)
        .set({ status: 'active' })
        .where(eq(clientServices.id, sub.id));
      reactivated++;
      console.log(`  [reactivated] service ID ${sub.serviceId}`);
    }
  }

  console.log(`\n=== DONE: ${added} added, ${reactivated} reactivated ===`);
  process.exit(0);
}

enableAllServices().catch(err => { console.error(err); process.exit(1); });
