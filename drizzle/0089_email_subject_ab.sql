-- Email subject A/B test (standalone — independent of lib/ab/* engine).
--
-- Adds the columns needed to drive a 10/10/80 split + auto-promote winner
-- flow on email_campaigns. Also adds an `ab_variant` tag to
-- email_campaign_sends so the winner-promotion endpoint can aggregate
-- opens/clicks per variant in one query.
--
-- Columns added to email_campaigns:
--   ab_enabled         boolean default false notNull — gate
--   ab_subject_b       varchar(255)                  — second variant line
--   ab_winner_metric   varchar(20) default 'open'    — 'open' | 'click'
--   ab_test_size_pct   integer default 10            — % of list split A/B
--   ab_winner_subject  varchar(255)                  — chosen winner (audit)
--   ab_decided_at      timestamp                     — when promoted
--
-- Column added to email_campaign_sends:
--   ab_variant         varchar(10)                   — 'a' | 'b' | 'winner'
--
-- HAND-APPLY ONLY — the drizzle migration tracker is drifted (per
-- .claude/MEMORY.md), so `bun run db:migrate` will refuse this. Apply with
-- `psql $DATABASE_URL -f drizzle/0089_email_subject_ab.sql`.
--
-- Idempotent: every column add is `IF NOT EXISTS`.

ALTER TABLE "email_campaigns"
  ADD COLUMN IF NOT EXISTS "ab_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_campaigns"
  ADD COLUMN IF NOT EXISTS "ab_subject_b" varchar(255);
--> statement-breakpoint
ALTER TABLE "email_campaigns"
  ADD COLUMN IF NOT EXISTS "ab_winner_metric" varchar(20) DEFAULT 'open';
--> statement-breakpoint
ALTER TABLE "email_campaigns"
  ADD COLUMN IF NOT EXISTS "ab_test_size_pct" integer DEFAULT 10;
--> statement-breakpoint
ALTER TABLE "email_campaigns"
  ADD COLUMN IF NOT EXISTS "ab_winner_subject" varchar(255);
--> statement-breakpoint
ALTER TABLE "email_campaigns"
  ADD COLUMN IF NOT EXISTS "ab_decided_at" timestamp;
--> statement-breakpoint

ALTER TABLE "email_campaign_sends"
  ADD COLUMN IF NOT EXISTS "ab_variant" varchar(10);
