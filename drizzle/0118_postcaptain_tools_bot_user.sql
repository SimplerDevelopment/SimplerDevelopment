-- Postcaptain Tools — dedicated bot user for auto-generated artifacts.
--
-- Wave 4 of competitor-monitoring writes brain_notes rows and
-- kanban_card_comments rows on behalf of the worker (not a real person).
-- Attributing those to a stable, recognizable user — `tools-bot@
-- simplerdevelopment.com` — makes the audit trail honest and lets the UI
-- render "postcaptain-tools-bot" next to machine-authored content rather
-- than blurring it into a human's name.
--
-- The password column is non-nullable in users; we store a sentinel value
-- that no bcrypt/argon flow would ever produce. role='system' is a new
-- role string — code paths that switch on role and don't recognize it
-- treat the user as un-privileged, which is the right default. active=false
-- so a stray login attempt with this email fails at the active-check
-- before any password comparison.
--
-- Idempotent: `ON CONFLICT (email) DO NOTHING` makes the migration safe
-- to re-run.

INSERT INTO users (name, email, password, role, active, created_at, updated_at)
VALUES (
  'Postcaptain Tools Bot',
  'tools-bot@simplerdevelopment.com',
  '__NOLOGIN__',
  'system',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;
