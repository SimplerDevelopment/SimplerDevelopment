/**
 * Backfill the one Cardiff survey response that the automation rule tried
 * to convert to a contact but failed (owner_id=0 FK violation). Survey
 * response id 59, /apply submission from Dan Coyle on 2026-05-28.
 *
 * Idempotent — skips if a contact with this email already exists for Cardiff.
 *
 * Run:  npx tsx scripts/migrations/cardiff/_backfill-missed-contact.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { readFileSync } from 'fs';
import postgres from 'postgres';

const CARDIFF_CLIENT_ID = 146;
const RESPONSE_ID = 59;

function metroUrl(): string {
  const env = readFileSync('.env.local', 'utf8');
  const line = env.split('\n').find((l) => /@metro\.proxy\.rlwy\.net/.test(l));
  if (!line) throw new Error('metro URL not found in .env.local');
  return line.replace(/^# */, '').split(' ')[0].replace(/^DATABASE_URL=/, '');
}

interface SurveyAnswers {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  funding_amount?: string | number;
  monthly_sales?: string | number;
  annual_revenue?: string;
  business_name?: string;
  dba_name?: string;
  industry?: string;
  business_state?: string;
  time_in_business?: string;
  business_structure?: string;
  use_of_funds?: string;
  credit_score?: string;
  ownership_pct?: string;
  how_heard?: string;
  additional_notes?: string;
}

async function main() {
  const sql = postgres(metroUrl(), { max: 1 });
  try {
    const [resp] = await sql<Array<{ id: number; answers: SurveyAnswers; survey_id: number }>>`
      SELECT id, answers, survey_id FROM survey_responses WHERE id = ${RESPONSE_ID}
    `;
    if (!resp) throw new Error(`Response ${RESPONSE_ID} not found`);
    const a = resp.answers;
    if (!a.first_name || !a.email) {
      throw new Error('Missing first_name or email in answers — cannot backfill');
    }

    const [existing] = await sql<Array<{ id: number }>>`
      SELECT id FROM crm_contacts
       WHERE client_id = ${CARDIFF_CLIENT_ID}
         AND email = ${a.email}
       LIMIT 1
    `;
    if (existing) {
      console.log(`Already in CRM (contact id=${existing.id}); skipping.`);
      return;
    }

    const notes = [
      `Survey: Check your eligibility in 60 seconds (response #${RESPONSE_ID})`,
      '',
      `Funding requested: $${a.funding_amount ?? ''}`,
      `Monthly sales: $${a.monthly_sales ?? ''}`,
      `Annual revenue: ${a.annual_revenue ?? ''}`,
      '',
      `Business: ${a.business_name ?? ''}`,
      `DBA: ${a.dba_name ?? ''}`,
      `Industry: ${a.industry ?? ''}`,
      `State: ${a.business_state ?? ''}`,
      `Time in business: ${a.time_in_business ?? ''}`,
      `Structure: ${a.business_structure ?? ''}`,
      `Use of funds: ${a.use_of_funds ?? ''}`,
      '',
      `Credit score: ${a.credit_score ?? ''}`,
      `Ownership: ${a.ownership_pct ?? ''}`,
      `How heard: ${a.how_heard ?? ''}`,
      `Additional notes: ${a.additional_notes ?? ''}`,
    ].join('\n');

    const [inserted] = await sql<Array<{ id: number; first_name: string; email: string | null }>>`
      INSERT INTO crm_contacts (
        client_id, first_name, last_name, email, phone,
        source, status, notes, owner_id
      ) VALUES (
        ${CARDIFF_CLIENT_ID},
        ${a.first_name},
        ${a.last_name ?? null},
        ${a.email},
        ${a.phone ?? null},
        'web',
        'lead',
        ${notes},
        332
      )
      RETURNING id, first_name, email
    `;
    console.log(`Backfilled contact:`, inserted);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
