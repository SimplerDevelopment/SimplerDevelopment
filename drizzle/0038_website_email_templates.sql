-- Website-scoped transactional email templates
-- Triggered by events (order placed, shipped, etc.) on a per-website basis.

CREATE TABLE website_email_templates (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL REFERENCES client_websites(id) ON DELETE CASCADE,
  event VARCHAR(100) NOT NULL,            -- e.g. 'order.confirmed', 'order.shipped'
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  html_content TEXT NOT NULL DEFAULT '',
  block_content JSON,                     -- BlockEditorData JSON (visual editor)
  variables JSON DEFAULT '[]',            -- Array of { key, label, description, sampleValue }
  branding_profile_id INTEGER REFERENCES branding_profiles(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_required BOOLEAN NOT NULL DEFAULT false,  -- system-required templates (can't delete)
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(website_id, event)
);
