-- Web chat widget — idempotent. Tracker is drifted in prod; do NOT run via
-- `bun run db:migrate`. Apply by hand on each environment.

CREATE TABLE IF NOT EXISTS "chat_widgets" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "site_id" integer NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "greeting_message" text,
  "position" varchar(32) DEFAULT 'bottom-right' NOT NULL,
  "primary_color" varchar(7) DEFAULT '#0070f3' NOT NULL,
  "away_message" text,
  "brain_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "chat_conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "widget_id" integer NOT NULL,
  "client_id" integer NOT NULL,
  "visitor_id" varchar(64) NOT NULL,
  "visitor_name" varchar(255),
  "visitor_email" varchar(255),
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "assigned_user_id" integer,
  "last_message_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "closed_at" timestamp
);

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversation_id" integer NOT NULL,
  "client_id" integer NOT NULL,
  "author_kind" varchar(20) NOT NULL,
  "author_user_id" integer,
  "author_name" varchar(255),
  "body" text NOT NULL,
  "attachments" json DEFAULT '[]'::json NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "chat_widgets" ADD CONSTRAINT "chat_widgets_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_widgets" ADD CONSTRAINT "chat_widgets_site_id_client_websites_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "client_websites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_widget_id_chat_widgets_id_fk"
    FOREIGN KEY ("widget_id") REFERENCES "chat_widgets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_assigned_user_id_users_id_fk"
    FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk"
    FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_user_id_users_id_fk"
    FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "chat_widgets_site_idx" ON "chat_widgets" ("site_id");
CREATE INDEX IF NOT EXISTS "chat_conversations_inbox_idx" ON "chat_conversations" ("client_id", "status", "last_message_at");
CREATE INDEX IF NOT EXISTS "chat_conversations_widget_visitor_idx" ON "chat_conversations" ("widget_id", "visitor_id");
CREATE INDEX IF NOT EXISTS "chat_messages_conv_occurred_idx" ON "chat_messages" ("conversation_id", "occurred_at");
