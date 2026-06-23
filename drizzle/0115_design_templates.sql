-- 0115_design_templates.sql
-- Adds template support to the storefront product designer.
-- Hand-apply via psql; the Drizzle tracker is out of sync so do NOT run via
-- `bun run db:migrate`.

ALTER TABLE designs
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS designs_template_idx
  ON designs (is_template);
