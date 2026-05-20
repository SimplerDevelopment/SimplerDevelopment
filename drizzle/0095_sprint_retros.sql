-- Sprint retrospectives. Apply with:
--   psql "$DATABASE_URL" -f drizzle/0095_sprint_retros.sql

CREATE TABLE IF NOT EXISTS "sprint_retros" (
    "id" serial PRIMARY KEY NOT NULL,
    "sprint_id" integer NOT NULL REFERENCES "sprints"("id") ON DELETE CASCADE,
    "status" varchar(20) DEFAULT 'open' NOT NULL,
    "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sprint_retros_sprint_idx"
    ON "sprint_retros" ("sprint_id");

CREATE TABLE IF NOT EXISTS "sprint_retro_items" (
    "id" serial PRIMARY KEY NOT NULL,
    "retro_id" integer NOT NULL REFERENCES "sprint_retros"("id") ON DELETE CASCADE,
    "kind" varchar(20) NOT NULL,
    "text" text NOT NULL,
    "votes" integer DEFAULT 0 NOT NULL,
    "author_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "promoted_card_id" integer REFERENCES "kanban_cards"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "sprint_retro_items_retro_idx"
    ON "sprint_retro_items" ("retro_id", "kind");
