-- Per-project custom fields. Apply with:
--   psql "$DATABASE_URL" -f drizzle/0096_custom_fields.sql

CREATE TABLE IF NOT EXISTS "project_custom_fields" (
    "id" serial PRIMARY KEY NOT NULL,
    "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
    "key" varchar(60) NOT NULL,
    "name" varchar(100) NOT NULL,
    "kind" varchar(20) NOT NULL,
    "required" boolean DEFAULT false NOT NULL,
    "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_custom_fields_project_key_idx"
    ON "project_custom_fields" ("project_id", "key");

CREATE INDEX IF NOT EXISTS "project_custom_fields_project_idx"
    ON "project_custom_fields" ("project_id", "order");

CREATE TABLE IF NOT EXISTS "card_custom_field_values" (
    "id" serial PRIMARY KEY NOT NULL,
    "card_id" integer NOT NULL REFERENCES "kanban_cards"("id") ON DELETE CASCADE,
    "field_id" integer NOT NULL REFERENCES "project_custom_fields"("id") ON DELETE CASCADE,
    "value" jsonb,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "card_custom_field_values_card_field_idx"
    ON "card_custom_field_values" ("card_id", "field_id");
