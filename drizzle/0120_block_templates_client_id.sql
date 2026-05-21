-- Add tenant scoping to block_templates. NULL = platform-global template
-- (visible to every tenant); non-NULL = scoped to that client's tenant.
-- Hand-applied because the drizzle tracker is out of sync with disk; see
-- memory: project_sd2026_drizzle_tracker_drift.

ALTER TABLE "block_templates"
  ADD COLUMN IF NOT EXISTS "client_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'block_templates_client_id_clients_id_fk'
  ) THEN
    ALTER TABLE "block_templates"
      ADD CONSTRAINT "block_templates_client_id_clients_id_fk"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "block_templates_client_id_idx"
  ON "block_templates" ("client_id");
