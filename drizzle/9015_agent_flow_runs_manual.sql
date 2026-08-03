-- Workflow Designer executions (agent flow runs + append-only event log).
--
-- Idempotent and re-runnable: every statement is guarded, so applying this to a
-- database that already has it is a no-op. Additive only (CREATE TYPE / CREATE
-- TABLE / CREATE INDEX), so the "Prod schema sync (additive)" workflow can
-- apply it on merge to main without a hand-run.

-- Run lifecycle. 'waiting' is distinct from 'running' because a flow parked on
-- a human node is the one state that needs surfacing to a person; 'abandoned'
-- is distinct from 'failed' because a runner whose session closed did not fail,
-- it stopped reporting.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_flow_run_status') THEN
    CREATE TYPE agent_flow_run_status AS ENUM ('running', 'waiting', 'succeeded', 'failed', 'abandoned');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS agent_flow_runs (
  id              serial PRIMARY KEY,
  flow_id         integer NOT NULL REFERENCES agent_flows(id) ON DELETE CASCADE,
  project_id      integer NOT NULL REFERENCES projects(id)    ON DELETE CASCADE,
  client_id       integer NOT NULL REFERENCES clients(id)     ON DELETE CASCADE,
  status          agent_flow_run_status NOT NULL DEFAULT 'running',
  -- The graph as it was at launch. Flows stay editable and runs only advance
  -- while their session lives, so reading a stalled run later is normal — this
  -- keeps node ids in the event log resolvable.
  graph           jsonb NOT NULL,
  -- Sub-flow handoff. depth is denormalized so the start guard can reject a
  -- too-deep chain without walking every ancestor.
  parent_run_id   integer REFERENCES agent_flow_runs(id) ON DELETE CASCADE,
  parent_node_id  varchar(64),
  depth           integer NOT NULL DEFAULT 0,
  -- Rollups so the executions list never aggregates the event log.
  input_tokens    integer NOT NULL DEFAULT 0,
  output_tokens   integer NOT NULL DEFAULT 0,
  started_by      integer REFERENCES users(id) ON DELETE SET NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  -- Bumped by every event, so a stalled run is detectable by staleness.
  last_event_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_flow_runs_flow_idx    ON agent_flow_runs (flow_id);
CREATE INDEX IF NOT EXISTS agent_flow_runs_project_idx ON agent_flow_runs (project_id, started_at);
CREATE INDEX IF NOT EXISTS agent_flow_runs_client_idx  ON agent_flow_runs (client_id);
CREATE INDEX IF NOT EXISTS agent_flow_runs_parent_idx  ON agent_flow_runs (parent_run_id);

-- Append-only log. Source of truth for the live stream: the SSE route replays
-- rows newer than a Last-Event-ID then tails NOTIFY, so ids must be monotonic.
-- There is deliberately no per-node state table — the client folds this log.
CREATE TABLE IF NOT EXISTS agent_flow_run_events (
  id             serial PRIMARY KEY,
  run_id         integer NOT NULL REFERENCES agent_flow_runs(id) ON DELETE CASCADE,
  type           varchar(32) NOT NULL,
  node_id        varchar(64),
  status         varchar(16),
  -- Capped at the write path (2KB) — pushed to every connected viewer.
  summary        text,
  -- model is stored even though the graph declares one: a run that used a
  -- different tier than the node asked for is a real discrepancy.
  model          varchar(32),
  input_tokens   integer,
  output_tokens  integer,
  duration_ms    integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- The stream's hot path: everything for one run newer than an id.
CREATE INDEX IF NOT EXISTS agent_flow_run_events_run_idx ON agent_flow_run_events (run_id, id);
