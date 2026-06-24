/**
 * Seed `eval_datasets` / `eval_cases` from the in-code `.eval.ts` suite fixtures.
 *
 * Companion to `eval-dashboard.ts` (which seeds the prompt registry only —
 * Phase 1 deferred case seeding). Idempotent: `seedCasesFromSuites` upserts.
 *
 * Run: DATABASE_URL=... bunx tsx scripts/migrations/seed-eval-cases.ts
 */
import { seedCasesFromSuites } from '@/lib/ai/evals/cases';

async function main() {
  console.log('[seed-eval-cases] Seeding datasets + cases from suites…');
  const { datasets, cases } = await seedCasesFromSuites();
  console.log(`[seed-eval-cases] Done — ${datasets} datasets, ${cases} cases.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-eval-cases] Fatal error:', err);
    process.exit(1);
  });
