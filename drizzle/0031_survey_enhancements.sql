-- Survey enhancements: multi-page, logic branching, digest notifications
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS pages JSON DEFAULT '[{"title":"Page 1"}]';
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS notify_digest VARCHAR(10) NOT NULL DEFAULT 'off';
