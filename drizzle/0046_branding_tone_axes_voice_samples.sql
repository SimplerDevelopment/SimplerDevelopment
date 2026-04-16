-- Structured tone axes (formal↔casual etc.) and voice sample library
-- for the branding messaging row. Both are JSON so existing rows are
-- unaffected — NULL = "not configured, no change in behavior".

ALTER TABLE "branding_messaging"
  ADD COLUMN IF NOT EXISTS "tone_axes" json,
  ADD COLUMN IF NOT EXISTS "voice_samples" json;

COMMENT ON COLUMN "branding_messaging"."tone_axes" IS
  'Structured brand-voice positions: { formal: number, playful: number, traditional: number, authoritative: number } each -1.0 to 1.0';
COMMENT ON COLUMN "branding_messaging"."voice_samples" IS
  'Array of { context: string, text: string } exemplars showing how the brand writes in different scenarios';
