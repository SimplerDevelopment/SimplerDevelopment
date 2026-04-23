import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const TECH_FIELDS = new Set([
  'Uses Slate',
  'Tech Stack',
  'CMS',
  'Hosting / CDN',
  'Server Header',
  'Powered By',
  'Generator',
  'HTTP Status',
  'Final URL',
  'Last Tech Scan',
]);

const LOCATION_FIELDS = new Set([
  'City',
  'State',
  'ZIP',
  'County',
  'Region',
  'Locale',
]);

async function categorize() {
  const { db } = await import('../../../lib/db');
  const { crmCustomFields, clients, users } = await import('../../../lib/db/schema');
  const { and, eq } = await import('drizzle-orm');

  // Resolve postcaptain client. Prefer email match, fall back to clientId 100.
  const POSTCAPTAIN_EMAIL = 'postcaptain@simplerdevelopment.com';
  const FALLBACK_CLIENT_ID = 100;

  let clientId: number | null = null;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, POSTCAPTAIN_EMAIL))
    .limit(1);

  if (user) {
    const [c] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.userId, user.id))
      .limit(1);
    if (c) clientId = c.id;
  }

  if (clientId == null) {
    // Fall back to the documented ID.
    const [c] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, FALLBACK_CLIENT_ID))
      .limit(1);
    if (c) clientId = c.id;
  }

  if (clientId == null) {
    console.error('Could not resolve postcaptain client (tried email + ID 100). Aborting.');
    process.exit(1);
  }

  console.log(`Resolved postcaptain clientId = ${clientId}`);

  // Pull all company-scope custom fields for this client.
  const fields = await db
    .select()
    .from(crmCustomFields)
    .where(
      and(
        eq(crmCustomFields.clientId, clientId),
        eq(crmCustomFields.entityType, 'company'),
      ),
    );

  console.log(`Found ${fields.length} company custom field(s) for client ${clientId}.`);

  let techCount = 0;
  let locCount = 0;
  let genCount = 0;

  for (const f of fields) {
    let target: string | null;
    if (TECH_FIELDS.has(f.fieldName)) {
      target = 'Tech';
      techCount += 1;
    } else if (LOCATION_FIELDS.has(f.fieldName)) {
      target = 'Location';
      locCount += 1;
    } else {
      target = null; // null => panel UI defaults to "General"
      genCount += 1;
    }

    if (f.category === target) {
      continue;
    }

    await db
      .update(crmCustomFields)
      .set({ category: target })
      .where(eq(crmCustomFields.id, f.id));

    console.log(`  - [${f.fieldName}] -> ${target ?? 'General (NULL)'}`);
  }

  console.log(`\nDone. Tech=${techCount}, Location=${locCount}, General=${genCount}.`);
  process.exit(0);
}

categorize().catch(err => {
  console.error('Categorization failed:', err);
  process.exit(1);
});
