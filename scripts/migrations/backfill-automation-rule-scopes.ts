/**
 * Backfill automation_rules.scopes for all existing rows.
 *
 * For each rule, the derived scopes are computed as the deduped, sorted union
 * of requiredScopeFor(action.tool) over all actions in the rule.  Actions
 * whose tool name is unknown to the registry (e.g. 'start_playbook') are
 * silently skipped — they don't map to a portal-tool scope.
 *
 * Usage:
 *   # dry-run (prints what would change, writes nothing):
 *   bun scripts/migrations/backfill-automation-rule-scopes.ts --dry-run
 *
 *   # apply:
 *   bun scripts/migrations/backfill-automation-rule-scopes.ts
 *
 * Idempotent — safe to run multiple times.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  const { db } = await import('../../lib/db');
  const { automationRules } = await import('../../lib/db/schema');
  const { deriveRuleScopes } = await import('../../lib/ai/portal-tools/derive-rule-scopes');
  const { eq } = await import('drizzle-orm');

  const rows = await db.select({
    id: automationRules.id,
    name: automationRules.name,
    actions: automationRules.actions,
    scopes: automationRules.scopes,
  }).from(automationRules);

  console.log(`Found ${rows.length} automation rule(s).`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const derived = deriveRuleScopes(row.actions ?? []);
    const current = (row.scopes ?? []).slice().sort().join(',');
    const next = derived.join(',');

    if (current === next) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `[dry-run] id=${row.id} name="${row.name}"` +
        `\n  current scopes: [${current || '(empty)'}]` +
        `\n  derived scopes: [${next || '(empty)'}]`,
      );
      updated++;
    } else {
      await db.update(automationRules)
        .set({ scopes: derived })
        .where(eq(automationRules.id, row.id));
      updated++;
    }
  }

  const verb = DRY_RUN ? 'would update' : 'updated';
  console.log(`\nDone. ${verb} ${updated} rule(s), skipped ${skipped} (already correct).`);
  if (DRY_RUN) {
    console.log('Re-run without --dry-run to apply.');
  }
  process.exit(0);
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
