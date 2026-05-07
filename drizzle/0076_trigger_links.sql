-- Trigger links: tracked shortlinks that 302-redirect to a destination URL
-- and write one row to `trigger_link_clicks` per visit. Slugs are global —
-- there's no per-client namespace in the URL; uniqueness is enforced by the
-- index on `slug`. Click counts are derived (count rows in
-- `trigger_link_clicks` where link_id matches).
--
-- Tracker drift: this migration is HAND-APPLIED in production. Do not run
-- `bun run db:migrate` — see CLAUDE.md.

CREATE TABLE IF NOT EXISTS "trigger_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "slug" varchar(64) NOT NULL,
  "destination_url" text NOT NULL,
  "label" varchar(255),
  "contact_field_key" text,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "trigger_links_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "trigger_links"
    ADD CONSTRAINT "trigger_links_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "trigger_links"
    ADD CONSTRAINT "trigger_links_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trigger_links_client_id_idx"
  ON "trigger_links" ("client_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "trigger_link_clicks" (
  "id" serial PRIMARY KEY NOT NULL,
  "link_id" integer NOT NULL,
  "client_id" integer NOT NULL,
  "contact_id" integer,
  "ip" text,
  "user_agent" text,
  "referer" text,
  "occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "trigger_link_clicks"
    ADD CONSTRAINT "trigger_link_clicks_link_id_trigger_links_id_fk"
    FOREIGN KEY ("link_id") REFERENCES "public"."trigger_links"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "trigger_link_clicks"
    ADD CONSTRAINT "trigger_link_clicks_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trigger_link_clicks_link_id_occurred_at_idx"
  ON "trigger_link_clicks" ("link_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trigger_link_clicks_client_id_idx"
  ON "trigger_link_clicks" ("client_id");
