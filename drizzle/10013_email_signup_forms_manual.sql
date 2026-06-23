-- Embeddable public email signup forms. Mirrors lib/db/schema/email.ts
-- emailSignupForms. Hand-written (db:generate blocked by the meta collision).
CREATE TABLE IF NOT EXISTS "email_signup_forms" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer,
  "list_id" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "embed_key" varchar(64) NOT NULL,
  "ask_name" boolean DEFAULT false NOT NULL,
  "redirect_url" varchar(500),
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "email_signup_forms" ADD CONSTRAINT "email_signup_forms_client_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "email_signup_forms" ADD CONSTRAINT "email_signup_forms_list_id_fk"
    FOREIGN KEY ("list_id") REFERENCES "email_lists"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "email_signup_forms_embed_key_uniq" ON "email_signup_forms" ("embed_key");
CREATE INDEX IF NOT EXISTS "email_signup_forms_client_idx" ON "email_signup_forms" ("client_id");
CREATE INDEX IF NOT EXISTS "email_signup_forms_list_idx" ON "email_signup_forms" ("list_id");
