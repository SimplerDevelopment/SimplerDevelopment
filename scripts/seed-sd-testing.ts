import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';

dotenv.config({ path: '.env' });

async function seedSDTesting() {
  try {
    const { db } = await import('../lib/db');
    const { users, clients, clientWebsites } = await import('../lib/db/schema');
    const { eq } = await import('drizzle-orm');

    const clientEmail = 'testing@simplerdevelopment.com';
    const clientPassword = 'SDtesting2026!';
    const hashedPassword = await hash(clientPassword, 10);

    // 1. Create user (skip if already exists)
    const existing = await db.select().from(users).where(eq(users.email, clientEmail)).limit(1);
    const [user] = existing.length > 0
      ? existing
      : await db.insert(users).values({
          name: 'SimplerDevelopment Testing',
          email: clientEmail,
          password: hashedPassword,
          role: 'client',
          active: true,
        }).returning();
    console.log('User ready:', user.email);

    // 2. Create client profile (skip if already exists)
    const existingClient = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
    const [client] = existingClient.length > 0
      ? existingClient
      : await db.insert(clients).values({
          userId: user.id,
          company: 'SimplerDevelopment Testing',
          website: 'https://sd-testing.simplerdevelopment.com',
          notes: 'Internal testing client for CMS block rendering and npm package validation',
        }).returning();
    console.log('Client ready:', client.company);

    // 3. Create website (skip if already exists)
    const existingWebsite = await db.select().from(clientWebsites).where(eq(clientWebsites.clientId, client.id)).limit(1);
    if (existingWebsite.length > 0) {
      console.log('Website already exists:', existingWebsite[0].subdomain);
    } else {
      const [website] = await db.insert(clientWebsites).values({
        clientId: client.id,
        name: 'SimplerDevelopment Testing',
        subdomain: 'sd-testing',
        description: 'Testing website for validating @simplerdevelopment/cms-blocks npm package and CMS rendering',
        deploymentStatus: 'pending',
        active: true,
      }).returning();
      console.log('Website created:', website.subdomain + '.simplerdevelopment.com');
    }

    console.log('\n------------------------------------');
    console.log('  SimplerDevelopment Testing Client');
    console.log('------------------------------------');
    console.log('  Portal URL:  /portal/login');
    console.log('  Email:       testing@simplerdevelopment.com');
    console.log('  Password:    SDtesting2026!');
    console.log('  Subdomain:   sd-testing.simplerdevelopment.com');
    console.log('------------------------------------\n');
    console.log('Next: Log into the portal and click "Deploy" in website settings to provision the site.');

  } catch (error) {
    console.error('Error seeding SD Testing client:', error);
  }
  process.exit(0);
}

seedSDTesting();
