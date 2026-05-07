-- Brain saved searches — Tana-style "Search Nodes" / Notion-style favorites.
-- A row captures the knowledge sidebar's current filter state (search query,
-- tag prefix / exact tags, pinned-only, sort/order, trashed) as a named pin.
-- `user_id` nullable: null = shared across the tenant; set = personal pin.
-- Tenant boundary is `client_id` regardless.
--
-- Renumbered from drizzle's auto-generated index (0005) to 0071 because
-- drizzle-kit numbers from the journal and our journal is out of sync with
-- on-disk migration filenames; running 0005 before 0047 would fail since
-- brain_saved_searches references brain_notes' parent tables. Mirrors the
-- 0070 renumber pattern (commit 012ac3dc2). Keep statements idempotent so
-- reruns are safe.

CREATE TABLE IF NOT EXISTS "brain_saved_searches" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer,
	"name" varchar(150) NOT NULL,
	"icon" varchar(50) DEFAULT 'bookmark' NOT NULL,
	"filters" json NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "brain_saved_searches" ADD CONSTRAINT "brain_saved_searches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "brain_saved_searches" ADD CONSTRAINT "brain_saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "brain_saved_searches" ADD CONSTRAINT "brain_saved_searches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_saved_searches_client_idx" ON "brain_saved_searches" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_saved_searches_client_user_idx" ON "brain_saved_searches" ("client_id", "user_id");
