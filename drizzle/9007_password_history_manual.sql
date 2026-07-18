-- Password history for reuse prevention (AUTH79-002) — hand-written; the tracker
-- is out of sync so db:generate refuses (interactive column-conflict prompt on
-- the populated users table, same reason as 9004).
-- Safe to re-run: IF NOT EXISTS, nullable-with-default, no drops, no data rewrite.
-- Must be hand-applied to prod + staging before the staging→main merge, same as
-- 9003/9004/9999. Mirrors lib/db/schema/auth.ts (users.passwordHistory).
--
-- Adds users.password_history — the most-recent bcrypt password hashes
-- (newest first, capped in app code at PASSWORD_HISTORY_LIMIT). Password reset
-- and in-session change reject a new password that matches the current hash or
-- any hash in this list.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_history" jsonb NOT NULL DEFAULT '[]'::jsonb;
