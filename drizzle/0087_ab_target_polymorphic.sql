-- Generalize ab_experiments from post-only to target-polymorphic.
-- target_type is the entity kind ('post' | 'deck' | 'survey' | 'email');
-- target_id is the row id within that entity. Existing rows backfill from
-- post_id with target_type='post'. The post_id column + FK is loosened (made
-- nullable, FK dropped) so non-post experiments can land — back-compat with
-- the authorizeExperimentForUser path is preserved by mirroring target_id
-- back into post_id at write time when target_type='post'.

ALTER TABLE "ab_experiments"
  ADD COLUMN IF NOT EXISTS "target_type" varchar(20) NOT NULL DEFAULT 'post';
--> statement-breakpoint
ALTER TABLE "ab_experiments"
  ADD COLUMN IF NOT EXISTS "target_id" integer;
--> statement-breakpoint
UPDATE "ab_experiments" SET "target_id" = "post_id" WHERE "target_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "ab_experiments" ALTER COLUMN "target_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ab_experiments" DROP CONSTRAINT IF EXISTS "ab_experiments_post_id_posts_id_fk";
--> statement-breakpoint
ALTER TABLE "ab_experiments" ALTER COLUMN "post_id" DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ab_experiments_target_idx"
  ON "ab_experiments" ("target_type", "target_id", "status");
