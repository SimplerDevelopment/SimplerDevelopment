/**
 * Migrate the `cardiff-business-apply` survey from the local dryrun DB to metro.
 *
 * Source: postgresql://127.0.0.1/simplerdev_realprod_dryrun (survey id 190)
 * Target: metro (prod), with client_id rewritten to 146 (Cardiff).
 *
 * Idempotent — skips if a survey with this slug already exists in metro.
 *
 * Run:  npx tsx scripts/migrations/cardiff/_apply-survey-to-metro.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import postgres from 'postgres';

const SOURCE_URL = 'postgresql://127.0.0.1/simplerdev_realprod_dryrun';
const TARGET_URL = (() => {
  // Pull the commented-out metro URL out of .env.local.
  // We deliberately don't rely on DATABASE_URL here so an accidental misconfig
  // can't redirect this script.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  const env = fs.readFileSync('.env.local', 'utf8');
  const line = env.split('\n').find((l) => /@metro\.proxy\.rlwy\.net/.test(l));
  if (!line) throw new Error('metro URL not found in .env.local');
  return line.replace(/^# */, '').split(' ')[0].replace(/^DATABASE_URL=/, '');
})();
const SLUG = 'cardiff-business-apply';
const CARDIFF_CLIENT_ID = 146;
const CARDIFF_BRANDING_ID = 36;

async function main() {
  const src = postgres(SOURCE_URL, { max: 1 });
  const dst = postgres(TARGET_URL, { max: 1 });

  try {
    // 1. Source row
    const [row] = await src`SELECT * FROM surveys WHERE slug = ${SLUG}`;
    if (!row) throw new Error(`Source survey '${SLUG}' not found in local DB`);
    console.log('Source survey:', { id: row.id, slug: row.slug, title: row.title, status: row.status });

    // 2. Idempotency check on metro
    const [existing] = await dst`SELECT id FROM surveys WHERE slug = ${SLUG}`;
    if (existing) {
      console.log(`Already in metro (id=${existing.id}); skipping insert.`);
      return;
    }

    // 3. Insert — client_id + branding rewired to Cardiff on metro; created_by
    // nulled (local user 185 ≠ metro user 332); timestamps regenerated.
    const [inserted] = await dst`
      INSERT INTO surveys (
        client_id, title, slug, description, fields, pages,
        thank_you_title, thank_you_message, redirect_url, color,
        branding_profile_id, survey_styling, status, allow_multiple,
        require_email, notify_on_response, notify_digest, closes_at,
        max_responses, linked_type, linked_id, response_count,
        created_by, recommendation, publish_results, certificate_enabled,
        consent_field, scoring_config, parent_survey_id
      ) VALUES (
        ${CARDIFF_CLIENT_ID},
        ${row.title},
        ${row.slug},
        ${row.description},
        ${row.fields as object}::json,
        ${row.pages as object}::json,
        ${row.thank_you_title},
        ${row.thank_you_message},
        ${row.redirect_url},
        ${row.color},
        ${CARDIFF_BRANDING_ID},
        ${row.survey_styling as object}::json,
        ${row.status},
        ${row.allow_multiple},
        ${row.require_email},
        ${row.notify_on_response},
        ${row.notify_digest},
        ${row.closes_at},
        ${row.max_responses},
        ${row.linked_type},
        ${row.linked_id},
        0,
        ${null},
        ${row.recommendation as object | null},
        ${row.publish_results},
        ${row.certificate_enabled},
        ${row.consent_field},
        ${row.scoring_config as object | null},
        ${row.parent_survey_id}
      )
      RETURNING id, slug, title, status, client_id, branding_profile_id
    `;
    console.log('Inserted into metro:', inserted);
  } finally {
    await src.end();
    await dst.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
