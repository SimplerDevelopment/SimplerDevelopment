import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';

dotenv.config({ path: '.env' });

async function setup() {
  const { db } = await import('../../../lib/db');
  const { users, clients, clientMembers, clientWebsites } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { generateUniqueSubdomain } = await import('../../../lib/subdomain');

  const email = 'cystrategies@simplerdevelopment.com';
  const companyName = 'CY Strategies';
  const siteName = 'CY Strategies Website';

  // Check if client already exists
  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    const [existingClient] = await db.select().from(clients).where(eq(clients.userId, existingUser.id)).limit(1);
    if (existingClient) {
      const sites = await db.select().from(clientWebsites).where(eq(clientWebsites.clientId, existingClient.id));
      console.log(`Client already exists: ID ${existingClient.id} (${companyName})`);
      if (sites.length > 0) {
        console.log(`Website already exists: ID ${sites[0].id} (${sites[0].name})`);
        console.log(JSON.stringify({ clientId: existingClient.id, websiteId: sites[0].id }));
      }
      process.exit(0);
    }
  }

  // 1. Create user
  const hashedPassword = await hash('cystrategies-temp-2026', 10);
  const [user] = existingUser
    ? [existingUser]
    : await db.insert(users).values({
        name: 'Cody York',
        email,
        password: hashedPassword,
        role: 'client' as const,
        active: true,
      }).returning();
  console.log(`User created: ID ${user.id}`);

  // 2. Create client profile
  const [client] = await db.insert(clients).values({
    userId: user.id,
    company: companyName,
    phone: '',
    website: 'https://cystrategies.co',
    notes: 'Migrated from cystrategies.co - Marketing Strategy Consulting by Cody York',
  }).returning();
  console.log(`Client created: ID ${client.id}`);

  // 3. Add as owner
  await db.insert(clientMembers).values({
    clientId: client.id,
    userId: user.id,
    role: 'owner',
  });
  console.log('Client member (owner) created');

  // 4. Create website
  const subdomain = await generateUniqueSubdomain(companyName, siteName);
  const [website] = await db.insert(clientWebsites).values({
    clientId: client.id,
    name: siteName,
    domain: 'cystrategies.co',
    subdomain,
    description: 'Marketing strategy consulting - connecting audience, message, channels, and measurement into scalable systems.',
    active: true,
    deploymentStatus: 'active',
  }).returning();
  console.log(`Website created: ID ${website.id}, subdomain: ${subdomain}`);

  console.log('\n=== SETUP COMPLETE ===');
  console.log(JSON.stringify({ clientId: client.id, websiteId: website.id, subdomain }));

  process.exit(0);
}

setup().catch(err => { console.error(err); process.exit(1); });
