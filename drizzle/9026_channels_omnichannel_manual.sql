-- Omnichannel foundation: unified conversation model + Channel Gateway tables.
--
-- Adds 5 new tables (channel_connections, contact_identities, suggested_merges,
-- channel_consent, channel_outbox) and extends chat_conversations / chat_messages
-- from web-chat-only into the omnichannel conversation core (channel, provider,
-- connection, contact, external ids, direction, message type, status).
--
-- Why this exists: lib/channels/ (ChannelGateway, policy engine, webchat
-- adapter) and the extended lib/db/schema/chat.ts + new lib/db/schema/channels.ts
-- (commit dec3970) describe tables/columns that no drizzle/*.sql creates. Any
-- code path reading them 500s until this is applied — the same failure mode as
-- the 2026-07-11 outage (code reads a column metro lacks). Apply to metro by
-- hand before merging, per CLAUDE.md release rule; Vercel deploys do NOT run
-- migrations.
--
-- Additive and idempotent: every statement is IF NOT EXISTS / guarded, so the
-- file is safe to run before or after the deploy, in either order, and safe to
-- re-run. The chat_* ALTERs only ADD columns and DROP NOT NULL constraints —
-- never drop or rename — so existing WebChat rows are untouched.
--
-- Written by hand rather than generated because `drizzle-kit generate` needs
-- DATABASE_URL and an interactive TTY, which are not available here. This
-- matches how 9016-9026 shipped. The matching schema edits are in
-- lib/db/schema/channels.ts + lib/db/schema/chat.ts (commit dec3970).
--
-- Notes:
-- - encrypted_credentials is a plain `text` column: encryption is app-layer
--   (lib/db/schema/columns.ts `encryptedText`, AES-256-GCM). Never WHERE on it.
-- - UNIQUE (connection_id, external_message_id) permits multiple NULL rows per
--   Postgres semantics — same as drizzle `uniqueIndex` would emit. Inbound rows
--   without a provider id skip dedup; rows WITH an id dedup correctly.

-- ─── 1. New tables ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "channel_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "provider" varchar(20) NOT NULL,
  "external_account_id" varchar(255),
  "display_name" varchar(255),
  "status" varchar(20) DEFAULT 'incomplete' NOT NULL,
  "encrypted_credentials" text,
  "metadata" json DEFAULT '{}'::json NOT NULL,
  "last_webhook_at" timestamptz,
  "last_inbound_at" timestamptz,
  "last_outbound_at" timestamptz,
  "last_error_at" timestamptz,
  "last_error_code" varchar(100),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_identities" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "contact_id" integer NOT NULL,
  "kind" varchar(20) NOT NULL,
  "value" varchar(320) NOT NULL,
  "verified" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suggested_merges" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "contact_a_id" integer NOT NULL,
  "contact_b_id" integer NOT NULL,
  "evidence" text,
  "status" varchar(20) DEFAULT 'suggested' NOT NULL,
  "created_by" integer,
  "resolved_by" integer,
  "resolved_at" timestamptz,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_consent" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "contact_id" integer,
  "channel" varchar(20) NOT NULL,
  "kind" varchar(20) NOT NULL,
  "identity_value" varchar(320) NOT NULL,
  "status" varchar(10) NOT NULL,
  "source" varchar(50) DEFAULT 'manual' NOT NULL,
  "policy_version" varchar(40),
  "recorded_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_outbox" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "connection_id" integer NOT NULL,
  "conversation_id" integer,
  "contact_id" integer,
  "channel" varchar(20) NOT NULL,
  "provider" varchar(40) NOT NULL,
  "external_message_id" varchar(255),
  "recipient_identity" json NOT NULL,
  "sender_identity" json,
  "message_type" varchar(20) DEFAULT 'text' NOT NULL,
  "body" text,
  "media" json,
  "status" varchar(20) DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 6 NOT NULL,
  "next_attempt_at" timestamptz DEFAULT now() NOT NULL,
  "last_error" text,
  "last_error_code" varchar(100),
  "sent_at" timestamptz,
  "delivered_at" timestamptz,
  "read_at" timestamptz,
  "failed_at" timestamptz,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── 2. Extend chat_conversations into the omnichannel core ──────────────────

ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "channel" varchar(20) DEFAULT 'webchat' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "provider" varchar(40) DEFAULT 'webchat' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "connection_id" integer;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "contact_id" integer;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "external_conversation_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "ai_mode" varchar(20) DEFAULT 'human' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "priority" varchar(20) DEFAULT 'medium' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "deal_id" integer;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "labels" json DEFAULT '[]'::json NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "unread_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "last_inbound_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "last_outbound_at" timestamptz;
--> statement-breakpoint
-- WebChat rows keep widget_id/visitor_id set; other channels leave them null.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'chat_conversations'
       AND column_name = 'widget_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "chat_conversations" ALTER COLUMN "widget_id" DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'chat_conversations'
       AND column_name = 'visitor_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "chat_conversations" ALTER COLUMN "visitor_id" DROP NOT NULL;
  END IF;
END$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_conversations_channel_idx" ON "chat_conversations" USING btree ("client_id","channel","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_conversations_external_idx" ON "chat_conversations" USING btree ("connection_id","external_conversation_id");
--> statement-breakpoint

-- ─── 3. Extend chat_messages into the omnichannel core ───────────────────────

ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "channel" varchar(20) DEFAULT 'webchat' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "provider" varchar(40) DEFAULT 'webchat' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "connection_id" integer;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "direction" varchar(10) DEFAULT 'inbound' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "external_message_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "reply_to_external_message_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "sender_identity" json;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "recipient_identity" json;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "message_type" varchar(20) DEFAULT 'text' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "media" json;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'sent' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "metadata" json DEFAULT '{}'::json NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "sent_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "received_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "read_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "failed_at" timestamptz;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_connection_external_idx" ON "chat_messages" USING btree ("connection_id","external_message_id");
--> statement-breakpoint

-- ─── 4. Indexes + FKs for the new tables (guarded: no IF NOT EXISTS for constraints) ──

CREATE UNIQUE INDEX IF NOT EXISTS "channel_connections_client_provider_account_idx" ON "channel_connections" USING btree ("client_id","provider","external_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_connections_client_provider_idx" ON "channel_connections" USING btree ("client_id","provider");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contact_identities_client_kind_value_idx" ON "contact_identities" USING btree ("client_id","kind","value");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_identities_contact_idx" ON "contact_identities" USING btree ("contact_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "suggested_merges_pair_idx" ON "suggested_merges" USING btree ("client_id","contact_a_id","contact_b_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_consent_contact_channel_idx" ON "channel_consent" USING btree ("contact_id","channel");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_consent_identity_idx" ON "channel_consent" USING btree ("client_id","channel","kind","identity_value");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_outbox_connection_external_idx" ON "channel_outbox" USING btree ("connection_id","external_message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_outbox_due_idx" ON "channel_outbox" USING btree ("client_id","status","next_attempt_at");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'channel_connections' AND constraint_name = 'channel_connections_client_id_clients_id_fk') THEN
    ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'contact_identities' AND constraint_name = 'contact_identities_client_id_clients_id_fk') THEN
    ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'contact_identities' AND constraint_name = 'contact_identities_contact_id_crm_contacts_id_fk') THEN
    ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'suggested_merges' AND constraint_name = 'suggested_merges_client_id_clients_id_fk') THEN
    ALTER TABLE "suggested_merges" ADD CONSTRAINT "suggested_merges_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'suggested_merges' AND constraint_name = 'suggested_merges_contact_a_id_crm_contacts_id_fk') THEN
    ALTER TABLE "suggested_merges" ADD CONSTRAINT "suggested_merges_contact_a_id_crm_contacts_id_fk" FOREIGN KEY ("contact_a_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'suggested_merges' AND constraint_name = 'suggested_merges_contact_b_id_crm_contacts_id_fk') THEN
    ALTER TABLE "suggested_merges" ADD CONSTRAINT "suggested_merges_contact_b_id_crm_contacts_id_fk" FOREIGN KEY ("contact_b_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'suggested_merges' AND constraint_name = 'suggested_merges_created_by_users_id_fk') THEN
    ALTER TABLE "suggested_merges" ADD CONSTRAINT "suggested_merges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'suggested_merges' AND constraint_name = 'suggested_merges_resolved_by_users_id_fk') THEN
    ALTER TABLE "suggested_merges" ADD CONSTRAINT "suggested_merges_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'channel_consent' AND constraint_name = 'channel_consent_client_id_clients_id_fk') THEN
    ALTER TABLE "channel_consent" ADD CONSTRAINT "channel_consent_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'channel_consent' AND constraint_name = 'channel_consent_contact_id_crm_contacts_id_fk') THEN
    ALTER TABLE "channel_consent" ADD CONSTRAINT "channel_consent_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'channel_outbox' AND constraint_name = 'channel_outbox_client_id_clients_id_fk') THEN
    ALTER TABLE "channel_outbox" ADD CONSTRAINT "channel_outbox_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'channel_outbox' AND constraint_name = 'channel_outbox_connection_id_channel_connections_id_fk') THEN
    ALTER TABLE "channel_outbox" ADD CONSTRAINT "channel_outbox_connection_id_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'channel_outbox' AND constraint_name = 'channel_outbox_contact_id_crm_contacts_id_fk') THEN
    ALTER TABLE "channel_outbox" ADD CONSTRAINT "channel_outbox_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND constraint_name = 'chat_conversations_contact_id_crm_contacts_id_fk') THEN
    ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END$$;
--> statement-breakpoint

-- ─── 5. Verify ───────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'channel_connections') THEN
    RAISE EXCEPTION 'channel_connections was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_identities') THEN
    RAISE EXCEPTION 'contact_identities was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'suggested_merges') THEN
    RAISE EXCEPTION 'suggested_merges was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'channel_consent') THEN
    RAISE EXCEPTION 'channel_consent was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'channel_outbox') THEN
    RAISE EXCEPTION 'channel_outbox was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'external_conversation_id') THEN
    RAISE EXCEPTION 'chat_conversations.external_conversation_id was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'external_message_id') THEN
    RAISE EXCEPTION 'chat_messages.external_message_id was not created';
  END IF;
  RAISE NOTICE 'omnichannel migration present';
END$$;
