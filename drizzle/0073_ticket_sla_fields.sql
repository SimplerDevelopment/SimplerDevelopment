-- Support-ticket SLA fields. Adds three nullable timestamp columns so a ticket
-- can carry its own SLA target (computed on create from priority via
-- lib/tickets/sla.ts) and a stamp for when staff first responded — used by
-- the detail/index UI to render countdown / overdue badges.
--
-- Companion to feat(tickets): SLA timers + assignment + status workflow.
-- The `assignedTo` column already exists, so this migration is SLA-only.

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "first_response_due_at" timestamp,
  ADD COLUMN IF NOT EXISTS "first_response_at" timestamp,
  ADD COLUMN IF NOT EXISTS "resolution_due_at" timestamp;
