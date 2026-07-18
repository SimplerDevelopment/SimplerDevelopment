-- UAG-003: clients.ai_chat_requires_approval — hand-written; the drizzle tracker is out of sync and
-- db:generate refuses non-interactively (same as 9004/9005/9006/9999).
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, no drops, NOT NULL with a DEFAULT so existing rows backfill.
-- Must be hand-applied to prod + staging before the staging→main merge, same as 9004/9005/9006/9999.
-- Mirrors lib/db/schema/sites.ts (clients.aiChatRequiresApproval).
--
-- Why: the Portal AI assistant (web + streaming chat) executed writes directly. This per-client opt-in,
-- when true, routes high-risk assistant writes (per lib/ai/portal-tools/gating.ts APPROVAL_REQUIRED_TOOLS)
-- through the mcp_pending_changes approval queue instead of applying immediately. Benign edits still pass.
-- Default FALSE is non-breaking — existing clients keep direct execution until they opt in.
--
-- Adds:
--   1. clients.ai_chat_requires_approval — boolean, NOT NULL, default false.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "ai_chat_requires_approval" boolean DEFAULT false NOT NULL;
