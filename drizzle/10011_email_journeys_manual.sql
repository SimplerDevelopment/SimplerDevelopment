-- Migration: email_journeys Phase 1
-- Branching drip-journey tables mirroring the CRM-sequence enrollment/advance model.
-- Written by hand; do NOT edit after applying.

-- ── email_journeys ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_journeys (
  id             SERIAL PRIMARY KEY,
  client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  description    TEXT,
  status         VARCHAR(20)  NOT NULL DEFAULT 'draft',   -- draft | active | paused | archived
  trigger_type   VARCHAR(30)  NOT NULL DEFAULT 'manual',  -- event | manual | list_join
  trigger_config JSONB,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_journeys_client_idx
  ON email_journeys (client_id);

CREATE INDEX IF NOT EXISTS email_journeys_client_status_idx
  ON email_journeys (client_id, status);

-- ── email_journey_steps ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_journey_steps (
  id          SERIAL PRIMARY KEY,
  journey_id  INTEGER NOT NULL REFERENCES email_journeys(id) ON DELETE CASCADE,
  step_order  INTEGER NOT NULL,            -- 0-based
  step_type   VARCHAR(20) NOT NULL,        -- email | wait | condition | tag | exit
  config      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_journey_steps_journey_order_idx
  ON email_journey_steps (journey_id, step_order);

-- ── email_journey_enrollments ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_journey_enrollments (
  id                   SERIAL PRIMARY KEY,
  journey_id           INTEGER NOT NULL REFERENCES email_journeys(id) ON DELETE CASCADE,
  subscriber_id        INTEGER NOT NULL REFERENCES email_subscribers(id) ON DELETE CASCADE,
  client_id            INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status               VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active | completed | exited | error
  current_step_order   INTEGER      NOT NULL DEFAULT 0,
  next_run_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  enrolled_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ
);

-- Re-enrollment not allowed: one row per (journey, subscriber).
CREATE UNIQUE INDEX IF NOT EXISTS email_journey_enrollments_journey_subscriber_uniq_idx
  ON email_journey_enrollments (journey_id, subscriber_id);

-- Fast cron query: status='active' AND next_run_at <= NOW()
CREATE INDEX IF NOT EXISTS email_journey_enrollments_status_next_run_idx
  ON email_journey_enrollments (status, next_run_at);

CREATE INDEX IF NOT EXISTS email_journey_enrollments_client_idx
  ON email_journey_enrollments (client_id);

-- ── email_journey_step_sends ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_journey_step_sends (
  id              SERIAL PRIMARY KEY,
  enrollment_id   INTEGER NOT NULL REFERENCES email_journey_enrollments(id) ON DELETE CASCADE,
  step_id         INTEGER NOT NULL REFERENCES email_journey_steps(id) ON DELETE CASCADE,
  subscriber_id   INTEGER NOT NULL REFERENCES email_subscribers(id) ON DELETE CASCADE,
  resend_email_id VARCHAR(255),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ
);

-- Idempotency guard: one send record per (enrollment, step).
CREATE UNIQUE INDEX IF NOT EXISTS email_journey_step_sends_enrollment_step_uniq_idx
  ON email_journey_step_sends (enrollment_id, step_id);

CREATE INDEX IF NOT EXISTS email_journey_step_sends_enrollment_idx
  ON email_journey_step_sends (enrollment_id);

CREATE INDEX IF NOT EXISTS email_journey_step_sends_subscriber_idx
  ON email_journey_step_sends (subscriber_id);
