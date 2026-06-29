-- Auto-provisions the Postgres extensions the schema depends on, on FIRST DB
-- init (the pgvector image runs every *.sql here once, when the data volume is
-- empty). The image ships the extension binaries but does not auto-enable them,
-- and the squashed baseline migration creates a vector(1536) column + gin_trgm_ops
-- indexes that require these to exist before `bun run db:migrate` runs.
-- drizzle-kit never emits CREATE EXTENSION (see scripts/reset-e2e-db.ts), which is
-- why this lives here rather than in a migration.
--
-- Manual (non-Docker) Postgres: run these three statements yourself against your
-- database before `bun run db:migrate`.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
