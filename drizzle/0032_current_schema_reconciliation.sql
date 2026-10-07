CREATE TABLE "email_campaign_delivery_intents" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"subscriber_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"first_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "magamommy_briefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"week_of" date NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_model_response" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "magamommy_concepts" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"brief_id" integer NOT NULL,
	"topic_slug" varchar(120) NOT NULL,
	"slogan" varchar(120) NOT NULL,
	"tagline" text NOT NULL,
	"visual_prompt" text NOT NULL,
	"palette" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"placement" varchar(20) DEFAULT 'front' NOT NULL,
	"style" varchar(20) DEFAULT 'bold' NOT NULL,
	"alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "magamommy_drops" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"week_of" date NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"brief_id" integer,
	"concept_id" integer,
	"design_id" uuid,
	"product_id" integer,
	"error" text,
	"error_stage" varchar(30),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "philaprints_design_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"category" varchar(100),
	"name" varchar(255) NOT NULL,
	"icon_name" varchar(100),
	"icon_pack" varchar(20),
	"image_url" varchar(500),
	"tags" json DEFAULT '[]'::json,
	"order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "postcaptain_briefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"run_id" integer NOT NULL,
	"topic" varchar(255) NOT NULL,
	"focus" text,
	"body" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);

--> statement-breakpoint
CREATE TABLE "postcaptain_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"run_id" integer NOT NULL,
	"brief_id" integer,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "private_media_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"client_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "store_checkout_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"website_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"state" varchar(20) DEFAULT 'reserved' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"items" json NOT NULL,
	"gift_certificate_id" integer,
	"gift_certificate_amount" integer DEFAULT 0 NOT NULL,
	"discount_code" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "store_payment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"website_id" integer NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "workflow_run_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"node_id" text NOT NULL,
	"action" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp,
	"idempotency_key" text,
	"input" json,
	"result" json,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_last_used_step" bigint;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_amount" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "dispatch_plan" jsonb;
--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "idempotency_key" varchar(255);
--> statement-breakpoint
ALTER TABLE "email_campaign_delivery_intents" ADD CONSTRAINT "email_campaign_delivery_intents_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_campaign_delivery_intents" ADD CONSTRAINT "email_campaign_delivery_intents_subscriber_id_email_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."email_subscribers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_media_keys" ADD CONSTRAINT "private_media_keys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "store_checkout_reservations" ADD CONSTRAINT "store_checkout_reservations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "store_checkout_reservations" ADD CONSTRAINT "store_checkout_reservations_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "store_checkout_reservations" ADD CONSTRAINT "store_checkout_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "store_checkout_reservations" ADD CONSTRAINT "store_checkout_reservations_gift_certificate_id_gift_certificates_id_fk" FOREIGN KEY ("gift_certificate_id") REFERENCES "public"."gift_certificates"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "store_payment_events" ADD CONSTRAINT "store_payment_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "store_payment_events" ADD CONSTRAINT "store_payment_events_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "email_delivery_campaign_subscriber_idx" ON "email_campaign_delivery_intents" USING btree ("campaign_id","subscriber_id");
--> statement-breakpoint
CREATE INDEX "magamommy_briefs_website_idx" ON "magamommy_briefs" USING btree ("website_id");
--> statement-breakpoint
CREATE INDEX "magamommy_briefs_week_idx" ON "magamommy_briefs" USING btree ("week_of");
--> statement-breakpoint
CREATE INDEX "magamommy_concepts_brief_idx" ON "magamommy_concepts" USING btree ("brief_id");
--> statement-breakpoint
CREATE INDEX "magamommy_concepts_website_idx" ON "magamommy_concepts" USING btree ("website_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "magamommy_drops_site_week_uidx" ON "magamommy_drops" USING btree ("website_id","week_of");
--> statement-breakpoint
CREATE INDEX "magamommy_drops_status_idx" ON "magamommy_drops" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "postcaptain_briefs_client_idx" ON "postcaptain_briefs" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "postcaptain_briefs_run_idx" ON "postcaptain_briefs" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX "postcaptain_drafts_client_idx" ON "postcaptain_drafts" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "postcaptain_drafts_run_idx" ON "postcaptain_drafts" USING btree ("run_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "store_checkout_reservations_order_idx" ON "store_checkout_reservations" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX "store_checkout_reservations_due_idx" ON "store_checkout_reservations" USING btree ("state","expires_at");
--> statement-breakpoint
CREATE INDEX "store_checkout_reservations_client_idx" ON "store_checkout_reservations" USING btree ("client_id","website_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "store_payment_events_site_event_idx" ON "store_payment_events" USING btree ("website_id","event_id");
--> statement-breakpoint
CREATE INDEX "workflow_run_steps_pending_idx" ON "workflow_run_steps" USING btree ("client_id","status","next_retry_at");
--> statement-breakpoint
CREATE INDEX "kanban_card_files_stored_filename_idx" ON "kanban_card_files" USING btree ("stored_filename");
--> statement-breakpoint
CREATE INDEX "kanban_card_files_url_idx" ON "kanban_card_files" USING btree ("url");
--> statement-breakpoint
CREATE INDEX "brain_notes_attachment_key_idx" ON "brain_notes" USING btree ("attachment_stored_key");
--> statement-breakpoint
CREATE INDEX "brain_notes_attachment_url_idx" ON "brain_notes" USING btree ("attachment_url");
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_outbox_connection_key_idx" ON "channel_outbox" USING btree ("connection_id","idempotency_key");
