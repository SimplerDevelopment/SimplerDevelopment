-- Per-user notification preferences. A row absence is treated as `instant`
-- by lib/crm/notifications.ts:shouldDeliverNotification, so deploying this
-- migration is non-breaking — every existing emitter callsite keeps firing
-- exactly as it did before until a user opts down to `digest_daily` or `off`.
--
-- Composite unique index (client_id, user_id, notification_type) backs the
-- PUT upsert in /api/portal/notifications/preferences.
--
-- Companion to feat(notifications): per-user opt-out + digest mode.

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "notification_type" varchar(64) NOT NULL,
  "delivery" varchar(16) DEFAULT 'instant' NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_client_user_type_idx"
  ON "notification_preferences" ("client_id", "user_id", "notification_type");
--> statement-breakpoint
-- crm_notifications.metadata: future digest cron uses metadata->>'digest' to
-- pull rows created under a `digest_daily` preference. Nullable so existing
-- rows stay untouched.
ALTER TABLE "crm_notifications"
  ADD COLUMN IF NOT EXISTS "metadata" json;
