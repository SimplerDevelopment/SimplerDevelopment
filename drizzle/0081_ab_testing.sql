-- A/B testing for posts/pages.
--
-- Four tables:
--   ab_experiments — one row per experiment, joined to a post
--   ab_variants    — N rows per experiment, each can carry a block-tree override
--   ab_assignments — sticky cookie-bound bucketing, idempotent on (experiment, visitor)
--   ab_events      — view + goal events, fed by server render + client tracker
--
-- Idempotent: every CREATE uses IF NOT EXISTS so re-applying is safe (matches
-- the convention used throughout the rest of drizzle/*.sql in this repo).

CREATE TABLE IF NOT EXISTS "ab_experiments" (
  "id" serial PRIMARY KEY,
  "post_id" integer NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "hypothesis" text,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "variant_split" json NOT NULL,
  "goal_metric" varchar(50) NOT NULL DEFAULT 'page_view',
  "goal_selector" text,
  "started_at" timestamp,
  "ended_at" timestamp,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ab_experiments_post_idx"
  ON "ab_experiments" ("post_id");
CREATE INDEX IF NOT EXISTS "ab_experiments_status_idx"
  ON "ab_experiments" ("status");

CREATE TABLE IF NOT EXISTS "ab_variants" (
  "id" serial PRIMARY KEY,
  "experiment_id" integer NOT NULL REFERENCES "ab_experiments"("id") ON DELETE CASCADE,
  "key" varchar(8) NOT NULL,
  "label" varchar(255) NOT NULL,
  "block_tree_override" json,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ab_variants_experiment_key_idx"
  ON "ab_variants" ("experiment_id", "key");

CREATE TABLE IF NOT EXISTS "ab_assignments" (
  "id" serial PRIMARY KEY,
  "experiment_id" integer NOT NULL REFERENCES "ab_experiments"("id") ON DELETE CASCADE,
  "variant_key" varchar(8) NOT NULL,
  "visitor_id" varchar(64) NOT NULL,
  "occurred_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ab_assignments_experiment_visitor_idx"
  ON "ab_assignments" ("experiment_id", "visitor_id");

CREATE TABLE IF NOT EXISTS "ab_events" (
  "id" serial PRIMARY KEY,
  "experiment_id" integer NOT NULL REFERENCES "ab_experiments"("id") ON DELETE CASCADE,
  "variant_key" varchar(8) NOT NULL,
  "visitor_id" varchar(64) NOT NULL,
  "kind" varchar(20) NOT NULL,
  "occurred_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ab_events_experiment_occurred_idx"
  ON "ab_events" ("experiment_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "ab_events_experiment_visitor_kind_idx"
  ON "ab_events" ("experiment_id", "visitor_id", "kind");
