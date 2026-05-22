-- Brain restructure — Phase 1: brain_decisions + brain_topics + brain_entity_topics.
-- See .planning/brain-restructure/PLAN.md for the full spec and rationale.
--
-- Conventions:
--   * Plain CREATE TABLE (no IF NOT EXISTS) — these are net-new tables.
--   * Indexes use CREATE [UNIQUE] INDEX IF NOT EXISTS for re-apply safety.
--   * Pending review-items of type 'decision' have their old `details` field
--     copied to the new `rationale` slot at the bottom of this file. This is
--     a one-shot, idempotent re-key — running it again is a no-op because the
--     WHERE clause excludes rows where rationale is already set.
--
-- IMPORTANT: the drizzle migration tracker is drifted in prod
-- (memory: project_sd2026_drizzle_tracker_drift). This file is hand-applied
-- via `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0075_brain_decisions_topics.sql`.
-- Do NOT `bun run db:migrate`.

-- ─── brain_decisions ──────────────────────────────────────────────────────

CREATE TABLE "brain_decisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "context" text,
  "decision" text NOT NULL,
  "rationale" text NOT NULL,
  "alternatives_considered" text,
  "reversibility" varchar(20) DEFAULT 'two_way' NOT NULL,
  "status" varchar(20) DEFAULT 'accepted' NOT NULL,
  "decision_maker_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp DEFAULT now() NOT NULL,
  "superseded_by_decision_id" integer REFERENCES "brain_decisions"("id") ON DELETE SET NULL,
  "meeting_id" integer REFERENCES "brain_meetings"("id") ON DELETE SET NULL,
  "note_id" integer REFERENCES "brain_notes"("id") ON DELETE SET NULL,
  "company_id" integer REFERENCES "crm_companies"("id") ON DELETE SET NULL,
  "deal_id" integer REFERENCES "crm_deals"("id") ON DELETE SET NULL,
  "source" varchar(50) DEFAULT 'manual' NOT NULL,
  "review_item_id" integer REFERENCES "brain_ai_review_items"("id") ON DELETE SET NULL,
  "confidentiality_level" varchar(20) DEFAULT 'standard' NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "brain_decisions_client_idx" ON "brain_decisions" ("client_id");
CREATE INDEX IF NOT EXISTS "brain_decisions_decided_at_idx" ON "brain_decisions" ("decided_at");
CREATE INDEX IF NOT EXISTS "brain_decisions_status_idx" ON "brain_decisions" ("status");

-- ─── brain_topics ─────────────────────────────────────────────────────────

CREATE TABLE "brain_topics" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "parent_id" integer REFERENCES "brain_topics"("id") ON DELETE CASCADE,
  "name" varchar(150) NOT NULL,
  "slug" varchar(150) NOT NULL,
  "path" varchar(1000) NOT NULL,
  "description" text,
  "color" varchar(20),
  "icon" varchar(50),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "derived_from_tag" varchar(100),
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_topics_client_slug_idx" ON "brain_topics" ("client_id", "slug");
CREATE INDEX IF NOT EXISTS "brain_topics_client_parent_idx" ON "brain_topics" ("client_id", "parent_id");
CREATE INDEX IF NOT EXISTS "brain_topics_path_idx" ON "brain_topics" ("path");

-- ─── brain_entity_topics ──────────────────────────────────────────────────

CREATE TABLE "brain_entity_topics" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "topic_id" integer NOT NULL REFERENCES "brain_topics"("id") ON DELETE CASCADE,
  "entity_type" varchar(30) NOT NULL,
  "entity_id" integer NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_entity_topics_entity_topic_idx" ON "brain_entity_topics" ("entity_type", "entity_id", "topic_id");
CREATE INDEX IF NOT EXISTS "brain_entity_topics_topic_idx" ON "brain_entity_topics" ("topic_id");
CREATE INDEX IF NOT EXISTS "brain_entity_topics_client_entity_idx" ON "brain_entity_topics" ("client_id", "entity_type", "entity_id");

-- ─── Re-key pending decision review-items: details -> rationale ───────────
--
-- The old BrainReviewItemDecisionPayload was `{ title, details? }`. The new
-- shape is `{ title, context?, decision, rationale, alternativesConsidered?, reversibility?, decidedAt? }`.
-- Pending rows in the wild only have `details`. Copy `details` into `rationale`
-- (and mirror `details` to `decision` so the new required field has *some*
-- value — the reviewer can edit before approval). Idempotent: rows that have
-- already been re-keyed (rationale already set) are skipped.

DO $$
BEGIN
  UPDATE "brain_ai_review_items"
  SET "proposed_payload" = (
    jsonb_set(
      jsonb_set(
        "proposed_payload"::jsonb,
        '{rationale}',
        COALESCE("proposed_payload"::jsonb -> 'details', '""'::jsonb),
        true
      ),
      '{decision}',
      COALESCE("proposed_payload"::jsonb -> 'details', '""'::jsonb),
      true
    )
  )::json
  WHERE "proposed_type" = 'decision'
    AND "status" = 'pending'
    AND ("proposed_payload"::jsonb -> 'rationale') IS NULL;
END $$;
