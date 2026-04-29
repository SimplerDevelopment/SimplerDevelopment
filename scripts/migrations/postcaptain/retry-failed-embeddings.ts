/**
 * Re-embed any KB-imported note that currently has no chunks in
 * brain_embeddings. Catches notes that failed during the initial import
 * (transient OpenAI errors, oversized inputs, etc.) without re-doing the
 * 2,562 notes that already worked.
 *
 *   bun run scripts/migrations/postcaptain/retry-failed-embeddings.ts
 *
 * Idempotent — safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_CAPTAIN_CLIENT_ID = 100;

async function run() {
  const { db } = await import('../../../lib/db');
  const { sql } = await import('drizzle-orm');
  const { embedEntity } = await import('../../../lib/brain/embeddings');

  // Find imported notes with zero embeddings.
  const rows = await db.execute<{ id: number; title: string; body: string; source_url: string | null }>(sql`
    SELECT n.id, n.title, n.body, n.source_url
    FROM brain_notes n
    LEFT JOIN brain_embeddings e
      ON e.entity_type = 'note' AND e.entity_id = n.id
    WHERE n.client_id = ${POST_CAPTAIN_CLIENT_ID}
      AND n.source = 'document_import'
      AND e.id IS NULL
    ORDER BY n.id
  `);

  const notes = rows as unknown as Array<{ id: number; title: string; body: string; source_url: string | null }>;
  console.log(`>> ${notes.length} notes to re-embed`);

  let succeeded = 0;
  let failed = 0;
  for (const note of notes) {
    try {
      const result = await embedEntity({
        clientId: POST_CAPTAIN_CLIENT_ID,
        entityType: 'note',
        entityId: note.id,
        content: `${note.title}\n\n${note.body}`,
      });
      console.log(`     ok #${note.id}: ${result.chunks} chunks, ${result.tokens} tokens — ${note.source_url}`);
      succeeded++;
    } catch (err) {
      console.error(`     FAIL #${note.id}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }
  console.log(`>> retry done: ${succeeded} succeeded, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
