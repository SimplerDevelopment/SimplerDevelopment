/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import { execSync } from 'child_process';
import * as path from 'path';

/**
 * Full Scribble (goscribble.ai) migration, in dependency order.
 * Idempotent — safe to re-run. Targets whatever DATABASE_URL is set
 * (defaults to prod via each script's `dotenv.config({ path: '.env' })`).
 *
 *   bunx tsx scripts/migrations/goscribble/run-all.ts
 *
 * For a local QA render, override the DB and publish:
 *   DATABASE_URL=postgresql://127.0.0.1/<localdb> bunx tsx scripts/migrations/goscribble/run-all.ts
 *   DATABASE_URL=postgresql://127.0.0.1/<localdb> bunx tsx scripts/migrations/goscribble/toggle-public.ts on
 */
const dir = __dirname;
const steps = [
  'setup-client.ts',     // user + client + website + branding + messaging + storeSettings
  'import-home.ts',
  'import-for-agencies.ts',
  'import-for-clinicians.ts',
  'import-integrations.ts',
  'import-about.ts',
  'import-resources.ts',
  'import-privacy-policy.ts',
  'import-terms-of-service.ts',
  'import-article-ambient-ai.ts',
  'import-article-bedside.ts',
  'import-article-charting.ts',
  'import-article-pdgm.ts',
  'import-nav.ts',
];

for (const step of steps) {
  console.log(`\n──── ${step} ────`);
  execSync(`bunx tsx ${path.join(dir, step)}`, { stdio: 'inherit' });
}
console.log('\n=== SCRIBBLE MIGRATION COMPLETE (drafts; run toggle-public.ts on to expose) ===');
