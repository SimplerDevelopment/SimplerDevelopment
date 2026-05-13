/**
 * Prod sibling of create-pitch-deck.ts.
 *
 * Why a separate script: prod's schema is hand-applied and lags the Drizzle TS
 * schema (e.g. `clients.custom_domain`, `pitch_decks.seo_title`, and
 * `client_websites.custom_css` aren't on prod yet). Running the ORM version
 * blows up with "column does not exist". This file uses raw SQL against only
 * the columns prod actually has, so the same deck data lands cleanly.
 *
 * Invoke with the public prod proxy URL:
 *   DATABASE_URL="$(railway variables --kv | grep DATABASE_PUBLIC_URL= | cut -d= -f2-)" \
 *     bunx tsx scripts/migrations/crosscap/create-pitch-deck-prod.ts
 *
 * Idempotent: re-running upserts both the pitch_decks row and the
 * client_websites row.
 */

import postgres from 'postgres';
import { buildSlides } from './create-pitch-deck';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required (use the prod public proxy URL, not the internal one).');
  process.exit(1);
}
if (url.includes('.railway.internal')) {
  console.error('Refusing to use an internal Railway URL — pass DATABASE_PUBLIC_URL instead.');
  process.exit(1);
}

console.log(`Targeting: ${url.replace(/:\/\/[^@]+@/, '://***@')}`);

const sql = postgres(url, { max: 1, idle_timeout: 5 });

const CLIENT_EMAIL = 'simplerdevelopment@simplerdevelopment.com';
const DECK_SLUG = 'crosscap-platform-pitch';
const DECK_TITLE = 'SimplerDevelopment for CrossCap Advisors';
const DECK_DESC =
  'Pitch deck for Crossover Capital Advisors — positioning SimplerDevelopment as the consolidating platform (Company Brain + CRM + Booking + Content + Website) for their fragmented wealth-management stack.';
const SITE_SUBDOMAIN = 'simplerdevelopment';
const SITE_NAME = 'SimplerDevelopment';
const SITE_DOMAIN = 'simplerdevelopment.com';

const theme = {
  primaryColor: '#2563EB',
  accentColor: '#F59E0B',
  backgroundColor: '#F8FAFC',
  textColor: '#0F172A',
  headingFont: 'Inter',
  bodyFont: 'Inter',
};

async function main() {
  const user = await sql`
    SELECT id FROM users WHERE email = ${CLIENT_EMAIL} LIMIT 1
  `;
  if (!user[0]) throw new Error(`User ${CLIENT_EMAIL} not found on prod.`);
  const userId = user[0].id;

  const client = await sql`
    SELECT id FROM clients WHERE user_id = ${userId} LIMIT 1
  `;
  if (!client[0]) throw new Error(`Client for user ${userId} not found on prod.`);
  const clientId = client[0].id;
  console.log(`SD client id on prod: ${clientId}`);

  // ── client_websites upsert ─────────────────────────────────────────────────
  const existingSite = await sql`
    SELECT id FROM client_websites
    WHERE client_id = ${clientId} AND subdomain = ${SITE_SUBDOMAIN}
    LIMIT 1
  `;
  if (existingSite[0]) {
    await sql`
      UPDATE client_websites
      SET name = ${SITE_NAME},
          domain = ${SITE_DOMAIN},
          active = true,
          public_access = true,
          updated_at = NOW()
      WHERE id = ${existingSite[0].id}
    `;
    console.log(`Updated client_websites row ${existingSite[0].id}.`);
  } else {
    const inserted = await sql`
      INSERT INTO client_websites (
        client_id, name, subdomain, domain, active, public_access, deployment_status
      ) VALUES (
        ${clientId}, ${SITE_NAME}, ${SITE_SUBDOMAIN}, ${SITE_DOMAIN}, true, true, 'active'
      ) RETURNING id
    `;
    console.log(`Created client_websites row ${inserted[0].id}.`);
  }

  // ── pitch_decks upsert ─────────────────────────────────────────────────────
  const slides = buildSlides();
  const slidesJson = JSON.stringify(slides);
  const themeJson = JSON.stringify(theme);

  const existingDeck = await sql`
    SELECT id FROM pitch_decks
    WHERE client_id = ${clientId} AND slug = ${DECK_SLUG}
    LIMIT 1
  `;
  if (existingDeck[0]) {
    await sql`
      UPDATE pitch_decks
      SET title = ${DECK_TITLE},
          description = ${DECK_DESC},
          status = 'published',
          slides = ${slidesJson}::json,
          theme = ${themeJson}::json,
          format_version = 2,
          updated_at = NOW()
      WHERE id = ${existingDeck[0].id}
    `;
    console.log(`Updated pitch_decks row ${existingDeck[0].id}.`);
  } else {
    const inserted = await sql`
      INSERT INTO pitch_decks (
        client_id, title, slug, description, status, slides, theme, format_version
      ) VALUES (
        ${clientId}, ${DECK_TITLE}, ${DECK_SLUG}, ${DECK_DESC}, 'published',
        ${slidesJson}::json, ${themeJson}::json, 2
      ) RETURNING id
    `;
    console.log(`Created pitch_decks row ${inserted[0].id}.`);
  }

  console.log('\n=== PROD WRITE COMPLETE ===');
  console.log(`Public URL: https://${SITE_SUBDOMAIN}.simplerdevelopment.com/slides/${DECK_SLUG}`);
  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
