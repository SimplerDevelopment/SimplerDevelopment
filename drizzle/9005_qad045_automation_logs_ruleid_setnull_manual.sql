-- QAD-045: automation_logs.rule_id must SURVIVE rule deletion — swap the FK from
-- ON DELETE CASCADE to ON DELETE SET NULL and drop NOT NULL. Hand-written;
-- tracker is out of sync, db:generate refuses (interactive rename prompt), same
-- as 9004/9999.
-- Mirrors lib/db/schema/brain.ts (automationLogs.ruleId → nullable + set null),
-- matching sibling agent_action_log.rule_id which already uses SET NULL
-- (baseline 0000, line 4486).
-- Must be hand-applied to prod + staging before the staging→main merge, same as
-- 9004/9999. Already applied + verified on the dev DB.
-- Safe: relaxing NOT NULL loses no data; every existing row has a non-null
-- rule_id (the column was NOT NULL), so no backfill. Re-runnable: the DROP
-- CONSTRAINT IF EXISTS precedes the ADD.

ALTER TABLE "automation_logs" ALTER COLUMN "rule_id" DROP NOT NULL;
ALTER TABLE "automation_logs" DROP CONSTRAINT IF EXISTS "automation_logs_rule_id_automation_rules_id_fk";
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE set null ON UPDATE no action;
