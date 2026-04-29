/**
 * Bootstrap the CRM for Crossover Capital Advisors:
 *   - Referral pipeline tailored to family-attorney outreach
 *   - One tag per US state + DC, plus practice-area tags
 *
 * Idempotent: re-runs are safe.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const STATES: Array<[string, string]> = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'],
  ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'],
  ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];

const PRACTICE_TAGS = [
  { name: 'Family Law',           color: '#0ea5e9' },
  { name: 'Divorce',              color: '#6366f1' },
  { name: 'High-Net-Worth',       color: '#cfa122' }, // Crossover gold
  { name: 'Forensic Accounting',  color: '#8b5cf6' },
  { name: 'Business Valuation',   color: '#10b981' },
  { name: 'Crypto Asset Disputes',color: '#f59e0b' },
];

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;
  if (!clientId) throw new Error('No clientId in ids.json — run restore-standalone-client.ts first');

  const { db } = await import('../../../lib/db');
  const { crmPipelines, crmPipelineStages, crmTags } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // ── Pipeline ──────────────────────────────────────────────────────
  let [pipeline] = await db.select().from(crmPipelines)
    .where(and(eq(crmPipelines.clientId, clientId), eq(crmPipelines.name, 'Attorney Referral Network')))
    .limit(1);

  if (!pipeline) {
    [pipeline] = await db.insert(crmPipelines).values({
      clientId,
      name: 'Attorney Referral Network',
      isDefault: true,
    }).returning();
    console.log(`Pipeline created: ID ${pipeline.id}`);

    const stages = [
      { name: 'Researched',          color: '#94a3b8', sortOrder: 0, probability: 5  },
      { name: 'Outreach Sent',       color: '#3b82f6', sortOrder: 1, probability: 15 },
      { name: 'Conversation',        color: '#8b5cf6', sortOrder: 2, probability: 35 },
      { name: 'Meeting Booked',      color: '#a855f7', sortOrder: 3, probability: 55 },
      { name: 'Active Referral Partner', color: '#22c55e', sortOrder: 4, probability: 100 },
      { name: 'Not a Fit',           color: '#ef4444', sortOrder: 5, probability: 0  },
    ];
    await db.insert(crmPipelineStages).values(stages.map(s => ({
      pipelineId: pipeline.id,
      name: s.name, color: s.color, sortOrder: s.sortOrder, probability: s.probability,
    })));
    console.log(`Stages created: ${stages.length}`);
  } else {
    console.log(`Pipeline exists: ID ${pipeline.id}`);
  }

  // ── State tags ────────────────────────────────────────────────────
  const existingTags = await db.select().from(crmTags).where(eq(crmTags.clientId, clientId));
  const existingNames = new Set(existingTags.map(t => t.name));

  const stateRows = STATES.filter(([abbr]) => !existingNames.has(`State: ${abbr}`)).map(([abbr]) => ({
    clientId,
    name: `State: ${abbr}`,
    color: '#0a1628', // Crossover navy
  }));
  if (stateRows.length > 0) {
    await db.insert(crmTags).values(stateRows);
    console.log(`State tags inserted: ${stateRows.length}`);
  } else {
    console.log('All state tags already present');
  }

  // ── Practice-area tags ────────────────────────────────────────────
  const practiceRows = PRACTICE_TAGS.filter(p => !existingNames.has(p.name)).map(p => ({
    clientId, name: p.name, color: p.color,
  }));
  if (practiceRows.length > 0) {
    await db.insert(crmTags).values(practiceRows);
    console.log(`Practice tags inserted: ${practiceRows.length}`);
  } else {
    console.log('All practice tags already present');
  }

  console.log('\n=== CRM BOOTSTRAP DONE ===');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
