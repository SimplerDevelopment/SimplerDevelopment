-- Phase 5: project webhooks

CREATE TABLE IF NOT EXISTS "project_webhooks" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "url" varchar(500) NOT NULL,
  "secret" varchar(64) NOT NULL,
  "events" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "active" boolean DEFAULT true NOT NULL,
  "last_fired_at" timestamp,
  "last_status" integer,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_project_webhooks_project" ON "project_webhooks" ("project_id", "active");

CREATE TABLE IF NOT EXISTS "project_webhook_deliveries" (
  "id" serial PRIMARY KEY NOT NULL,
  "webhook_id" integer NOT NULL REFERENCES "project_webhooks"("id") ON DELETE CASCADE,
  "event" varchar(50) NOT NULL,
  "status" integer,
  "error" text,
  "payload" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_project_webhook_deliveries_webhook"
  ON "project_webhook_deliveries" ("webhook_id", "created_at" DESC);
