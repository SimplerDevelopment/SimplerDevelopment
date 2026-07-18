-- CRM79-013 fix: crm_deal_comments.parent_comment_id — hand-written; tracker is out of sync, db:generate refuses.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, no drops, nullable (NULL = root comment), no default needed.
-- Must be hand-applied to prod + staging before the staging→main merge, same as 9004/9999.
-- Mirrors lib/db/schema/crm.ts (crmDealComments.parentCommentId), added in commit 6eccc72d5 ("threaded
-- deal comments") but never migrated — so GET/POST /api/portal/crm/deals/:id/comments 500'd with
-- 'column "parent_comment_id" does not exist'. Already applied to the dev DB and verified.
--
-- Adds:
--   1. crm_deal_comments.parent_comment_id — nullable self-reference for one-level reply threading.
--      No FK constraint (matches kanban_cards.parent_card_id convention); integrity enforced in the route.

ALTER TABLE "crm_deal_comments" ADD COLUMN IF NOT EXISTS "parent_comment_id" integer;
