-- Recurring card creation. Apply with:
--   psql "$DATABASE_URL" -f drizzle/0094_card_recurrences.sql

CREATE TABLE IF NOT EXISTS "card_recurrences" (
    "id" serial PRIMARY KEY NOT NULL,
    "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
    "column_id" integer NOT NULL REFERENCES "kanban_columns"("id") ON DELETE CASCADE,
    "template_id" integer REFERENCES "card_templates"("id") ON DELETE SET NULL,
    "title_pattern" varchar(255),
    "description" text,
    "cadence" varchar(20) NOT NULL,
    "day_of_week" integer,
    "day_of_month" integer,
    "hour_utc" integer DEFAULT 9 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "last_fired_at" timestamp,
    "last_fired_card_id" integer,
    "next_fire_at" timestamp NOT NULL,
    "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "card_recurrences_due_idx"
    ON "card_recurrences" ("active", "next_fire_at");

CREATE INDEX IF NOT EXISTS "card_recurrences_project_idx"
    ON "card_recurrences" ("project_id");
