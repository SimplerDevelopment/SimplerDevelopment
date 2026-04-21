-- MCP approval workflow: pending-changes staging area + per-key toggle.
-- When portal_api_keys.require_cms_approval is true, CMS write tools
-- stage a row here instead of applying directly. Staff approve via
-- approvals_* tools (or portal UI), which re-runs the mutation.

ALTER TABLE "portal_api_keys"
  ADD COLUMN IF NOT EXISTS "require_cms_approval" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "mcp_pending_changes" (
  "id" SERIAL PRIMARY KEY,
  "client_id" INTEGER NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "key_id" INTEGER REFERENCES "portal_api_keys"("id") ON DELETE SET NULL,
  "entity_type" VARCHAR(50) NOT NULL,
  "entity_id" INTEGER,
  "operation" VARCHAR(20) NOT NULL,
  "summary" VARCHAR(500),
  "payload" JSON NOT NULL,
  "original_snapshot" JSON,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "reviewer_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" TIMESTAMP,
  "review_note" TEXT,
  "applied_at" TIMESTAMP,
  "error_message" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "mcp_pending_changes_client_status_idx"
  ON "mcp_pending_changes" ("client_id", "status");

CREATE INDEX IF NOT EXISTS "mcp_pending_changes_entity_idx"
  ON "mcp_pending_changes" ("entity_type", "entity_id");

COMMENT ON COLUMN "portal_api_keys"."require_cms_approval" IS
  'When true, CMS-write MCP tools using this key stage to mcp_pending_changes instead of applying directly. Recommended true for keys used by autonomous AI agents.';
