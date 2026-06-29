/**
 * Ensure the prompt-eval-dashboard tables + seed exist in the test DB.
 *
 * The eval tables (prompt_registry, prompt_versions, eval_datasets, eval_cases,
 * eval_runs, prompt_audit_log) are NOT in the numbered drizzle migration chain —
 * they ship via the standalone scripts/migrations/eval-dashboard.ts (+ the case
 * seeder). So a fresh `--reset-db` E2E run won't have them. This helper runs
 * those idempotent scripts against the current DATABASE_URL so an eval spec is
 * self-sufficient (locally and in CI). Runs once per process.
 */
import { execFileSync } from 'node:child_process';

let ensured = false;

export function ensureEvalSchema(): void {
  if (ensured) return;
  if (!process.env.DATABASE_URL) {
    throw new Error('ensureEvalSchema: DATABASE_URL must be set');
  }
  const opts = { cwd: process.cwd(), env: process.env, stdio: 'pipe' as const };
  // Tables + prompt registry seed, then the dataset/case seed (both idempotent).
  execFileSync('bunx', ['tsx', 'scripts/migrations/eval-dashboard.ts'], opts);
  execFileSync('bunx', ['tsx', 'scripts/migrations/seed-eval-cases.ts'], opts);
  ensured = true;
}
