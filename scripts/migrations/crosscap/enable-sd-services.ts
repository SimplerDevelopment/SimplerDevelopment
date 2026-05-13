/**
 * Enable services on the SimplerDevelopment client (id 104) on prod.
 * Without an active client_services row for pitch-decks (service id 22),
 * the portal API blocks the deck list with a 403 ("requires active
 * pitch-decks subscription") and the proposals page renders empty.
 *
 * Conservative: only adds the pitch-decks row. Idempotent (upsert by
 * client_id + service_id).
 */

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
if (url.includes('.railway.internal')) { console.error('Use the public proxy URL.'); process.exit(1); }

const sql = postgres(url, { max: 1, idle_timeout: 5 });

const CLIENT_ID = 104;
const SERVICE_IDS_TO_ENABLE = [22]; // pitch-decks. Extend manually if you want more.

async function main() {
  console.log(`Targeting: ${url.replace(/:\/\/[^@]+@/, '://***@')}`);

  // What columns does client_services actually have on prod?
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'client_services' ORDER BY ordinal_position
  `;
  console.log('client_services columns:', cols.map((r: any) => r.column_name).join(', '));

  for (const serviceId of SERVICE_IDS_TO_ENABLE) {
    const existing = await sql`
      SELECT id, status FROM client_services
      WHERE client_id = ${CLIENT_ID} AND service_id = ${serviceId} LIMIT 1
    `;
    if (existing[0]) {
      if (existing[0].status !== 'active') {
        await sql`UPDATE client_services SET status = 'active', updated_at = NOW() WHERE id = ${existing[0].id}`;
        console.log(`Reactivated client_services row ${existing[0].id} (service ${serviceId}).`);
      } else {
        console.log(`Already active: client_services row ${existing[0].id} (service ${serviceId}).`);
      }
    } else {
      const ins = await sql`
        INSERT INTO client_services (client_id, service_id, status)
        VALUES (${CLIENT_ID}, ${serviceId}, 'active')
        RETURNING id
      `;
      console.log(`Created client_services row ${ins[0].id} (service ${serviceId}).`);
    }
  }

  // Verify final state
  const rows = await sql`
    SELECT cs.status, s.name, s.category
    FROM client_services cs
    JOIN services s ON s.id = cs.service_id
    WHERE cs.client_id = ${CLIENT_ID}
    ORDER BY cs.id
  `;
  console.log('\nFinal SD services:');
  for (const r of rows) console.log(`  ${r.status}  ${r.name}  (${r.category})`);

  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
