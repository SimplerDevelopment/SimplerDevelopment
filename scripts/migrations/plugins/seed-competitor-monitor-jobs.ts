/**
 * Seed `registered_app_jobs` rows for postcaptain-tools competitor
 * monitoring. Wave 5 of the competitor-monitoring feature.
 *
 * Run via:
 *   bunx tsx scripts/migrations/plugins/seed-competitor-monitor-jobs.ts
 *
 * Required env vars:
 *   - DATABASE_URL    standard Postgres connection string
 *
 * What it does (idempotent — safe to re-run):
 *   1. Looks up the `postcaptain-tools` registered_apps row.
 *   2. Confirms client 100 (Post Captain Consulting) is in
 *      allowed_client_ids; aborts if not (the operator hasn't entitled
 *      the plugin to postcaptain yet).
 *   3. For each (competitor × depth) pair, upserts a job row keyed by
 *      `(app_id, client_id, name)`. The "name" is the idempotency key
 *      — re-runs UPDATE the existing row's schedule/args rather than
 *      creating duplicates.
 *
 * Job matrix:
 *   - 4 competitors:   carnegie, rhb, waybetter, human-capital
 *   - 2 depths:        news (daily), deep (monthly)
 *   - 8 total jobs
 *
 * Staggered cron times so the 8 jobs don't all hit Anthropic + the
 * worker function at the same second:
 *
 *   News-mode (daily UTC):
 *     carnegie       09:15
 *     rhb            09:30
 *     waybetter      09:45
 *     human-capital  10:00
 *
 *   Deep-mode (1st of month, UTC):
 *     carnegie       10:15
 *     rhb            10:30
 *     waybetter      10:45
 *     human-capital  11:00
 *
 * NOTE: requires the Wave 1 migration (0116_plugin_jobs_cron_expr.sql)
 * applied, the Wave 3 migration (0117_postcaptain_briefs_meta.sql)
 * applied, AND the postcaptain-tools registered_apps row already seeded
 * (scripts/migrations/plugins/seed-postcaptain-tools.ts).
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const POSTCAPTAIN_CLIENT_ID = 100;
const APP_SLUG = 'postcaptain-tools';

type Depth = 'news' | 'deep';
interface JobSpec {
  competitorSlug: string;
  depth: Depth;
  cronExpr: string;
}

const JOBS: JobSpec[] = [
  // News-mode — daily, staggered 09:15–10:00 UTC
  { competitorSlug: 'carnegie',      depth: 'news', cronExpr: '15 9 * * *' },
  { competitorSlug: 'rhb',           depth: 'news', cronExpr: '30 9 * * *' },
  { competitorSlug: 'waybetter',     depth: 'news', cronExpr: '45 9 * * *' },
  { competitorSlug: 'human-capital', depth: 'news', cronExpr: '0 10 * * *' },
  // Deep-mode — 1st of each month, staggered 10:15–11:00 UTC
  { competitorSlug: 'carnegie',      depth: 'deep', cronExpr: '15 10 1 * *' },
  { competitorSlug: 'rhb',           depth: 'deep', cronExpr: '30 10 1 * *' },
  { competitorSlug: 'waybetter',     depth: 'deep', cronExpr: '45 10 1 * *' },
  { competitorSlug: 'human-capital', depth: 'deep', cronExpr: '0 11 1 * *' },
];

function jobName(spec: JobSpec): string {
  return `competitor-monitor: ${spec.competitorSlug} (${spec.depth})`;
}

async function run() {
  const { db } = await import('../../../lib/db');
  const { registeredApps, registeredAppJobs } = await import(
    '../../../lib/db/schema/plugins'
  );
  const { eq, and } = await import('drizzle-orm');
  const { computeNextRun } = await import(
    '../../../lib/plugins/handlers/postcaptain-tools/schedule'
  );

  // ── Step 1: look up the app row ─────────────────────────────────────────
  const [app] = await db
    .select()
    .from(registeredApps)
    .where(eq(registeredApps.slug, APP_SLUG))
    .limit(1);
  if (!app) {
    throw new Error(
      `[seed] no registered_apps row for slug='${APP_SLUG}'. Run seed-postcaptain-tools.ts first.`,
    );
  }
  console.log(`[seed] app id=${app.id} slug=${app.slug} status=${app.status}`);

  // Sanity-check entitlement: client 100 must be in allowed_client_ids
  // (or visibility=global). The jobs themselves only check client allowlist
  // at run-fire time, but a misconfigured allowlist would mean every fire
  // gets rejected. Fail loud here so the operator can fix before we seed.
  const allowed = (app.allowedClientIds ?? []) as number[];
  if (app.visibility === 'allowlist' && !allowed.includes(POSTCAPTAIN_CLIENT_ID)) {
    throw new Error(
      `[seed] client ${POSTCAPTAIN_CLIENT_ID} (Post Captain Consulting) is not in registered_apps.allowed_client_ids ([${allowed.join(', ')}]). Update the entitlement before seeding jobs.`,
    );
  }

  // ── Step 2: upsert each job by name ────────────────────────────────────
  let inserted = 0;
  let updated = 0;
  for (const spec of JOBS) {
    const name = jobName(spec);
    const args = { competitorSlug: spec.competitorSlug, depth: spec.depth };
    const nextRunAt = computeNextRun({ cronExpr: spec.cronExpr, dayOfWeek: null, timeUtc: null });

    const [existing] = await db
      .select({ id: registeredAppJobs.id })
      .from(registeredAppJobs)
      .where(and(
        eq(registeredAppJobs.appId, app.id),
        eq(registeredAppJobs.clientId, POSTCAPTAIN_CLIENT_ID),
        eq(registeredAppJobs.name, name),
      ))
      .limit(1);

    if (existing) {
      await db.update(registeredAppJobs).set({
        kind: 'competitor-research',
        args,
        cronExpr: spec.cronExpr,
        dayOfWeek: null,
        timeUtc: null,
        nextRunAt,
        updatedAt: new Date(),
        enabled: true,
      }).where(eq(registeredAppJobs.id, existing.id));
      updated += 1;
      console.log(`[seed] UPDATED job id=${existing.id} '${name}' cron='${spec.cronExpr}' nextRun=${nextRunAt.toISOString()}`);
    } else {
      const [inserted_row] = await db.insert(registeredAppJobs).values({
        appId: app.id,
        clientId: POSTCAPTAIN_CLIENT_ID,
        name,
        kind: 'competitor-research',
        args,
        cronExpr: spec.cronExpr,
        dayOfWeek: null,
        timeUtc: null,
        nextRunAt,
        enabled: true,
        createdBy: null, // seed script — no user attribution
      }).returning({ id: registeredAppJobs.id });
      inserted += 1;
      console.log(`[seed] INSERTED job id=${inserted_row.id} '${name}' cron='${spec.cronExpr}' nextRun=${nextRunAt.toISOString()}`);
    }
  }

  console.log(`\n[seed] done: ${inserted} inserted, ${updated} updated, ${JOBS.length} total`);
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error('[seed] FAILED', err);
    process.exit(1);
  },
);
