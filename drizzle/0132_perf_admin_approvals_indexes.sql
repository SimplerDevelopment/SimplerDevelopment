-- 0132_perf_admin_approvals_indexes.sql
-- E2 (admin + approvals) perf indexes. Covers the indexes declared via the
-- schema third-arg callbacks in this branch (lib/db/schema/*.ts) plus three
-- partial indexes Drizzle cannot express directly:
--   * automation_logs (status) WHERE status='failed'
--   * notifications (user_id)   WHERE read_at IS NULL
--   * suggested_projects (client_id, "order") WHERE active=true
--
-- IMPORTANT: drizzle-kit migrations are NOT run automatically in production
-- (the tracker is drifted vs. disk). Hand-apply this file against the metro
-- Railway DB BEFORE merging staging->main, or the new index declarations
-- will be authoritative-but-unenforced and the admin/clients + dashboard +
-- approvals queues will keep falling back to sequential scans on rows that
-- already hit O(N) correlated-subquery aggregation.
--
-- All statements use CREATE INDEX IF NOT EXISTS so the file is idempotent
-- and can be re-run safely.

-- ─── approvals (mcp_pending_changes) ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS "mcp_pending_changes_client_status_created_idx"
  ON "mcp_pending_changes" ("client_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "mcp_pending_changes_status_idx"
  ON "mcp_pending_changes" ("status");

-- ─── brain_ai_review_items ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "brain_ai_review_items_client_status_created_idx"
  ON "brain_ai_review_items" ("client_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "brain_ai_review_items_status_idx"
  ON "brain_ai_review_items" ("status");

-- ─── service_requests + client_services ───────────────────────────────────
CREATE INDEX IF NOT EXISTS "service_requests_client_status_created_idx"
  ON "service_requests" ("client_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "service_requests_client_status_idx"
  ON "service_requests" ("client_id", "status");
CREATE INDEX IF NOT EXISTS "client_services_client_status_created_idx"
  ON "client_services" ("client_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "client_services_client_status_idx"
  ON "client_services" ("client_id", "status");

-- ─── suggested_project_requests ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "suggested_project_requests_client_status_created_idx"
  ON "suggested_project_requests" ("client_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "suggested_project_requests_client_status_idx"
  ON "suggested_project_requests" ("client_id", "status");

-- ─── invoices ────────────────────────────────────────────────────────────
-- (projects (clientId, status, …) is covered by 0129; skipped here.)
CREATE INDEX IF NOT EXISTS "invoices_client_status_created_idx"
  ON "invoices" ("client_id", "status", "created_at");

-- ─── support_tickets ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "support_tickets_client_status_updated_idx"
  ON "support_tickets" ("client_id", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "support_tickets_updated_idx"
  ON "support_tickets" ("updated_at");

-- ─── bookings + booking_pages ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "bookings_client_idx" ON "bookings" ("client_id");
CREATE INDEX IF NOT EXISTS "bookings_booking_page_idx"
  ON "bookings" ("booking_page_id");
CREATE INDEX IF NOT EXISTS "bookings_start_status_idx"
  ON "bookings" ("start_time", "status");
CREATE INDEX IF NOT EXISTS "booking_pages_client_idx"
  ON "booking_pages" ("client_id");

-- ─── media ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "media_client_created_idx"
  ON "media" ("client_id", "created_at");

-- ─── surveys ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "surveys_client_updated_idx"
  ON "surveys" ("client_id", "updated_at");

-- ─── client_websites ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "client_websites_created_idx"
  ON "client_websites" ("created_at");
CREATE INDEX IF NOT EXISTS "client_websites_client_idx"
  ON "client_websites" ("client_id");

-- ─── automations ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "automation_rules_client_idx"
  ON "automation_rules" ("client_id");
-- Partial index — Drizzle cannot declare partial indexes via the third-arg
-- callback, so this one is SQL-only. The admin/automations page reads
-- `count(*) … WHERE status='failed'` on every request; the partial form
-- keeps the index tiny since failed rows are a small minority of automation_logs.
CREATE INDEX IF NOT EXISTS "automation_logs_failed_partial_idx"
  ON "automation_logs" ("created_at") WHERE "status" = 'failed';

-- ─── notifications (partial — unread inbox count) ─────────────────────────
-- Drizzle declares a non-partial (user_id, read_at) index; this partial form
-- collapses the unread-count query (the highest-frequency notification query
-- in the portal) to a sub-millisecond index scan.
CREATE INDEX IF NOT EXISTS "notifications_user_unread_partial_idx"
  ON "notifications" ("user_id") WHERE "read_at" IS NULL;

-- ─── suggested_projects (partial — active picker) ─────────────────────────
-- The picker UI lists active suggested projects ordered by display order.
-- Partial keeps the index tight when inactive rows accumulate.
CREATE INDEX IF NOT EXISTS "suggested_projects_active_client_order_partial_idx"
  ON "suggested_projects" ("client_id", "order") WHERE "active" = true;
