-- In-app notifications. Apply with:
--   psql "$DATABASE_URL" -f drizzle/0091_notifications.sql

CREATE TABLE IF NOT EXISTS "notifications" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "kind" varchar(50) NOT NULL,
    "card_id" integer REFERENCES "kanban_cards"("id") ON DELETE CASCADE,
    "project_id" integer REFERENCES "projects"("id") ON DELETE CASCADE,
    "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "title" varchar(255) NOT NULL,
    "body" text,
    "payload" jsonb,
    "read_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "notifications_user_unread_idx"
    ON "notifications" ("user_id", "read_at");

CREATE INDEX IF NOT EXISTS "notifications_card_idx"
    ON "notifications" ("card_id");
