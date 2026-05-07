-- Email block builder additions:
--   1) email_campaigns.content_blocks  json   — Block[] tree (parallel path to
--                                               htmlContent / templates).
--   2) email_campaigns.use_block_editor boolean default false — render from
--                                                               content_blocks
--                                                               at send time.
--   3) email_renders                   table  — sha256-keyed cache of compiled
--                                               HTML so each campaign blast
--                                               renders once, not per-recipient.
--
-- HAND-APPLY ONLY — the drizzle migration tracker is drifted (per
-- .claude/MEMORY.md), so `bun run db:migrate` will refuse this. Apply with
-- `psql $DATABASE_URL -f drizzle/0086_email_block_builder.sql`.
--
-- Idempotent: every column is `ADD COLUMN IF NOT EXISTS`, the new table is
-- `CREATE TABLE IF NOT EXISTS`, and the index is `CREATE INDEX IF NOT EXISTS`.

ALTER TABLE "email_campaigns"
  ADD COLUMN IF NOT EXISTS "content_blocks" json;
--> statement-breakpoint
ALTER TABLE "email_campaigns"
  ADD COLUMN IF NOT EXISTS "use_block_editor" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "email_renders" (
  "id" serial PRIMARY KEY NOT NULL,
  "campaign_id" integer NOT NULL,
  "blocks_hash" varchar(64) NOT NULL,
  "html" text NOT NULL,
  "subject" text,
  "generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "email_renders"
    ADD CONSTRAINT "email_renders_campaign_id_email_campaigns_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_renders_campaign_hash_idx"
  ON "email_renders" ("campaign_id", "blocks_hash");
