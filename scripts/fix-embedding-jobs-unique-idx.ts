/**
 * Repair: brain_embedding_jobs is missing the unique index on
 * (entity_type, entity_id) that the enqueue_embedding_job() trigger's
 * ON CONFLICT clause requires. Without it, EVERY posts/notes/meetings write
 * 500s with "42P10: no unique or exclusion constraint matching the ON CONFLICT
 * specification". Migration 0064 creates this index, but DBs built via
 * `drizzle-kit push` (e.g. the local realprod_dryrun) never got it because the
 * Drizzle schema didn't declare it.
 *
 * Safe + idempotent: dedupes any existing (entity_type, entity_id) collisions
 * (keeping the newest row) before creating the index, and uses IF NOT EXISTS.
 * DDL does not fire the row trigger, so no bypass is needed.
 *
 *   npx tsx scripts/fix-embedding-jobs-unique-idx.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const DATABASE_URL = process.env.DATABASE_URL ?? '';
// PROD_DB_HOSTS: optional comma-separated list of hostname[:port] fragments
// that identify production database proxies. See scripts/verify-db-target.ts
// for full documentation. When unset, only RAILWAY_ENVIRONMENT_NAME is used.
const PROD: string[] = (process.env.PROD_DB_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);
if ((PROD.some((p) => DATABASE_URL.includes(p)) || process.env.RAILWAY_ENVIRONMENT_NAME === 'production') && process.env.ALLOW_PROD !== '1') {
  console.error('REFUSING: DATABASE_URL points at a production host. Re-run with ALLOW_PROD=1 only if you mean it.');
  console.error('Set PROD_DB_HOSTS to your production proxy hostname:port, or set RAILWAY_ENVIRONMENT_NAME=production.');
  process.exit(1);
}

(async () => {
  const { db } = await import('../lib/db');
  const { sql } = await import('drizzle-orm');

  const before = await db.execute(sql`SELECT 1 FROM pg_indexes WHERE indexname = 'brain_embedding_jobs_entity_unique_idx'`);
  if ((before.rows ?? (before as unknown as unknown[])).length > 0) {
    console.log('[fix] index already present — nothing to do.');
    process.exit(0);
  }

  // Drop duplicate (entity_type, entity_id) rows, keeping the most recent id.
  const deduped = await db.execute(sql`
    DELETE FROM brain_embedding_jobs a
    USING brain_embedding_jobs b
    WHERE a.entity_type = b.entity_type
      AND a.entity_id = b.entity_id
      AND a.id < b.id`);
  console.log(`[fix] removed ${deduped.rowCount ?? 0} duplicate job row(s).`);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "brain_embedding_jobs_entity_unique_idx"
      ON "brain_embedding_jobs" ("entity_type", "entity_id")`);
  console.log('[fix] created brain_embedding_jobs_entity_unique_idx.');
  process.exit(0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
