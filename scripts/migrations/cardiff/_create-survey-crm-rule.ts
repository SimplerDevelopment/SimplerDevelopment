/**
 * Cardiff automation rule: every cardiff-business-apply survey submission
 * auto-creates a CRM contact (status='lead', source='web') with the
 * applicant's name + email + phone + a notes blob summarizing the answers.
 *
 * No dedupe — each submission creates a new contact row. That's the simplest
 * option; if Cardiff wants dedup-by-email later, we can swap the action for a
 * pre-handler that looks up by email + updates instead of creating.
 *
 * Idempotent — re-running upserts on (client_id, name).
 *
 * Run:  npx tsx scripts/migrations/cardiff/_create-survey-crm-rule.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { readFileSync } from 'fs';
import postgres from 'postgres';

const CARDIFF_CLIENT_ID = 146;
const SURVEY_ID = 155; // cardiff-business-apply on metro
const RULE_NAME = 'Cardiff: Survey → CRM contact';

function metroUrl(): string {
  const env = readFileSync('.env.local', 'utf8');
  const line = env.split('\n').find((l) => /@metro\.proxy\.rlwy\.net/.test(l));
  if (!line) throw new Error('metro URL not found in .env.local');
  return line.replace(/^# */, '').split(' ')[0].replace(/^DATABASE_URL=/, '');
}

const trigger = {
  event: 'survey.response_submitted',
  filters: { surveyId: SURVEY_ID },
};

const actions = [
  {
    tool: 'create_crm_contact',
    params: {
      first_name: '{{event.answers.first_name}}',
      last_name: '{{event.answers.last_name}}',
      email: '{{event.answers.email}}',
      phone: '{{event.answers.phone}}',
      source: 'web',
      status: 'lead',
      notes: [
        'Survey: {{event.surveyTitle}}',
        '',
        'Funding requested: ${{event.answers.funding_amount}}',
        'Monthly sales: ${{event.answers.monthly_sales}}',
        'Annual revenue: {{event.answers.annual_revenue}}',
        '',
        'Business: {{event.answers.business_name}}',
        'DBA: {{event.answers.dba_name}}',
        'Industry: {{event.answers.industry}}',
        'State: {{event.answers.business_state}}',
        'Time in business: {{event.answers.time_in_business}}',
        'Structure: {{event.answers.business_structure}}',
        'Use of funds: {{event.answers.use_of_funds}}',
        '',
        'Credit score: {{event.answers.credit_score}}',
        'Ownership: {{event.answers.ownership_pct}}',
        'How heard: {{event.answers.how_heard}}',
        'Additional notes: {{event.answers.additional_notes}}',
      ].join('\n'),
    },
  },
];

async function main() {
  const sql = postgres(metroUrl(), { max: 1 });
  try {
    // Resolve Cardiff owner for created_by attribution.
    const [owner] = await sql<Array<{ user_id: number }>>`
      SELECT user_id FROM clients WHERE id = ${CARDIFF_CLIENT_ID}
    `;
    if (!owner) throw new Error('Cardiff client not found');
    console.log(`Cardiff owner user_id=${owner.user_id}`);

    const [existing] = await sql<Array<{ id: number; enabled: boolean }>>`
      SELECT id, enabled
        FROM automation_rules
       WHERE client_id = ${CARDIFF_CLIENT_ID} AND name = ${RULE_NAME}
    `;

    if (existing) {
      console.log(`Rule exists (id=${existing.id}); updating trigger + actions in place.`);
      await sql`
        UPDATE automation_rules
           SET trigger = ${trigger as object}::json,
               actions = ${actions as object[]}::json,
               conditions = '[]'::json,
               enabled = true,
               source = 'manual',
               product_scope = 'surveys',
               updated_at = now()
         WHERE id = ${existing.id}
      `;
      console.log('Rule updated.');
    } else {
      const [created] = await sql<Array<{ id: number }>>`
        INSERT INTO automation_rules (
          client_id, name, description, trigger, conditions, actions,
          enabled, source, product_scope, created_by
        ) VALUES (
          ${CARDIFF_CLIENT_ID},
          ${RULE_NAME},
          'Auto-create a CRM contact for every cardiff-business-apply submission.',
          ${trigger as object}::json,
          '[]'::json,
          ${actions as object[]}::json,
          true,
          'manual',
          'surveys',
          ${owner.user_id}
        )
        RETURNING id
      `;
      console.log(`Rule created (id=${created.id}).`);
    }

    // Verify
    const [check] = await sql<Array<{
      id: number; name: string; enabled: boolean;
      trigger_event: string; first_tool: string;
    }>>`
      SELECT id, name, enabled,
             trigger->>'event' AS trigger_event,
             (actions::jsonb)->0->>'tool' AS first_tool
        FROM automation_rules
       WHERE client_id = ${CARDIFF_CLIENT_ID} AND name = ${RULE_NAME}
    `;
    console.log('\nFinal state:', check);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
