-- UAG-002: automation_rules.requires_approval — hand-written; the drizzle tracker is out of sync and
-- db:generate refuses non-interactively (same as 9004/9005/9006/9008/9999).
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, no drops, NOT NULL with a DEFAULT so existing rows backfill.
-- Must be hand-applied to prod + staging before the staging→main merge.
-- Mirrors lib/db/schema/brain.ts (automationRules.requiresApproval).
--
-- Why: the automation engine ran rule actions unattended on templated event input. When true, this rule's
-- HIGH-RISK actions (lib/ai/portal-tools/gating.ts APPROVAL_REQUIRED_TOOLS) stage to mcp_pending_changes
-- for human approval instead of executing; benign actions still run. Rules the Portal AI assistant authors
-- (source='ai') set this true at creation, so an injected chat can't self-arm autonomous high-risk writes.
-- Default FALSE is non-breaking — existing (human-authored) rules keep running exactly as before.
--
-- Adds:
--   1. automation_rules.requires_approval — boolean, NOT NULL, default false.

ALTER TABLE "automation_rules" ADD COLUMN IF NOT EXISTS "requires_approval" boolean DEFAULT false NOT NULL;
