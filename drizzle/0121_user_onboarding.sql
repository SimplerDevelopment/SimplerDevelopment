-- ─── user_onboarding: per-user wizard state ──────────────────────────────────
-- Backs the /portal/onboarding flow. completedAt = NULL means the dashboard
-- redirects the user into the wizard. `answers` stores the raw wizard inputs
-- so the user can resume mid-flow; structured outputs are persisted into
-- branding_profiles / branding_messaging / clients in lockstep.

CREATE TABLE IF NOT EXISTS "user_onboarding" (
  "user_id" integer PRIMARY KEY NOT NULL,
  "client_id" integer,
  "step" varchar(50) DEFAULT 'welcome' NOT NULL,
  "answers" json DEFAULT '{}'::json NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_onboarding_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "user_onboarding"
      ADD CONSTRAINT "user_onboarding_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_onboarding_client_id_clients_id_fk'
  ) THEN
    ALTER TABLE "user_onboarding"
      ADD CONSTRAINT "user_onboarding_client_id_clients_id_fk"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade;
  END IF;
END $$;
