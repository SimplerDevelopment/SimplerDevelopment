-- Named button presets for branding profiles — clients define N named styles
-- referenced by ButtonBlock.presetId. JSON so existing rows are unaffected.

ALTER TABLE "branding_profiles"
  ADD COLUMN IF NOT EXISTS "button_presets" json;
