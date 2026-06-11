/**
 * Relayer — "Product Briefing" playbook + a completed demo run.
 *
 * Builds the named sales motion as a Brain playbook (5 task steps that mirror
 * scripts/migrations/relayer's "Sales Playbook — The Product Briefing"
 * document), activates it, then starts and drives ONE run to completion for a
 * clearly-labeled demo prospect — so the Brain's Playbooks + Runs surfaces and
 * the task list all render populated for a client walkthrough.
 *
 * ENGINE NOTE — checklist model, not a linear chain. The run engine
 * (lib/brain/playbook-runs.ts) only auto-spawns successors of `branch` steps:
 * completing a `task` step does NOT spawn its `nextStepKeys`. So a linear
 * task→task chain would stall after step 1. The portable way to get multiple
 * task steps in one run is to make them all ENTRY steps (no nextStepKeys) — a
 * flat checklist that `startRun` spawns together and that completes when every
 * step is done. Display order is preserved via sortOrder. (To enforce strict
 * sequencing you'd interleave `branch` connector steps; a checklist is the
 * right shape for the briefing motion.)
 *
 * Idempotent: reuses the playbook if it already exists (by name), only adds
 * missing steps, and only starts the demo run if one with the same label isn't
 * already present. Safe to re-run.
 *
 * Run (defaults to LOCAL dryrun via .env.local):
 *   npx tsx scripts/migrations/relayer/import-playbook.ts
 */
import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
if (process.env.RL_DATABASE_URL) process.env.DATABASE_URL = process.env.RL_DATABASE_URL;

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const PROD_INDICATORS = ['tramway.proxy.rlwy.net:43167', 'metro.proxy.rlwy.net:25565'];
const isProd =
  PROD_INDICATORS.some((p) => DATABASE_URL.includes(p)) ||
  process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
if (isProd && process.env.ALLOW_PROD !== '1') {
  console.error('REFUSING: DATABASE_URL points at a production host. Re-run with ALLOW_PROD=1 if intentional.');
  process.exit(1);
}

function loadIds(): { clientId?: number; userId?: number } {
  try { return JSON.parse(readFileSync(join(__dirname, '_ids.json'), 'utf8')); } catch { return {}; }
}
const IDS = loadIds();
const CLIENT_ID = parseInt(process.env.RL_CLIENT_ID || '', 10) || IDS.clientId || 0;
const ACTOR_ID = parseInt(process.env.RL_USER_ID || '', 10) || IDS.userId || 0;
if (!CLIENT_ID) { console.error('ERROR: clientId not resolved (expected relayer/_ids.json).'); process.exit(1); }

const PLAYBOOK_NAME = 'Product Briefing';
const RUN_LABEL = 'Briefing — Heartland Motors (OEM) · demo';

// Checklist (all entry steps; ordered by sortOrder): qualify · schedule · prep · deliver · debrief
const STEPS: Array<{ key: string; name: string; description: string; next: string[]; config: Record<string, unknown> }> = [
  {
    key: 'qualify', name: 'Qualify the prospect', next: [],
    description: 'Screen for fit before booking a briefing.',
    config: {
      title: 'Qualify the prospect for a briefing',
      description: 'Confirm: dealer network present? active CSI / customer-experience program? executive interest in post-sale consistency or retention? Capture organization type (OEM / Dealer Group / Technology Partner / Consultant). No dealer network → disqualify.',
      priority: 'high', dueOffsetDays: 2,
    },
  },
  {
    key: 'schedule', name: 'Schedule the private briefing', next: [],
    description: 'Book the briefing once qualified.',
    config: {
      title: 'Schedule the private briefing',
      description: 'Book the briefing with the buying committee. Confirm attendees and org type from the request-a-briefing form (full name, work email, company, title, organization type).',
      priority: 'medium', dueOffsetDays: 4,
    },
  },
  {
    key: 'prep', name: 'Prep the tailored briefing', next: [],
    description: 'Make the briefing specific to this network.',
    config: {
      title: 'Prep the tailored briefing',
      description: "Name THIS prospect's post-sale gap. Pull network specifics — brand, dealer count, known CSI / execution pain — so the briefing speaks to their network, not a generic deck.",
      priority: 'medium', dueOffsetDays: 6,
    },
  },
  {
    key: 'deliver', name: 'Deliver the briefing', next: [],
    description: 'Run the three-part agenda.',
    config: {
      title: 'Deliver the briefing',
      description: 'Walk the agenda: (1) the post-sale gap in their network, (2) how the platform works — three pillars + fragmented → seamless, (3) a tailored path to implementation.',
      priority: 'high', dueOffsetDays: 7,
    },
  },
  {
    key: 'debrief', name: 'Debrief & capture outcome', next: [],
    description: 'Close the loop in the Brain + CRM.',
    config: {
      title: 'Debrief & capture the outcome',
      description: 'Log the briefing as a meeting, update CRM with org type + fit signals, record any pilot-intent decision as a Brain decision, and set next steps.',
      priority: 'medium', dueOffsetDays: 8,
    },
  },
];

async function main() {
  const redacted = DATABASE_URL.replace(/:\/\/[^@]*@/, '://[REDACTED]@');
  console.log(`\nRelayer Product Briefing playbook → clientId ${CLIENT_ID}, actor ${ACTOR_ID}`);
  console.log(`DB: ${redacted || '(socket/default)'}\n`);

  const { db } = await import('@/lib/db');
  const { eq, and } = await import('drizzle-orm');
  const schema = await import('@/lib/db/schema');
  const { createPlaybook, addStep, activatePlaybook, getPlaybookById } = await import('@/lib/brain/playbooks');
  const { startRun, completeStep, getRunById } = await import('@/lib/brain/playbook-runs');

  // 1. PLAYBOOK (idempotent by name) -------------------------------------------
  const [existing] = await db
    .select({ id: schema.brainPlaybooks.id, status: schema.brainPlaybooks.status })
    .from(schema.brainPlaybooks)
    .where(and(eq(schema.brainPlaybooks.clientId, CLIENT_ID), eq(schema.brainPlaybooks.name, PLAYBOOK_NAME)))
    .limit(1);

  let playbookId: number;
  if (existing) {
    playbookId = existing.id;
    console.log(`• playbook "${PLAYBOOK_NAME}" exists (id ${playbookId}, status ${existing.status})`);
  } else {
    const pb = await createPlaybook(CLIENT_ID, ACTOR_ID, {
      name: PLAYBOOK_NAME,
      description: 'Relayer’s named sales motion: a private, qualified briefing for manufacturers and partners — qualify, schedule, prep, deliver, debrief.',
      triggerKind: 'manual',
      category: 'Sales',
      ownerId: ACTOR_ID || null,
    });
    playbookId = pb.id;
    console.log(`✓ playbook created (id ${playbookId})`);
  }

  // 2. STEPS (idempotent by key) -----------------------------------------------
  const haveSteps = await db
    .select({ key: schema.brainPlaybookSteps.key })
    .from(schema.brainPlaybookSteps)
    .where(and(eq(schema.brainPlaybookSteps.clientId, CLIENT_ID), eq(schema.brainPlaybookSteps.playbookId, playbookId)));
  const haveKey = new Set(haveSteps.map((s) => s.key));
  let stepsAdded = 0;
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    if (haveKey.has(s.key)) continue;
    await addStep(CLIENT_ID, ACTOR_ID, playbookId, {
      key: s.key, name: s.name, description: s.description,
      kind: 'task', config: s.config, nextStepKeys: s.next, sortOrder: i,
    });
    stepsAdded++;
  }
  console.log(`✓ steps: ${stepsAdded} added, ${STEPS.length - stepsAdded} already present`);

  // 3. ACTIVATE ----------------------------------------------------------------
  const pb = await getPlaybookById(CLIENT_ID, playbookId);
  if (pb && pb.status !== 'active') {
    await activatePlaybook(CLIENT_ID, ACTOR_ID, playbookId);
    console.log('✓ playbook activated');
  } else {
    console.log('• playbook already active');
  }

  // 4. RUN (idempotent by label) — start + drive to completion -----------------
  const [existingRun] = await db
    .select({ id: schema.brainPlaybookRuns.id, status: schema.brainPlaybookRuns.status })
    .from(schema.brainPlaybookRuns)
    .where(and(eq(schema.brainPlaybookRuns.clientId, CLIENT_ID), eq(schema.brainPlaybookRuns.label, RUN_LABEL)))
    .limit(1);

  if (existingRun) {
    console.log(`• demo run already present (id ${existingRun.id}, status ${existingRun.status}) — skipping`);
  } else {
    const { runId } = await startRun(CLIENT_ID, ACTOR_ID, {
      playbookId,
      label: RUN_LABEL,
      context: { orgType: 'OEM / Manufacturer', prospect: 'Heartland Motors', demo: true },
    });
    console.log(`✓ run started (id ${runId})`);

    // Drive linearly: complete each task step in order; completeStep chains to
    // the next via advanceRun, which materializes the next task step.
    const stepRows = await db
      .select({ id: schema.brainPlaybookSteps.id, key: schema.brainPlaybookSteps.key })
      .from(schema.brainPlaybookSteps)
      .where(and(eq(schema.brainPlaybookSteps.clientId, CLIENT_ID), eq(schema.brainPlaybookSteps.playbookId, playbookId)));
    const stepIdByKey = new Map(stepRows.map((s) => [s.key, s.id]));
    for (const s of STEPS) {
      const stepId = stepIdByKey.get(s.key);
      if (stepId == null) continue;
      const res = await completeStep(CLIENT_ID, ACTOR_ID, runId, stepId);
      console.log(`   ✓ completed step "${s.key}"${res ? '' : ' (not active yet — skipped)'}`);
    }

    const detail = await getRunById(CLIENT_ID, runId);
    console.log(`✓ run ${runId} final status: ${detail?.run.status ?? 'unknown'}`);
  }

  console.log('\nProduct Briefing playbook ready. View at /portal/brain → Playbooks (and the demo run under Runs).\n');
}

main().then(() => process.exit(0)).catch((e) => { console.error('\nPLAYBOOK SEED FAILED:', e); process.exit(1); });
