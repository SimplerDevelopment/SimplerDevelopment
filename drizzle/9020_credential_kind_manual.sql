-- QAD-048, second occurrence — the polymorphic `key_id` write path.
--
-- `key_id` holds EITHER a portal_api_keys.id OR an oauth_access_tokens.id: two
-- separate id spaces. Three tables nonetheless declared a FOREIGN KEY to
-- portal_api_keys only, so every OAuth-authenticated MCP caller violated it:
--
--   * mcp_approval_links  — insert failed, so approval links could not be
--                           minted at all. The *_create/*_update MCP tools
--                           returned an error AFTER the entity had already
--                           committed, which reads to the caller as "nothing
--                           was created" while a row exists.
--   * mcp_pending_changes — insert failed, so CMS approval staging was
--                           impossible over OAuth.
--   * mcp_tool_calls      — insert failed too, but logToolCall deliberately
--                           swallows errors ("a telemetry failure must never
--                           break a tool call"), so ALL OAuth tool-call
--                           telemetry was silently dropped rather than
--                           reported. Usage simply read as absent.
--
-- Worse than the hard failure: where an oauth_access_tokens.id happened to
-- collide numerically with a real portal_api_keys.id, the insert SUCCEEDED and
-- attributed the row to an unrelated credential.
--
-- Fix: drop the FK that cannot be correct for a polymorphic column, and record
-- which id space the value came from. Credential identity is now the PAIR
-- (credential_kind, key_id) — see lib/mcp/self-approval.ts.
--
-- Hand-written; the drizzle tracker is out of sync in prod and db:generate
-- refuses non-interactively (same as 9004-9015). Idempotent — ADD COLUMN IF NOT
-- EXISTS / DROP CONSTRAINT IF EXISTS, so re-running is a no-op.
--
-- Mirrors lib/db/schema/approvals.ts + lib/db/schema/tools.ts.
--
-- BACKFILL: existing rows keep credential_kind = NULL deliberately. Under the
-- old FK an OAuth caller could never insert, so every historical row is either a
-- portal API key or a null key_id. Readers therefore treat NULL as
-- 'portal_api_key' (see the approvals leftJoin), and isSelfApproval falls back
-- to id-only matching when either side's kind is NULL so the separation-of-
-- duties control keeps failing CLOSED on legacy rows.

ALTER TABLE "mcp_pending_changes" ADD COLUMN IF NOT EXISTS "credential_kind" varchar(20);
ALTER TABLE "mcp_approval_links"  ADD COLUMN IF NOT EXISTS "credential_kind" varchar(20);
ALTER TABLE "mcp_tool_calls"      ADD COLUMN IF NOT EXISTS "credential_kind" varchar(20);

-- Drop by LOOKUP, not by name. The constraint names diverge by environment:
-- drizzle generates `<table>_<col>_portal_api_keys_id_fk`, but metro (created via
-- an older hand-applied path) carries the Postgres defaults
-- `mcp_approval_links_key_id_fkey` and `mcp_tool_calls_api_key_id_fkey`. A
-- hard-coded DROP CONSTRAINT IF EXISTS would have silently no-oped on two of the
-- three tables in production — the precise failure mode this migration exists to
-- remove. Resolve them from the catalogue instead.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conrelid AS tbl, c.conname
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = 'portal_api_keys'::regclass
       AND c.conrelid IN (
             'mcp_pending_changes'::regclass,
             'mcp_approval_links'::regclass,
             'mcp_tool_calls'::regclass
           )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl::regclass, r.conname);
    RAISE NOTICE 'QAD-048: dropped FK % on %', r.conname, r.tbl::regclass;
  END LOOP;
END $$;

-- Self-verification. A DROP CONSTRAINT IF EXISTS against a name that never
-- matched is a silent no-op — exactly the "control that looks applied and
-- isn't" this migration exists to remove. Assert on the effect instead.
DO $$
DECLARE
  remaining text;
BEGIN
  SELECT string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ')
    INTO remaining
    FROM pg_constraint c
   WHERE c.contype = 'f'
     AND c.confrelid = 'portal_api_keys'::regclass
     AND c.conrelid IN (
           'mcp_pending_changes'::regclass,
           'mcp_approval_links'::regclass,
           'mcp_tool_calls'::regclass
         );

  IF remaining IS NOT NULL THEN
    RAISE EXCEPTION
      'QAD-048 migration incomplete: FK(s) to portal_api_keys still present on the polymorphic key_id column(s): %',
      remaining;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'mcp_approval_links' AND column_name = 'credential_kind'
  ) THEN
    RAISE EXCEPTION 'QAD-048 migration incomplete: mcp_approval_links.credential_kind was not created';
  END IF;
END $$;
