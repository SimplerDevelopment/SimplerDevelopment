import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertE2eSqlTarget } from './sql-target';

/** Synchronous fixture SQL with psql -At data output, without a shell or psql. */
export function e2eSql(statement: string): string {
  const databaseUrl = assertE2eSqlTarget(process.env.DATABASE_URL);
  const executable = process.versions.bun ? process.execPath : 'bun';
  return execFileSync(executable, [resolve(__dirname, 'sql-worker.ts')], {
    // SQL and credentials travel through stdin rather than interpolated shell
    // strings or visible command arguments. Bun uses the installed postgres driver.
    input: JSON.stringify({ databaseUrl, statement }), encoding: 'utf8',
    timeout: 20_000, maxBuffer: 8 * 1024 * 1024,
  }).trim();
}
