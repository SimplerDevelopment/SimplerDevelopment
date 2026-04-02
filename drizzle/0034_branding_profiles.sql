-- Branding Profiles: multiple named brand identities per client
CREATE TABLE IF NOT EXISTS branding_profiles (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  -- Colors
  primary_color VARCHAR(20) DEFAULT '#2563eb',
  secondary_color VARCHAR(20) DEFAULT '#1e40af',
  accent_color VARCHAR(20) DEFAULT '#f59e0b',
  background_color VARCHAR(20) DEFAULT '#ffffff',
  text_color VARCHAR(20) DEFAULT '#111827',
  -- Navigation
  nav_template VARCHAR(50) DEFAULT 'classic',
  nav_position VARCHAR(20) DEFAULT 'top',
  nav_background VARCHAR(20) DEFAULT '#ffffff',
  nav_text_color VARCHAR(20) DEFAULT '#111827',
  -- Fonts
  heading_font VARCHAR(255),
  body_font VARCHAR(255),
  typography JSON,
  -- Logos
  logo_url VARCHAR(500),
  logo_alt VARCHAR(255),
  logo_square_url VARCHAR(500),
  logo_rect_url VARCHAR(500),
  logo_text VARCHAR(255),
  logo_icon_url VARCHAR(500),
  -- Dark mode overrides
  dark_mode JSON,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Allow websites and pitch decks to reference a branding profile
ALTER TABLE client_websites ADD COLUMN IF NOT EXISTS branding_profile_id INTEGER REFERENCES branding_profiles(id) ON DELETE SET NULL;
ALTER TABLE pitch_decks ADD COLUMN IF NOT EXISTS branding_profile_id INTEGER REFERENCES branding_profiles(id) ON DELETE SET NULL;

-- Migrate existing site_branding rows into branding_profiles
INSERT INTO branding_profiles (
  client_id, name, is_default,
  primary_color, secondary_color, accent_color, background_color, text_color,
  nav_template, nav_position, nav_background, nav_text_color,
  heading_font, body_font, typography,
  logo_url, logo_alt, logo_square_url, logo_rect_url, logo_text, logo_icon_url,
  dark_mode
)
SELECT
  cw.client_id,
  cw.name || ' Brand',
  true,
  sb.primary_color, sb.secondary_color, sb.accent_color, sb.background_color, sb.text_color,
  sb.nav_template, sb.nav_position, sb.nav_background, sb.nav_text_color,
  sb.heading_font, sb.body_font, sb.typography,
  sb.logo_url, sb.logo_alt, sb.logo_square_url, sb.logo_rect_url, sb.logo_text, sb.logo_icon_url,
  sb.dark_mode
FROM site_branding sb
JOIN client_websites cw ON cw.id = sb.website_id;

-- Link websites to their migrated profiles
UPDATE client_websites cw
SET branding_profile_id = bp.id
FROM branding_profiles bp
WHERE bp.client_id = cw.client_id
  AND bp.name = cw.name || ' Brand'
  AND bp.is_default = true;
