-- Project goals / OKRs.
--   psql "$DATABASE_URL" -f drizzle/0098_project_goals.sql

CREATE TABLE IF NOT EXISTS "project_goals" (
    "id" serial PRIMARY KEY NOT NULL,
    "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
    "title" varchar(255) NOT NULL,
    "description" text,
    "unit_label" varchar(30),
    "current_value" integer DEFAULT 0 NOT NULL,
    "target_value" integer DEFAULT 100 NOT NULL,
    "target_date" timestamp,
    "status" varchar(20) DEFAULT 'draft' NOT NULL,
    "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "project_goals_project_idx"
    ON "project_goals" ("project_id", "status");
