import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../lib/db');
  const { users, clients, aiCreditBalances } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'cystrategies@simplerdevelopment.com'));
  if (!user) { console.log('User not found'); process.exit(1); }

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.userId, user.id));
  if (!client) { console.log('Client not found'); process.exit(1); }

  console.log('Client ID:', client.id);

  const [existing] = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, client.id));
  if (existing) {
    await db.update(aiCreditBalances).set({ balance: 100000, payAsYouGo: false, updatedAt: new Date() }).where(eq(aiCreditBalances.clientId, client.id));
    console.log('Updated balance to 100,000 credits');
  } else {
    await db.insert(aiCreditBalances).values({ clientId: client.id, balance: 100000, monthlyGrant: 0, payAsYouGo: false });
    console.log('Created balance with 100,000 credits');
  }

  const [bal] = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, client.id));
  console.log('Current balance:', bal?.balance);
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
