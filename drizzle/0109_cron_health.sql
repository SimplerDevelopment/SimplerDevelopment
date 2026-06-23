-- Cron / scheduled-job health tracking. One row per job, upserted at
-- start and end of each run. Powers /admin/system-health.
--
-- NOTE: hand-written rather than `drizzle-kit generate` output because the
-- repo's drizzle meta snapshots have a pre-existing collision (see
-- drizzle/meta/_journal.json drift documented in project memory). Mirrors
-- the column shape of lib/db/schema/cronHealth.ts exactly.

CREATE TABLE IF NOT EXISTS "cron_health" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"area" varchar(40) NOT NULL,
	"last_run_at" timestamp,
	"last_success_at" timestamp,
	"last_error" text,
	"last_error_at" timestamp,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cron_health_name_unique" UNIQUE("name")
);
