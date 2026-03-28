-- Automation Rules
CREATE TABLE IF NOT EXISTS "automation_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "trigger" json NOT NULL,
  "conditions" json DEFAULT '[]',
  "actions" json NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "source" varchar(20) DEFAULT 'nlp' NOT NULL,
  "product_scope" varchar(50),
  "execution_count" integer DEFAULT 0 NOT NULL,
  "last_executed_at" timestamp,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Automation Execution Logs
CREATE TABLE IF NOT EXISTS "automation_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "rule_id" integer NOT NULL REFERENCES "automation_rules"("id") ON DELETE CASCADE,
  "trigger_event" varchar(100) NOT NULL,
  "trigger_payload" json,
  "actions_executed" json DEFAULT '[]',
  "status" varchar(20) DEFAULT 'success' NOT NULL,
  "duration" integer,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Index for fast rule lookup by client + enabled
CREATE INDEX IF NOT EXISTS "automation_rules_client_enabled_idx" ON "automation_rules" ("client_id", "enabled");

-- Index for fast log lookup by rule
CREATE INDEX IF NOT EXISTS "automation_logs_rule_idx" ON "automation_logs" ("rule_id");

-- Index for log lookup by client + time
CREATE INDEX IF NOT EXISTS "automation_logs_client_time_idx" ON "automation_logs" ("client_id", "created_at");
