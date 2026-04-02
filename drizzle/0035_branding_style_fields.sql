-- Add style fields to site_branding
ALTER TABLE site_branding ADD COLUMN IF NOT EXISTS border_radius VARCHAR(20) DEFAULT '8px';
ALTER TABLE site_branding ADD COLUMN IF NOT EXISTS link_color VARCHAR(20);
ALTER TABLE site_branding ADD COLUMN IF NOT EXISTS link_hover_color VARCHAR(20);
ALTER TABLE site_branding ADD COLUMN IF NOT EXISTS button_style JSON;
ALTER TABLE site_branding ADD COLUMN IF NOT EXISTS favicon_url VARCHAR(500);
ALTER TABLE site_branding ADD COLUMN IF NOT EXISTS og_image_url VARCHAR(500);

-- Add style fields to branding_profiles
ALTER TABLE branding_profiles ADD COLUMN IF NOT EXISTS border_radius VARCHAR(20) DEFAULT '8px';
ALTER TABLE branding_profiles ADD COLUMN IF NOT EXISTS link_color VARCHAR(20);
ALTER TABLE branding_profiles ADD COLUMN IF NOT EXISTS link_hover_color VARCHAR(20);
ALTER TABLE branding_profiles ADD COLUMN IF NOT EXISTS button_style JSON;
ALTER TABLE branding_profiles ADD COLUMN IF NOT EXISTS favicon_url VARCHAR(500);
ALTER TABLE branding_profiles ADD COLUMN IF NOT EXISTS og_image_url VARCHAR(500);
