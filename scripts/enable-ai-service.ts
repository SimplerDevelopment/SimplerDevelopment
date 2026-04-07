import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../lib/db');
  const { users, clients, services, clientServices } = await import('../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Find CY Strategies client
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'cystrategies@simplerdevelopment.com'));
  if (!user) { console.log('User not found'); process.exit(1); }
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.userId, user.id));
  if (!client) { console.log('Client not found'); process.exit(1); }
  console.log('Client ID:', client.id);

  // Find AI service
  let [aiService] = await db.select({ id: services.id, name: services.name, category: services.category })
    .from(services).where(eq(services.category, 'ai'));

  if (!aiService) {
    // Check for Chat Bot service
    [aiService] = await db.select({ id: services.id, name: services.name, category: services.category })
      .from(services).where(eq(services.name, 'Chat Bot'));
  }

  if (!aiService) {
    // List all services so we can find the right one
    const allServices = await db.select({ id: services.id, name: services.name, category: services.category }).from(services);
    console.log('Available services:', allServices.map(s => `${s.id}: ${s.name} (${s.category})`).join('\n'));

    // Create an AI service if none exists
    const [created] = await db.insert(services).values({
      name: 'AI Assistant',
      description: 'AI-powered chat and email assistant with CRM, project, and portal tools',
      category: 'ai',
      price: 0,
      active: true,
    }).returning();
    aiService = created;
    console.log('Created AI service:', aiService.id);
  } else {
    console.log('Found AI service:', aiService.id, aiService.name, `(${aiService.category})`);
  }

  // Check if already subscribed
  const [existing] = await db.select({ id: clientServices.id, status: clientServices.status })
    .from(clientServices)
    .where(and(eq(clientServices.clientId, client.id), eq(clientServices.serviceId, aiService.id)));

  if (existing) {
    if (existing.status === 'active') {
      console.log('Already has active AI subscription');
    } else {
      await db.update(clientServices).set({ status: 'active' }).where(eq(clientServices.id, existing.id));
      console.log('Reactivated AI subscription');
    }
  } else {
    await db.insert(clientServices).values({
      clientId: client.id,
      serviceId: aiService.id,
      status: 'active',
    });
    console.log('Created active AI subscription');
  }

  console.log('Done! CY Strategies can now use AI features.');
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
