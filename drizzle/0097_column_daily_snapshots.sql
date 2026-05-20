-- Daily column snapshots for the cumulative flow diagram.
--   psql "$DATABASE_URL" -f drizzle/0097_column_daily_snapshots.sql

CREATE TABLE IF NOT EXISTS "column_daily_snapshots" (
    "id" serial PRIMARY KEY NOT NULL,
    "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
    "column_id" integer NOT NULL REFERENCES "kanban_columns"("id") ON DELETE CASCADE,
    "snapshot_date" varchar(10) NOT NULL,
    "card_count" integer DEFAULT 0 NOT NULL,
    "total_points" integer DEFAULT 0 NOT NULL,
    "recorded_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "column_daily_snapshots_unique_idx"
    ON "column_daily_snapshots" ("project_id", "column_id", "snapshot_date");

CREATE INDEX IF NOT EXISTS "column_daily_snapshots_project_date_idx"
    ON "column_daily_snapshots" ("project_id", "snapshot_date");
