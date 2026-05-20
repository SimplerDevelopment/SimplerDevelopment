-- Saved views for kanban board / backlog / reports surfaces.
-- Apply with:
--   psql "$DATABASE_URL" -f drizzle/0092_project_saved_views.sql

CREATE TABLE IF NOT EXISTS "project_saved_views" (
    "id" serial PRIMARY KEY NOT NULL,
    "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
    "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
    "scope" varchar(20) NOT NULL,
    "name" varchar(100) NOT NULL,
    "filter_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "project_saved_views_project_idx"
    ON "project_saved_views" ("project_id", "scope");

CREATE INDEX IF NOT EXISTS "project_saved_views_user_idx"
    ON "project_saved_views" ("user_id", "project_id");
