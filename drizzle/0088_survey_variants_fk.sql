-- 0088 — survey variants foreign-key wiring
--
-- The `survey_variants` table and `survey_responses.variant_id` column were
-- introduced in the base schema (0000) but the FK constraint linking responses
-- back to their assigned variant was deferred to "a future migration" — see
-- the comment on `lib/db/schema/surveys.ts:174`. Wave 1.C of the A/B build
-- (overnight 2026-05-07) is the first feature to actually populate that
-- column, so we land the constraint here.
--
-- Idempotent: every statement is guarded so re-running the migration on a
-- fresh DB (where the constraint may already exist via 0000 generation) is a
-- no-op. ON DELETE SET NULL preserves response history when a variant is
-- deleted — the row keeps the answer payload, just loses its bucket label.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'survey_responses_variant_id_survey_variants_id_fk'
  ) THEN
    ALTER TABLE "survey_responses"
      ADD CONSTRAINT "survey_responses_variant_id_survey_variants_id_fk"
      FOREIGN KEY ("variant_id")
      REFERENCES "public"."survey_variants"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "survey_responses_variant_id_idx"
  ON "survey_responses" ("variant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "survey_variants_survey_id_idx"
  ON "survey_variants" ("survey_id");
