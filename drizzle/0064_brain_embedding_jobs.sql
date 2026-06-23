-- Embedding job queue. Write paths enqueue (entity_type, entity_id) here
-- and a cron worker drains the queue, calling embedById for each pending
-- job. Decouples user-facing latency from OpenAI round-trip time and gives
-- us retry+backoff for transient failures.
--
-- Lifecycle:
--   write happens                → INSERT or UPSERT, status='pending'
--   worker picks up               → UPDATE status='processing', started_at=now()
--   worker finishes successfully  → DELETE the row
--   worker fails                  → UPDATE status='failed', attempts++, last_error=...
--
-- A new write while status='processing' upserts back to 'pending' — the
-- in-flight worker still finishes the older content but the next sweep
-- picks up the newer state. Embeddings are upsert-on-chunk-index so
-- duplicate processing is harmless, just wasted tokens (cheap).

CREATE TABLE IF NOT EXISTS "brain_embedding_jobs" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "entity_type" varchar(50) NOT NULL,
  "entity_id" integer NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "enqueued_at" timestamp DEFAULT now() NOT NULL,
  "started_at" timestamp
);

-- One row per entity at any time. Upserts on this index when re-enqueueing.
CREATE UNIQUE INDEX IF NOT EXISTS "brain_embedding_jobs_entity_unique_idx"
  ON "brain_embedding_jobs" ("entity_type", "entity_id");

-- Worker's primary read pattern: oldest pending first.
CREATE INDEX IF NOT EXISTS "brain_embedding_jobs_status_idx"
  ON "brain_embedding_jobs" ("status", "enqueued_at");
