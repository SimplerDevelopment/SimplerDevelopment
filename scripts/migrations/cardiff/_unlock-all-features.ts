/**
 * Unlock every SD feature for the Cardiff tenant (client_id=146) on metro.
 *
 * - Grants client_services rows for every active service in the catalog,
 *   except plugin-* services (those are per-client plugin registrations).
 * - Bumps clients.brain_trial_until to 2099-12-31 (belt-and-suspenders on top
 *   of the all-in-one bundle grant, which already covers Brain via the
 *   'bundle' category check in lib/brain/entitlement.ts).
 * - Sets clients.white_label_enabled = true.
 *
 * Idempotent — re-running is safe; existing active grants are left untouched.
 *
 * Run:  npx tsx scripts/migrations/cardiff/_unlock-all-features.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { readFileSync } from 'fs';
import postgres from 'postgres';

const CARDIFF_CLIENT_ID = 146;

function metroUrl(): string {
  const env = readFileSync('.env.local', 'utf8');
  const line = env.split('\n').find((l) => /@metro\.proxy\.rlwy\.net/.test(l));
  if (!line) throw new Error('metro URL not found in .env.local');
  return line.replace(/^# */, '').split(' ')[0].replace(/^DATABASE_URL=/, '');
}

async function main() {
  const sql = postgres(metroUrl(), { max: 1 });
  try {
    // 1. Resolve the set of services to grant.
    const allServices = await sql<
      Array<{ id: number; slug: string; category: string; name: string }>
    >`SELECT id, slug, category, name FROM services WHERE active = true ORDER BY id`;

    const targets = allServices.filter((s) => !s.slug.startsWith('plugin-'));
    console.log(`Catalog: ${allServices.length} active services, granting ${targets.length} to Cardiff (skipping plugin-* SKUs).`);

    // 2. Existing grants on Cardiff.
    const existing = await sql<Array<{ service_id: number; status: string }>>`
      SELECT service_id, status FROM client_services WHERE client_id = ${CARDIFF_CLIENT_ID}
    `;
    const grantedIds = new Set(existing.filter((r) => r.status === 'active').map((r) => r.service_id));

    // 3. Insert missing grants.
    const toInsert = targets.filter((t) => !grantedIds.has(t.id));
    if (!toInsert.length) {
      console.log('All target services already granted — no inserts needed.');
    } else {
      for (const svc of toInsert) {
        await sql`
          INSERT INTO client_services (client_id, service_id, status, notes)
          VALUES (${CARDIFF_CLIENT_ID}, ${svc.id}, 'active', 'Unlocked via _unlock-all-features.ts')
        `;
        console.log(`  + granted ${svc.slug} (id=${svc.id}, ${svc.category})`);
      }
    }

    // 4. Reactivate any rows that were previously marked cancelled / paused.
    const reactivated = await sql`
      UPDATE client_services
         SET status = 'active', updated_at = now()
       WHERE client_id = ${CARDIFF_CLIENT_ID}
         AND status != 'active'
         AND service_id IN ${sql(targets.map((t) => t.id))}
       RETURNING service_id
    `;
    if (reactivated.length) {
      console.log(`Reactivated ${reactivated.length} previously-paused grant(s).`);
    }

    // 5. Brain trial belt-and-suspenders + white_label flag.
    const farFuture = new Date('2099-12-31T00:00:00Z');
    const [updated] = await sql<
      Array<{ id: number; brain_trial_until: Date | null; white_label_enabled: boolean }>
    >`
      UPDATE clients
         SET brain_trial_until = ${farFuture},
             white_label_enabled = true,
             updated_at = now()
       WHERE id = ${CARDIFF_CLIENT_ID}
       RETURNING id, brain_trial_until, white_label_enabled
    `;
    console.log('\nClient flags now:', updated);

    // 6. Final summary
    const finalGrants = await sql<Array<{ slug: string; status: string }>>`
      SELECT s.slug, cs.status
        FROM client_services cs
        JOIN services s ON s.id = cs.service_id
       WHERE cs.client_id = ${CARDIFF_CLIENT_ID}
       ORDER BY s.slug
    `;
    console.log(`\nCardiff now has ${finalGrants.length} service grant(s):`);
    for (const g of finalGrants) console.log(`  - ${g.slug} (${g.status})`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
