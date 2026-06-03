import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' }); dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;
import { sql } from 'drizzle-orm';
(async () => {
  const { db } = await import('../../../lib/db');
  const tbl = await db.execute(sql`SELECT to_regclass('public.brain_embedding_jobs') AS t`);
  console.log('brain_embedding_jobs:', JSON.stringify((tbl as any).rows?.[0] ?? (tbl as any)[0]));
  // any duplicate rows that would block the unique index?
  const dups = await db.execute(sql`SELECT entity_type, entity_id, count(*) c FROM brain_embedding_jobs GROUP BY 1,2 HAVING count(*)>1 LIMIT 5`);
  console.log('dup groups:', JSON.stringify((dups as any).rows ?? dups));
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "brain_embedding_jobs_entity_unique_idx" ON "brain_embedding_jobs" ("entity_type","entity_id")`);
  console.log('index ensured.');
})().then(()=>process.exit(0)).catch(e=>{console.error(String(e).slice(0,500));process.exit(1)});
