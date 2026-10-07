import postgres from 'postgres';
import { assertE2eSqlTarget } from './sql-target';

async function main() {
  const input = JSON.parse(await Bun.stdin.text()) as { databaseUrl: string; statement: string };
  const databaseUrl = assertE2eSqlTarget(input.databaseUrl);
  if (typeof input.statement !== 'string' || !input.statement.trim()) throw new Error('Fixture SQL is empty');
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, idle_timeout: 1, prepare: false });
  try {
    // Raw text preserves psql booleans (t/f), numerics, JSON and timestamps;
    // parsed JS values would change several existing fixture assertions.
    const result = await sql.unsafe(input.statement).raw();
    const batches = result.length && 'command' in result[0] ? result : [result];
    const lines: string[] = [];
    for (const batch of batches) {
      for (const row of batch as unknown as (Buffer | null)[][]) {
        lines.push(row.map(value => value === null ? '' : value.toString('utf8')).join('|'));
      }
    }
    process.stdout.write(lines.join('\n'));
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Fixture SQL failed');
  process.exitCode = 1;
});
