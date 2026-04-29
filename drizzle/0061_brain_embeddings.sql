-- Phase 6 — pgvector retrieval layer for Company Brain.
--
-- One row per (entity, chunk). Polymorphic by entity_type so the same table
-- serves notes, meetings, relationships, and future entity types. HNSW index
-- on the vector column for fast cosine-similarity ANN search.
--
-- Re-embedding is idempotent: the unique index on (entity_type, entity_id,
-- chunk_index) means an UPSERT replaces the prior chunk. Drop+re-insert all
-- chunks when a doc's chunk count changes.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "brain_embeddings" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "entity_type" varchar(50) NOT NULL,
  "entity_id" integer NOT NULL,
  "chunk_index" integer NOT NULL DEFAULT 0,
  "content" text NOT NULL,
  "vector" vector(1536) NOT NULL,
  "model" varchar(100) NOT NULL,
  "dim" integer NOT NULL,
  "tokens" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_embeddings_entity_chunk_idx"
  ON "brain_embeddings" ("entity_type", "entity_id", "chunk_index");

CREATE INDEX IF NOT EXISTS "brain_embeddings_client_idx"
  ON "brain_embeddings" ("client_id");

CREATE INDEX IF NOT EXISTS "brain_embeddings_entity_idx"
  ON "brain_embeddings" ("entity_type", "entity_id");

-- HNSW index for cosine similarity ANN. m=16, ef_construction=64 are pgvector
-- defaults; tune later if recall isn't sufficient.
CREATE INDEX IF NOT EXISTS "brain_embeddings_vector_hnsw_idx"
  ON "brain_embeddings" USING hnsw ("vector" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
