-- Reusable card templates. Apply with:
--   psql "$DATABASE_URL" -f drizzle/0093_card_templates.sql

CREATE TABLE IF NOT EXISTS "card_templates" (
    "id" serial PRIMARY KEY NOT NULL,
    "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
    "project_id" integer REFERENCES "projects"("id") ON DELETE CASCADE,
    "name" varchar(100) NOT NULL,
    "description" text,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "card_templates_client_idx" ON "card_templates" ("client_id");
CREATE INDEX IF NOT EXISTS "card_templates_project_idx" ON "card_templates" ("project_id");
