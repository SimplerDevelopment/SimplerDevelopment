import { db } from '../../../lib/db';
import { users } from '../../../lib/db/schema/auth';
import { clientMembers, clients, clientWebsites } from '../../../lib/db/schema/sites';
import { eq, and, inArray } from 'drizzle-orm';

const EMAIL = 'info@danielpcoyle.com';
const CARDIFF_WEBSITE_ID = 405;

const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, CARDIFF_WEBSITE_ID)).limit(1);
console.log('Cardiff website:', { id: site?.id, clientId: site?.clientId, name: site?.name, subdomain: site?.subdomain });

const [u] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
console.log('\nUser:', { id: u?.id, name: u?.name, email: u?.email, role: u?.role, active: u?.active, defaultClientId: u?.defaultClientId });

if (!u) { console.log('No user — would need to create.'); process.exit(0); }

// All cardiff client memberships for this user
const cardiffClientId = site?.clientId;
console.log('\nCardiff clientId =', cardiffClientId);
if (cardiffClientId) {
  const m = await db.select().from(clientMembers).where(and(eq(clientMembers.userId, u.id), eq(clientMembers.clientId, cardiffClientId))).limit(1);
  console.log('Cardiff membership for user:', m);
}

// What's their defaultClientId?
if (u.defaultClientId) {
  const [dc] = await db.select().from(clients).where(eq(clients.id, u.defaultClientId)).limit(1);
  console.log('\nUser defaultClientId =', u.defaultClientId, 'company=', dc?.company);
}

// All memberships for this user
const all = await db.select().from(clientMembers).where(eq(clientMembers.userId, u.id));
console.log('\nAll memberships for user:');
if (all.length > 0) {
  const clientRows = await db.select({ id: clients.id, company: clients.company }).from(clients).where(inArray(clients.id, all.map(m => m.clientId)));
  const byId = new Map(clientRows.map(c => [c.id, c.company || '(no company)']));
  for (const m of all) console.log(`  clientId=${m.clientId}  role=${m.role}  company="${byId.get(m.clientId)}"`);
}
process.exit(0);
