-- Add branding profile references to booking pages and surveys
ALTER TABLE "booking_pages" ADD COLUMN "branding_profile_id" integer REFERENCES "branding_profiles"("id") ON DELETE SET NULL;
ALTER TABLE "surveys" ADD COLUMN "branding_profile_id" integer REFERENCES "branding_profiles"("id") ON DELETE SET NULL;
