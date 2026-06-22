-- CRM email threads (Phase 1 of [[Spec - CRM Email Sync + Sequences]]).
-- Unified per-contact/per-deal email thread (inbound Gmail + outbound Resend).
-- Mirrors lib/db/schema/crm.ts crmEmailMessages.
--
-- NOTE: hand-written. `drizzle-kit generate` is blocked by the meta-snapshot
-- collision (0004/0070/0072). Apply out-of-band: push on dev, psql on staging/prod.

CREATE TABLE IF NOT EXISTS "crm_email_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "contact_id" integer NOT NULL,
  "deal_id" integer,
  "direction" varchar(10) NOT NULL,
  "provider_message_id" varchar(255),
  "thread_key" varchar(255),
  "from_email" varchar(320),
  "to_email" varchar(320),
  "subject" varchar(500),
  "snippet" text,
  "sent_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "crm_email_messages" ADD CONSTRAINT "crm_email_messages_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "crm_email_messages" ADD CONSTRAINT "crm_email_messages_contact_id_crm_contacts_id_fk"
    FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "crm_email_messages" ADD CONSTRAINT "crm_email_messages_deal_id_crm_deals_id_fk"
    FOREIGN KEY ("deal_id") REFERENCES "crm_deals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "crm_email_messages_client_provider_idx"
  ON "crm_email_messages" ("client_id", "provider_message_id");
CREATE INDEX IF NOT EXISTS "crm_email_messages_contact_idx"
  ON "crm_email_messages" ("contact_id", "sent_at");
