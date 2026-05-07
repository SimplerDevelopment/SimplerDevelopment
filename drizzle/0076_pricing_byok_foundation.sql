-- Foundation for the pricing-tier + BYOK pivot. Two tables, both keyed by
-- client_id, both safe to apply against an existing populated database.
--
-- HAND-APPLY ONLY — the drizzle migration tracker is drifted (per
-- .claude/MEMORY.md), so `bun run db:migrate` will refuse this. Apply with
-- `psql $DATABASE_URL -f drizzle/0076_pricing_byok_foundation.sql`.
--
-- 1) client_api_keys     BYOK — Anthropic / OpenAI / etc. encrypted at rest
--                        with AES-256-GCM via lib/crypto/api-key.ts. The
--                        encrypted_key column stores the base64 envelope, NOT
--                        the raw provider key.
--
-- 2) usage_meter_events  Event-shaped sibling to the existing aggregated
--                        `usage_meters` table. Append-only observations from
--                        external sources (Resend, Vercel, Railway) bucketed
--                        by YYYY-MM. We deliberately did NOT touch
--                        `usage_meters` — the tier pivot's metering model is
--                        fundamentally event-shaped (source provenance +
--                        recordedAt), and lib/usage-metering.ts still relies
--                        on the aggregate table for overage billing logic.

CREATE TABLE IF NOT EXISTS "client_api_keys" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "provider" varchar(32) NOT NULL,
  "encrypted_key" text NOT NULL,
  "label" varchar(100),
  "last_used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_api_keys"
    ADD CONSTRAINT "client_api_keys_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_api_keys_client_id_idx"
  ON "client_api_keys" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_api_keys_provider_idx"
  ON "client_api_keys" ("client_id", "provider");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "usage_meter_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "resource" varchar(50) NOT NULL,
  "period" varchar(7) NOT NULL,
  "amount" numeric(18, 4) DEFAULT '0' NOT NULL,
  "source" varchar(32) NOT NULL,
  "recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "usage_meter_events"
    ADD CONSTRAINT "usage_meter_events_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_meter_events_client_period_resource_idx"
  ON "usage_meter_events" ("client_id", "period", "resource");
