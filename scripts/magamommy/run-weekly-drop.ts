/**
 * Manual trigger for the Magamommy autonomous weekly drop.
 *
 *   bun scripts/magamommy/run-weekly-drop.ts
 *   bun scripts/magamommy/run-weekly-drop.ts --force          # rerun for this week even if already live
 *   bun scripts/magamommy/run-weekly-drop.ts --week=2026-05-19
 *   bun scripts/magamommy/run-weekly-drop.ts --website-id=42
 *
 * Skips Vercel cron auth — direct in-process invocation of the orchestrator.
 * Useful for: first-run verification, post-bootstrap smoke test, debugging
 * a failed cron tick locally against the staging Railway DB.
 *
 * Requires: ANTHROPIC_API_KEY, OPENAI_API_KEY, AWS_* (for S3),
 * DATABASE_URL pointing at the same DB the magamommy tenant was bootstrapped
 * against.
 */

import { runWeeklyDrop } from '@/lib/magamommy/orchestrator';

function parseArgs() {
  const args = process.argv.slice(2);
  const out: { force?: boolean; weekOf?: Date; websiteId?: number } = {};
  for (const a of args) {
    if (a === '--force') out.force = true;
    else if (a.startsWith('--week=')) {
      const s = a.slice('--week='.length);
      const d = new Date(s + 'T00:00:00Z');
      if (Number.isNaN(d.getTime())) throw new Error(`Invalid --week date: ${s}`);
      out.weekOf = d;
    } else if (a.startsWith('--website-id=')) {
      const n = Number(a.slice('--website-id='.length));
      if (!Number.isInteger(n)) throw new Error(`Invalid --website-id: ${a}`);
      out.websiteId = n;
    } else {
      console.warn(`[run-weekly-drop] unknown arg ignored: ${a}`);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  console.log('[run-weekly-drop] starting with args:', args);
  console.log('[run-weekly-drop] DB:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@') ?? '(unset)');

  const t0 = Date.now();
  const result = await runWeeklyDrop(args);
  const elapsedMs = Date.now() - t0;

  console.log('\n────────── DROP RESULT ──────────');
  console.log(`  status:    ${result.status}`);
  console.log(`  dropId:    ${result.dropId}`);
  console.log(`  weekOf:    ${result.weekOf}`);
  console.log(`  websiteId: ${result.websiteId}`);
  if (result.briefId)   console.log(`  briefId:   ${result.briefId}`);
  if (result.conceptId) console.log(`  conceptId: ${result.conceptId}`);
  if (result.designId)  console.log(`  designId:  ${result.designId}`);
  if (result.productId) console.log(`  productId: ${result.productId}`);
  if (result.publicUrl) console.log(`  publicUrl: ${result.publicUrl}`);
  if (result.error)     console.log(`  ERROR @${result.errorStage}: ${result.error}`);
  if (result.timings) {
    console.log('  timings:');
    for (const [k, v] of Object.entries(result.timings)) console.log(`    ${k.padEnd(10)} ${v}ms`);
  }
  console.log(`  total elapsed: ${elapsedMs}ms`);
  console.log('─────────────────────────────────\n');

  process.exit(result.status === 'live' ? 0 : 1);
}

main().catch((err) => {
  console.error('[run-weekly-drop] fatal:', err);
  process.exit(2);
});
