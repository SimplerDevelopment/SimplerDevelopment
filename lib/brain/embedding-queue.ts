/**
 * Embedding job queue. Write handlers call enqueueEmbedding() — a cheap
 * single-row upsert — and a cron worker drains the queue by calling
 * embedById() for each pending job.
 *
 * Why a queue instead of inline embedding on every write:
 *   * embedById hits OpenAI (~500ms). We don't want to slow user-facing
 *     POST/PATCH responses with that round-trip.
 *   * The queue gives us retry-on-transient-failure for free.
 *   * Multiple rapid writes to the same entity collapse to one re-embed
 *     thanks to the unique index on (entity_type, entity_id).
 *
 * Failure handling: on error, status flips to 'failed' and attempts
 * increments. The worker re-tries failed jobs up to MAX_ATTEMPTS, after
 * which it leaves them alone for a human to inspect.
 */

import { db } from '@/lib/db';
import { brainEmbeddingJobs } from '@/lib/db/schema';
import { sql, eq, and, lt, or, asc } from 'drizzle-orm';
import { embedById } from './embeddings';
import type { EntityType } from './embeddings';

const MAX_ATTEMPTS = 3;
const DEFAULT_BATCH_SIZE = 25;

/**
 * Enqueue an entity for (re-)embedding. Idempotent on (entity_type, entity_id):
 * if a job already exists it gets reset to 'pending' with attempts=0. The
 * caller does not need to know whether a job already existed.
 *
 * Cheap — one INSERT/UPDATE. Safe to call from any write handler. Errors
 * are swallowed so a queue outage never breaks the user-facing write.
 */
export async function enqueueEmbedding(
  clientId: number,
  entityType: EntityType,
  entityId: number,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO brain_embedding_jobs (client_id, entity_type, entity_id, status, attempts, last_error, enqueued_at)
      VALUES (${clientId}, ${entityType}, ${entityId}, 'pending', 0, NULL, now())
      ON CONFLICT (entity_type, entity_id)
      DO UPDATE SET
        status = 'pending',
        attempts = 0,
        last_error = NULL,
        enqueued_at = now(),
        started_at = NULL,
        client_id = EXCLUDED.client_id
    `);
  } catch (err) {
    console.warn('[embeddings.queue] enqueue failed (non-fatal)', { entityType, entityId, err });
  }
}

/**
 * Enqueue multiple entities at once. Used by bulk handlers (e.g. CRM CSV
 * import). Inserts in one round-trip via VALUES list rather than N inserts.
 */
export async function enqueueEmbeddingsBulk(
  clientId: number,
  entries: Array<{ entityType: EntityType; entityId: number }>,
): Promise<void> {
  if (entries.length === 0) return;
  // Postgres can handle thousands of values in one statement; chunk just to
  // avoid pathological cases.
  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const slice = entries.slice(i, i + CHUNK);
    const valuesSql = slice.map(e =>
      sql`(${clientId}, ${e.entityType}, ${e.entityId}, 'pending', 0, NULL, now())`
    );
    try {
      await db.execute(sql`
        INSERT INTO brain_embedding_jobs (client_id, entity_type, entity_id, status, attempts, last_error, enqueued_at)
        VALUES ${sql.join(valuesSql, sql`, `)}
        ON CONFLICT (entity_type, entity_id)
        DO UPDATE SET
          status = 'pending',
          attempts = 0,
          last_error = NULL,
          enqueued_at = now(),
          started_at = NULL,
          client_id = EXCLUDED.client_id
      `);
    } catch (err) {
      console.warn('[embeddings.queue] bulk enqueue chunk failed', { offset: i, err });
    }
  }
}

export interface DrainResult {
  picked: number;
  succeeded: number;
  failed: number;
  errors: Array<{ entityType: string; entityId: number; error: string }>;
}

/**
 * Drain up to `maxJobs` pending or retryable-failed jobs from the queue.
 * Each batch call is bounded so the cron worker can't run unbounded — a
 * deep queue gets drained over multiple cron ticks rather than one long
 * request.
 */
export async function drainQueue(maxJobs = DEFAULT_BATCH_SIZE): Promise<DrainResult> {
  const result: DrainResult = { picked: 0, succeeded: 0, failed: 0, errors: [] };

  // Atomically pick a batch of jobs and mark them processing. Using a CTE
  // with `FOR UPDATE SKIP LOCKED` lets multiple concurrent workers run
  // safely (one cron + ad-hoc bun run, etc.) without picking the same job.
  const rows = await db.execute<{ id: number; client_id: number; entity_type: string; entity_id: number; attempts: number }>(sql`
    WITH picked AS (
      SELECT id
      FROM brain_embedding_jobs
      WHERE status = 'pending'
         OR (status = 'failed' AND attempts < ${MAX_ATTEMPTS})
      ORDER BY enqueued_at ASC
      LIMIT ${maxJobs}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE brain_embedding_jobs j
    SET status = 'processing', started_at = now()
    FROM picked
    WHERE j.id = picked.id
    RETURNING j.id, j.client_id, j.entity_type, j.entity_id, j.attempts
  `);

  const jobs = rows as unknown as Array<{ id: number; client_id: number; entity_type: string; entity_id: number; attempts: number }>;
  result.picked = jobs.length;
  if (jobs.length === 0) return result;

  for (const job of jobs) {
    try {
      await embedById({
        clientId: job.client_id,
        entityType: job.entity_type as EntityType,
        entityId: job.entity_id,
      });
      // Success — remove the row.
      await db.execute(sql`DELETE FROM brain_embedding_jobs WHERE id = ${job.id}`);
      result.succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.execute(sql`
        UPDATE brain_embedding_jobs
        SET status = 'failed', attempts = attempts + 1, last_error = ${msg}
        WHERE id = ${job.id}
      `);
      result.failed++;
      result.errors.push({ entityType: job.entity_type, entityId: job.entity_id, error: msg });
    }
  }
  return result;
}

/**
 * Snapshot of queue health. For monitoring + admin UI.
 */
export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  failed: number;
  failedExhausted: number;
}> {
  const rows = await db.execute<{ status: string; cnt: number; exhausted: number }>(sql`
    SELECT status, count(*)::int AS cnt,
      count(*) FILTER (WHERE attempts >= ${MAX_ATTEMPTS})::int AS exhausted
    FROM brain_embedding_jobs
    GROUP BY status
  `);
  const stats = { pending: 0, processing: 0, failed: 0, failedExhausted: 0 };
  for (const r of rows as unknown as Array<{ status: string; cnt: number; exhausted: number }>) {
    if (r.status === 'pending') stats.pending = r.cnt;
    else if (r.status === 'processing') stats.processing = r.cnt;
    else if (r.status === 'failed') {
      stats.failed = r.cnt;
      stats.failedExhausted = r.exhausted;
    }
  }
  return stats;
}
