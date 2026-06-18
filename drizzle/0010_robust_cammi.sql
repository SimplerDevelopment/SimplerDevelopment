CREATE TYPE "public"."agentic_os_run_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'cancelled', 'unavailable');--> statement-breakpoint
CREATE TABLE "user_onboarding" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"client_id" integer,
	"step" varchar(50) DEFAULT 'welcome' NOT NULL,
	"answers" json DEFAULT '{}'::json NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_domain_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"domain" varchar(255) NOT NULL,
	"action" varchar(20) NOT NULL,
	"by_user_id" integer,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"ga_measurement_id" varchar(50),
	"gtm_container_id" varchar(50),
	"meta_pixel_id" varchar(50),
	"clarity_project_id" varchar(50),
	"hotjar_site_id" varchar(50),
	"linkedin_partner_id" varchar(50),
	"tiktok_pixel_id" varchar(50),
	"gsc_verification" varchar(255),
	"bing_verification" varchar(255),
	"pinterest_verification" varchar(255),
	"custom_head_html" text,
	"custom_body_html" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_tracking_website_id_unique" UNIQUE("website_id")
);
--> statement-breakpoint
CREATE TABLE "crm_contract_signing_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"kind" varchar(50) NOT NULL,
	"actor_email" varchar(255),
	"payload" json DEFAULT '{}'::json,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"notification_type" varchar(64) NOT NULL,
	"delivery" varchar(16) DEFAULT 'instant' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_custom_field_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"field_id" integer NOT NULL,
	"value" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_recurrences" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"column_id" integer NOT NULL,
	"template_id" integer,
	"title_pattern" varchar(255),
	"description" text,
	"cadence" varchar(20) NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"hour_utc" integer DEFAULT 9 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp,
	"last_fired_card_id" integer,
	"next_fire_at" timestamp NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"project_id" integer,
	"name" varchar(100) NOT NULL,
	"description" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "column_daily_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"column_id" integer NOT NULL,
	"snapshot_date" varchar(10) NOT NULL,
	"card_count" integer DEFAULT 0 NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" varchar(50) NOT NULL,
	"card_id" integer,
	"project_id" integer,
	"actor_user_id" integer,
	"title" varchar(255) NOT NULL,
	"body" text,
	"payload" jsonb,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"artifact_type" varchar(50) NOT NULL,
	"artifact_id" integer NOT NULL,
	"display_title" varchar(255) NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"key" varchar(60) NOT NULL,
	"name" varchar(100) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"unit_label" varchar(30),
	"current_value" integer DEFAULT 0 NOT NULL,
	"target_value" integer DEFAULT 100 NOT NULL,
	"target_date" timestamp,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(20) DEFAULT 'viewer' NOT NULL,
	"added_by" integer,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_saved_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer,
	"scope" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"filter_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprint_retro_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"retro_id" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"text" text NOT NULL,
	"votes" integer DEFAULT 0 NOT NULL,
	"author_user_id" integer,
	"promoted_card_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprint_retros" (
	"id" serial PRIMARY KEY NOT NULL,
	"sprint_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprint_scope_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"sprint_id" integer NOT NULL,
	"card_id" integer,
	"action" varchar(20) NOT NULL,
	"points" integer,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"occurred_by" integer
);
--> statement-breakpoint
CREATE TABLE "brain_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"context" text,
	"decision" text NOT NULL,
	"rationale" text NOT NULL,
	"alternatives_considered" text,
	"reversibility" varchar(20) DEFAULT 'two_way' NOT NULL,
	"status" varchar(20) DEFAULT 'accepted' NOT NULL,
	"decision_maker_id" integer,
	"decided_at" timestamp DEFAULT now() NOT NULL,
	"superseded_by_decision_id" integer,
	"meeting_id" integer,
	"note_id" integer,
	"company_id" integer,
	"deal_id" integer,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"review_item_id" integer,
	"confidentiality_level" varchar(20) DEFAULT 'standard' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_document_acknowledgments" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"version_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"required_read_id" integer,
	"acknowledgment_note" text,
	"acknowledged_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_document_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" integer NOT NULL,
	"note" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_document_required_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"pinned_version_id" integer,
	"target_type" varchar(30) NOT NULL,
	"target_id" integer NOT NULL,
	"due_at" timestamp,
	"assigned_by" integer,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_document_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"body" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"summary" text,
	"change_notes" text,
	"is_draft" boolean DEFAULT true NOT NULL,
	"published_at" timestamp,
	"published_by" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"category" varchar(30) DEFAULT 'reference' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"owner_id" integer,
	"current_published_version_id" integer,
	"current_draft_version_id" integer,
	"published_at" timestamp,
	"archived_at" timestamp,
	"archive_reason" text,
	"source_note_id" integer,
	"confidentiality_level" varchar(20) DEFAULT 'standard' NOT NULL,
	"default_topic_ids" json DEFAULT '[]'::json NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	"vector" vector(1536) NOT NULL,
	"model" varchar(100) NOT NULL,
	"dim" integer NOT NULL,
	"tokens" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_entity_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"topic_id" integer NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" integer NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_expertise_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"source" varchar(30) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_glossary_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"term" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"definition" text NOT NULL,
	"short_definition" varchar(500),
	"aliases" json DEFAULT '[]'::json NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"category" varchar(100),
	"owner_id" integer,
	"related_term_ids" json DEFAULT '[]'::json NOT NULL,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"review_item_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"initiative_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"owner_id" integer,
	"unit" varchar(30),
	"target_metric" integer,
	"current_metric" integer,
	"last_progress_note" text,
	"last_checked_in_at" timestamp,
	"target_date" timestamp,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_initiative_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"initiative_id" integer NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" integer NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_initiatives" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(150) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'planned' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"owner_id" integer,
	"sponsor_id" integer,
	"start_date" timestamp,
	"target_date" timestamp,
	"closed_at" timestamp,
	"close_reason" text,
	"lessons_learned" text,
	"confidentiality_level" varchar(20) DEFAULT 'standard' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_org_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"parent_id" integer,
	"name" varchar(150) NOT NULL,
	"slug" varchar(150) NOT NULL,
	"path" varchar(1000) NOT NULL,
	"description" text,
	"lead_person_id" integer,
	"color" varchar(20),
	"icon" varchar(50),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_people" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer,
	"full_name" varchar(200) NOT NULL,
	"email" varchar(255),
	"manager_id" integer,
	"title" varchar(200),
	"start_date" timestamp,
	"end_date" timestamp,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"notes" text,
	"profile_urls" json DEFAULT '[]'::json NOT NULL,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_person_expertise" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"expertise_tag_id" integer NOT NULL,
	"level" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_person_org_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"org_unit_id" integer NOT NULL,
	"primary" boolean DEFAULT false NOT NULL,
	"role_in_unit" varchar(150),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_playbook_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"run_id" integer NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_playbook_run_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"run_id" integer NOT NULL,
	"step_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"result_entity_type" varchar(50),
	"result_entity_id" integer,
	"wait_until" timestamp,
	"failure_reason" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_playbook_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"playbook_id" integer NOT NULL,
	"label" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"context" json DEFAULT '{}'::json NOT NULL,
	"started_by" integer,
	"trigger_payload" json,
	"started_at" timestamp,
	"completed_at" timestamp,
	"aborted_at" timestamp,
	"abort_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_playbook_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"playbook_id" integer NOT NULL,
	"key" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"kind" varchar(30) NOT NULL,
	"config" json DEFAULT '{}'::json NOT NULL,
	"condition" json,
	"next_step_keys" json DEFAULT '[]'::json NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_playbooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"trigger_kind" varchar(20) DEFAULT 'manual' NOT NULL,
	"trigger_config" json,
	"category" varchar(100),
	"owner_id" integer,
	"default_topic_ids" json DEFAULT '[]'::json NOT NULL,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"parent_id" integer,
	"name" varchar(150) NOT NULL,
	"slug" varchar(150) NOT NULL,
	"path" varchar(1000) NOT NULL,
	"description" text,
	"color" varchar(20),
	"icon" varchar(50),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"derived_from_tag" varchar(100),
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"design_id" uuid NOT NULL,
	"url" varchar(500) NOT NULL,
	"stored_filename" varchar(255),
	"original_filename" varchar(255),
	"mime_type" varchar(80),
	"width" integer,
	"height" integer,
	"file_size" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"customer_id" integer,
	"session_id" varchar(255),
	"name" varchar(255) DEFAULT 'Untitled design' NOT NULL,
	"layers_by_surface" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"canvas_size" jsonb DEFAULT '{"width":800,"height":600,"dpi":72}'::jsonb NOT NULL,
	"thumbnail_url" varchar(500),
	"rendered_url" varchar(500),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "easypost_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer,
	"event_id" varchar(255) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"shipment_id" varchar(255),
	"tracker_id" varchar(255),
	"order_id" integer,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_design_surfaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"mockup_image" varchar(500) NOT NULL,
	"canvas_width" integer DEFAULT 800 NOT NULL,
	"canvas_height" integer DEFAULT 600 NOT NULL,
	"print_area_x" integer DEFAULT 100 NOT NULL,
	"print_area_y" integer DEFAULT 100 NOT NULL,
	"print_area_width" integer DEFAULT 600 NOT NULL,
	"print_area_height" integer DEFAULT 400 NOT NULL,
	"print_dpi" integer DEFAULT 300 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
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
CREATE TABLE "product_designs" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" varchar(36) NOT NULL,
	"website_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"style_id" integer,
	"customer_id" integer,
	"session_id" varchar(255),
	"name" varchar(255) DEFAULT 'Untitled Design' NOT NULL,
	"description" text,
	"layers" json DEFAULT '[]'::json,
	"style_overrides" json DEFAULT '{}'::json,
	"thumbnail_url" varchar(500),
	"is_public" boolean DEFAULT false NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"last_accessed_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_designs_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "product_sides" (
	"id" serial PRIMARY KEY NOT NULL,
	"style_id" integer NOT NULL,
	"side" varchar(50) NOT NULL,
	"label" varchar(100),
	"image_url" varchar(500) NOT NULL,
	"printable_x" integer DEFAULT 0 NOT NULL,
	"printable_y" integer DEFAULT 0 NOT NULL,
	"printable_width" integer,
	"printable_height" integer,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_styles" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"color_hex" varchar(7),
	"thumbnail_url" varchar(500),
	"price_cents" integer,
	"order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_renders" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"blocks_hash" varchar(64) NOT NULL,
	"html" text NOT NULL,
	"subject" text,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_email_sequence_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"sequence_id" integer NOT NULL,
	"survey_response_id" integer NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"resend_email_id" varchar(255),
	"error" text
);
--> statement-breakpoint
CREATE TABLE "survey_webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_id" integer NOT NULL,
	"event" varchar(50) NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) NOT NULL,
	"status_code" integer,
	"request_body" json,
	"response_body" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_attendees" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"notes" text,
	"status" varchar(20) DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_tool_call_daily_rollups" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" timestamp NOT NULL,
	"client_id" integer NOT NULL,
	"tool_name" varchar(100) NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"total_request_bytes" integer DEFAULT 0 NOT NULL,
	"total_response_bytes" integer DEFAULT 0 NOT NULL,
	"total_estimated_tokens" integer DEFAULT 0 NOT NULL,
	"total_duration_ms" integer DEFAULT 0 NOT NULL,
	"p95_response_bytes" integer DEFAULT 0 NOT NULL,
	"p95_estimated_tokens" integer DEFAULT 0 NOT NULL,
	"p95_duration_ms" integer DEFAULT 0 NOT NULL,
	"max_response_bytes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_tool_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"api_key_id" integer,
	"user_id" integer,
	"tool_name" varchar(100) NOT NULL,
	"request_bytes" integer DEFAULT 0 NOT NULL,
	"response_bytes" integer DEFAULT 0 NOT NULL,
	"estimated_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "microsoft_teams_user_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"microsoft_tenant_id" varchar(64) NOT NULL,
	"microsoft_user_id" varchar(64) NOT NULL,
	"microsoft_account_email" varchar(320) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subscription_id" varchar(64),
	"subscription_resource" text,
	"subscription_expiration" timestamp,
	"subscription_client_state" varchar(64),
	"delta_token" text,
	"last_sync_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_api_keys" (
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
CREATE TABLE "metered_subscription_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"stripe_subscription_id" varchar(255) NOT NULL,
	"stripe_subscription_item_id" varchar(255) NOT NULL,
	"resource" varchar(50) NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"included_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_billing_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"period" varchar(7) NOT NULL,
	"resource" varchar(50) NOT NULL,
	"total_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	"included_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	"billable_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"billed_amount_cents" integer DEFAULT 0 NOT NULL,
	"stripe_usage_record_id" varchar(255),
	"reported_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_meter_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"resource" varchar(50) NOT NULL,
	"period" varchar(7) NOT NULL,
	"amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"source" varchar(32) NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_approval_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(64) NOT NULL,
	"client_id" integer NOT NULL,
	"link_type" varchar(20) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer,
	"pending_change_id" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"summary" varchar(500),
	"created_by" integer,
	"key_id" integer,
	"reviewer_name" varchar(255),
	"reviewer_email" varchar(255),
	"review_note" text,
	"reviewed_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_approval_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "document_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" integer NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"parent_id" uuid,
	"author_id" integer NOT NULL,
	"body" text NOT NULL,
	"mentioned_user_ids" json DEFAULT '[]'::json NOT NULL,
	"anchor" json,
	"resolved_at" timestamp,
	"resolved_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_link_clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"contact_id" integer,
	"ip" text,
	"user_agent" text,
	"referer" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"slug" varchar(64) NOT NULL,
	"destination_url" text NOT NULL,
	"label" varchar(255),
	"contact_field_key" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trigger_links_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ab_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"experiment_id" integer NOT NULL,
	"variant_key" varchar(8) NOT NULL,
	"visitor_id" varchar(64) NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ab_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"experiment_id" integer NOT NULL,
	"variant_key" varchar(8) NOT NULL,
	"visitor_id" varchar(64) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ab_experiments" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_type" varchar(20) DEFAULT 'post' NOT NULL,
	"target_id" integer NOT NULL,
	"post_id" integer,
	"name" varchar(255) NOT NULL,
	"hypothesis" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"variant_split" json NOT NULL,
	"goal_metric" varchar(50) DEFAULT 'page_view' NOT NULL,
	"goal_selector" text,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ab_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"experiment_id" integer NOT NULL,
	"key" varchar(8) NOT NULL,
	"label" varchar(255) NOT NULL,
	"block_tree_override" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"source_site_id" integer,
	"payload" json NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"triggered_by" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"context" json DEFAULT '{}'::json NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "workflow_step_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"node_id" text NOT NULL,
	"action" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"input" json,
	"output" json,
	"duration_ms" integer,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"trigger" json NOT NULL,
	"graph" json NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
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
--> statement-breakpoint
CREATE TABLE "chat_messages" (
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
--> statement-breakpoint
CREATE TABLE "chat_widgets" (
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
--> statement-breakpoint
CREATE TABLE "cron_health" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"area" varchar(40) NOT NULL,
	"last_run_at" timestamp,
	"last_success_at" timestamp,
	"last_error" text,
	"last_error_at" timestamp,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cron_health_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "agentic_os_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"skill_id" varchar(128) NOT NULL,
	"prompt" text NOT NULL,
	"variables" jsonb,
	"status" "agentic_os_run_status" DEFAULT 'pending' NOT NULL,
	"output" text,
	"exit_code" integer,
	"error_message" text,
	"duration_ms" integer,
	"host" varchar(64),
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
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
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "registered_app_callbacks_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer,
	"jti" varchar(64) NOT NULL,
	"route" varchar(255) NOT NULL,
	"method" varchar(8) NOT NULL,
	"status" integer NOT NULL,
	"request_id" varchar(64),
	"ts" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "registered_app_callbacks_audit_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
CREATE TABLE "registered_app_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"kind" varchar(64) NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"day_of_week" integer,
	"time_utc" varchar(5),
	"cron_expr" varchar(64),
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp NOT NULL,
	"last_run_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registered_app_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"job_id" integer,
	"kind" varchar(64) NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"exit_code" integer,
	"log_tail" text,
	"error_summary" text,
	"result_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registered_app_signing_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"kid" varchar(32) NOT NULL,
	"secret_hash" varchar(255) NOT NULL,
	"secret_encrypted" text NOT NULL,
	"algo" varchar(16) DEFAULT 'HS256' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"rotated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "registered_apps" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"icon" varchar(64),
	"host_url" varchar(500) NOT NULL,
	"manifest_url" varchar(500) NOT NULL,
	"nav_label" varchar(64),
	"nav_position" integer DEFAULT 50 NOT NULL,
	"default_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"billing_service_id" integer,
	"visibility" varchar(20) DEFAULT 'allowlist' NOT NULL,
	"allowed_client_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "registered_apps_slug_unique" UNIQUE("slug")
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
CREATE TABLE "publishing_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"color" varchar(7) DEFAULT '#6366f1' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publishing_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"permission_key" varchar(40) NOT NULL,
	"granted_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_api_keys" ALTER COLUMN "require_cms_approval" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ALTER COLUMN "code_challenge" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ALTER COLUMN "code_challenge_method" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ALTER COLUMN "code_challenge_method" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_clients" ALTER COLUMN "client_id" SET DATA TYPE varchar(500);--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "preview_code" varchar(64);--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "draft_custom_css" text;--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "draft_custom_js" text;--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "draft_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "draft_updated_by" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "custom_domain" varchar(255);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "custom_domain_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "custom_domain_verification_token" varchar(64);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "white_label_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "agency_name" varchar(255);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "agency_logo_url" varchar(500);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "agency_primary_color" varchar(20);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "brain_trial_until" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "publishing_project_id" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "default_timezone" varchar(60) DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_navigation" ADD COLUMN "draft" json;--> statement-breakpoint
ALTER TABLE "block_templates" ADD COLUMN "client_id" integer;--> statement-breakpoint
ALTER TABLE "block_templates" ADD COLUMN "draft" json;--> statement-breakpoint
ALTER TABLE "block_templates" ADD COLUMN "parent_template_id" integer;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD COLUMN "content_hash" varchar(16);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "parent_post_id" integer;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD COLUMN "esign_provider" varchar(20);--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD COLUMN "esign_provider_request_id" varchar(255);--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD COLUMN "esign_signer_email" varchar(255);--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD COLUMN "esign_signer_name" varchar(255);--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD COLUMN "esign_status" varchar(20) DEFAULT 'not_sent';--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD COLUMN "esign_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD COLUMN "esign_signed_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD COLUMN "esign_declined_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD COLUMN "esign_audit_file_url" text;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD COLUMN "esign_webhook_events" json DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "crm_notifications" ADD COLUMN "metadata" json;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD COLUMN "story_points" integer;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD COLUMN "card_type" varchar(20) DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD COLUMN "parent_card_id" integer;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD COLUMN "workflow_state" varchar(20) DEFAULT 'todo' NOT NULL;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD COLUMN "campaign_id" integer;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD COLUMN "scheduled_for" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "system_kind" varchar(30);--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "first_response_due_at" timestamp;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "first_response_at" timestamp;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "resolution_due_at" timestamp;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD COLUMN "schedule" json;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD COLUMN "next_run_at" timestamp;--> statement-breakpoint
ALTER TABLE "brain_ai_review_items" ADD COLUMN "suggested_reviewer_person_id" integer;--> statement-breakpoint
ALTER TABLE "brain_ai_review_items" ADD COLUMN "suggested_reviewer_score" integer;--> statement-breakpoint
ALTER TABLE "brain_ai_review_items" ADD COLUMN "suggested_reviewer_reason" text;--> statement-breakpoint
ALTER TABLE "brain_notes" ADD COLUMN "status" varchar(20) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "brain_profiles" ADD COLUMN "agent_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN "design_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "design_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "design_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "print_ready_url" varchar(500);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "carrier" varchar(50);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "easypost_shipment_id" varchar(255);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "label_url" varchar(500);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "label_cost_cents" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "label_purchased_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "latest_tracking_status" varchar(50);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "latest_tracking_event_at" timestamp;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "length_in" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "width_in" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "height_in" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "length_in" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "width_in" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "height_in" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_designable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "designable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "provider" varchar(20) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "carrier_code" varchar(30);--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "service_code" varchar(60);--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "live_rate_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "stripe_mode" varchar(20) DEFAULT 'connect' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "stripe_byok_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "stripe_secret_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "stripe_publishable_key" varchar(255);--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "stripe_webhook_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "shipping_provider" varchar(20) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "easypost_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "easypost_mode" varchar(10) DEFAULT 'test';--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "easypost_webhook_secret" varchar(255);--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "ship_from_address" jsonb;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "default_parcel_length_in" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "default_parcel_width_in" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "default_parcel_height_in" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "default_parcel_weight_oz" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "live_rates_fallback" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaign_sends" ADD COLUMN "ab_variant" varchar(10);--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "content_blocks" json;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "use_block_editor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "ab_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "ab_subject_b" varchar(255);--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "ab_winner_metric" varchar(20) DEFAULT 'open';--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "ab_test_size_pct" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "ab_winner_subject" varchar(255);--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "ab_decided_at" timestamp;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "parent_campaign_id" integer;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD COLUMN "score" integer;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD COLUMN "last_fired_at" timestamp;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD COLUMN "last_status" integer;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD COLUMN "failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "publish_results" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "certificate_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "consent_field" varchar(64);--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "scoring_config" json;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "parent_survey_id" integer;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD COLUMN "assignment_mode" varchar(20) DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD COLUMN "round_robin_pool" json;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD COLUMN "booking_type" varchar(20) DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD COLUMN "group_capacity" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "assigned_user_id" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD COLUMN "seo_title" varchar(255);--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD COLUMN "seo_description" text;--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD COLUMN "og_image" varchar(500);--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD COLUMN "canonical_url" varchar(500);--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD COLUMN "no_index" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD COLUMN "parent_deck_id" integer;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "client_secret_hash" varchar(128);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "client_secret_preview" varchar(32);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "client_secret_created_at" timestamp;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "client_secret_rotated_at" timestamp;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "owner_client_id" integer;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "owner_user_id" integer;--> statement-breakpoint
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_domain_history" ADD CONSTRAINT "custom_domain_history_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_domain_history" ADD CONSTRAINT "custom_domain_history_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_tracking" ADD CONSTRAINT "site_tracking_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contract_signing_events" ADD CONSTRAINT "crm_contract_signing_events_contract_id_crm_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."crm_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contract_signing_events" ADD CONSTRAINT "crm_contract_signing_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_custom_field_values" ADD CONSTRAINT "card_custom_field_values_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_custom_field_values" ADD CONSTRAINT "card_custom_field_values_field_id_project_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."project_custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_recurrences" ADD CONSTRAINT "card_recurrences_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_recurrences" ADD CONSTRAINT "card_recurrences_column_id_kanban_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."kanban_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_recurrences" ADD CONSTRAINT "card_recurrences_template_id_card_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."card_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_recurrences" ADD CONSTRAINT "card_recurrences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_templates" ADD CONSTRAINT "card_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_templates" ADD CONSTRAINT "card_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_templates" ADD CONSTRAINT "card_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "column_daily_snapshots" ADD CONSTRAINT "column_daily_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "column_daily_snapshots" ADD CONSTRAINT "column_daily_snapshots_column_id_kanban_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."kanban_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_artifacts" ADD CONSTRAINT "project_artifacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_artifacts" ADD CONSTRAINT "project_artifacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_custom_fields" ADD CONSTRAINT "project_custom_fields_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_custom_fields" ADD CONSTRAINT "project_custom_fields_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_goals" ADD CONSTRAINT "project_goals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_goals" ADD CONSTRAINT "project_goals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_saved_views" ADD CONSTRAINT "project_saved_views_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_saved_views" ADD CONSTRAINT "project_saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_saved_views" ADD CONSTRAINT "project_saved_views_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_retro_items" ADD CONSTRAINT "sprint_retro_items_retro_id_sprint_retros_id_fk" FOREIGN KEY ("retro_id") REFERENCES "public"."sprint_retros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_retro_items" ADD CONSTRAINT "sprint_retro_items_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_retro_items" ADD CONSTRAINT "sprint_retro_items_promoted_card_id_kanban_cards_id_fk" FOREIGN KEY ("promoted_card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_retros" ADD CONSTRAINT "sprint_retros_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_retros" ADD CONSTRAINT "sprint_retros_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_scope_history" ADD CONSTRAINT "sprint_scope_history_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_scope_history" ADD CONSTRAINT "sprint_scope_history_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_scope_history" ADD CONSTRAINT "sprint_scope_history_occurred_by_users_id_fk" FOREIGN KEY ("occurred_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_decisions" ADD CONSTRAINT "brain_decisions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_decisions" ADD CONSTRAINT "brain_decisions_decision_maker_id_users_id_fk" FOREIGN KEY ("decision_maker_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_decisions" ADD CONSTRAINT "brain_decisions_superseded_by_decision_id_brain_decisions_id_fk" FOREIGN KEY ("superseded_by_decision_id") REFERENCES "public"."brain_decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_decisions" ADD CONSTRAINT "brain_decisions_meeting_id_brain_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."brain_meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_decisions" ADD CONSTRAINT "brain_decisions_note_id_brain_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."brain_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_decisions" ADD CONSTRAINT "brain_decisions_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_decisions" ADD CONSTRAINT "brain_decisions_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_decisions" ADD CONSTRAINT "brain_decisions_review_item_id_brain_ai_review_items_id_fk" FOREIGN KEY ("review_item_id") REFERENCES "public"."brain_ai_review_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_decisions" ADD CONSTRAINT "brain_decisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_acknowledgments" ADD CONSTRAINT "brain_document_acknowledgments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_acknowledgments" ADD CONSTRAINT "brain_document_acknowledgments_document_id_brain_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."brain_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_acknowledgments" ADD CONSTRAINT "brain_document_acknowledgments_version_id_brain_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."brain_document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_acknowledgments" ADD CONSTRAINT "brain_document_acknowledgments_person_id_brain_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."brain_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_acknowledgments" ADD CONSTRAINT "brain_document_acknowledgments_required_read_id_brain_document_required_reads_id_fk" FOREIGN KEY ("required_read_id") REFERENCES "public"."brain_document_required_reads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_links" ADD CONSTRAINT "brain_document_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_links" ADD CONSTRAINT "brain_document_links_document_id_brain_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."brain_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_links" ADD CONSTRAINT "brain_document_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_required_reads" ADD CONSTRAINT "brain_document_required_reads_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_required_reads" ADD CONSTRAINT "brain_document_required_reads_document_id_brain_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."brain_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_required_reads" ADD CONSTRAINT "brain_document_required_reads_pinned_version_id_brain_document_versions_id_fk" FOREIGN KEY ("pinned_version_id") REFERENCES "public"."brain_document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_required_reads" ADD CONSTRAINT "brain_document_required_reads_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_versions" ADD CONSTRAINT "brain_document_versions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_versions" ADD CONSTRAINT "brain_document_versions_document_id_brain_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."brain_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_versions" ADD CONSTRAINT "brain_document_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_document_versions" ADD CONSTRAINT "brain_document_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_documents" ADD CONSTRAINT "brain_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_documents" ADD CONSTRAINT "brain_documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_documents" ADD CONSTRAINT "brain_documents_source_note_id_brain_notes_id_fk" FOREIGN KEY ("source_note_id") REFERENCES "public"."brain_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_documents" ADD CONSTRAINT "brain_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_embeddings" ADD CONSTRAINT "brain_embeddings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_entity_topics" ADD CONSTRAINT "brain_entity_topics_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_entity_topics" ADD CONSTRAINT "brain_entity_topics_topic_id_brain_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."brain_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_entity_topics" ADD CONSTRAINT "brain_entity_topics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_expertise_tags" ADD CONSTRAINT "brain_expertise_tags_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_glossary_terms" ADD CONSTRAINT "brain_glossary_terms_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_glossary_terms" ADD CONSTRAINT "brain_glossary_terms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_glossary_terms" ADD CONSTRAINT "brain_glossary_terms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_goals" ADD CONSTRAINT "brain_goals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_goals" ADD CONSTRAINT "brain_goals_initiative_id_brain_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."brain_initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_goals" ADD CONSTRAINT "brain_goals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_goals" ADD CONSTRAINT "brain_goals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_initiative_links" ADD CONSTRAINT "brain_initiative_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_initiative_links" ADD CONSTRAINT "brain_initiative_links_initiative_id_brain_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."brain_initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_initiative_links" ADD CONSTRAINT "brain_initiative_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_initiatives" ADD CONSTRAINT "brain_initiatives_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_initiatives" ADD CONSTRAINT "brain_initiatives_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_initiatives" ADD CONSTRAINT "brain_initiatives_sponsor_id_users_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_initiatives" ADD CONSTRAINT "brain_initiatives_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_org_units" ADD CONSTRAINT "brain_org_units_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_org_units" ADD CONSTRAINT "brain_org_units_parent_id_brain_org_units_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."brain_org_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_org_units" ADD CONSTRAINT "brain_org_units_lead_person_id_brain_people_id_fk" FOREIGN KEY ("lead_person_id") REFERENCES "public"."brain_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_org_units" ADD CONSTRAINT "brain_org_units_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_people" ADD CONSTRAINT "brain_people_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_people" ADD CONSTRAINT "brain_people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_people" ADD CONSTRAINT "brain_people_manager_id_brain_people_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."brain_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_people" ADD CONSTRAINT "brain_people_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_person_expertise" ADD CONSTRAINT "brain_person_expertise_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_person_expertise" ADD CONSTRAINT "brain_person_expertise_person_id_brain_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."brain_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_person_expertise" ADD CONSTRAINT "brain_person_expertise_expertise_tag_id_brain_expertise_tags_id_fk" FOREIGN KEY ("expertise_tag_id") REFERENCES "public"."brain_expertise_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_person_org_units" ADD CONSTRAINT "brain_person_org_units_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_person_org_units" ADD CONSTRAINT "brain_person_org_units_person_id_brain_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."brain_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_person_org_units" ADD CONSTRAINT "brain_person_org_units_org_unit_id_brain_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."brain_org_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbook_links" ADD CONSTRAINT "brain_playbook_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbook_links" ADD CONSTRAINT "brain_playbook_links_run_id_brain_playbook_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."brain_playbook_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbook_run_steps" ADD CONSTRAINT "brain_playbook_run_steps_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbook_run_steps" ADD CONSTRAINT "brain_playbook_run_steps_run_id_brain_playbook_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."brain_playbook_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbook_run_steps" ADD CONSTRAINT "brain_playbook_run_steps_step_id_brain_playbook_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."brain_playbook_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbook_runs" ADD CONSTRAINT "brain_playbook_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbook_runs" ADD CONSTRAINT "brain_playbook_runs_playbook_id_brain_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."brain_playbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbook_runs" ADD CONSTRAINT "brain_playbook_runs_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbook_steps" ADD CONSTRAINT "brain_playbook_steps_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbook_steps" ADD CONSTRAINT "brain_playbook_steps_playbook_id_brain_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."brain_playbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbooks" ADD CONSTRAINT "brain_playbooks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbooks" ADD CONSTRAINT "brain_playbooks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_playbooks" ADD CONSTRAINT "brain_playbooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_topics" ADD CONSTRAINT "brain_topics_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_topics" ADD CONSTRAINT "brain_topics_parent_id_brain_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."brain_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_topics" ADD CONSTRAINT "brain_topics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_assets" ADD CONSTRAINT "design_assets_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "easypost_events" ADD CONSTRAINT "easypost_events_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "easypost_events" ADD CONSTRAINT "easypost_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_design_surfaces" ADD CONSTRAINT "product_design_surfaces_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "philaprints_design_assets" ADD CONSTRAINT "philaprints_design_assets_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_designs" ADD CONSTRAINT "product_designs_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_designs" ADD CONSTRAINT "product_designs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_designs" ADD CONSTRAINT "product_designs_style_id_product_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."product_styles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_designs" ADD CONSTRAINT "product_designs_customer_id_store_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."store_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sides" ADD CONSTRAINT "product_sides_style_id_product_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."product_styles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_styles" ADD CONSTRAINT "product_styles_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_renders" ADD CONSTRAINT "email_renders_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_email_sequence_sends" ADD CONSTRAINT "survey_email_sequence_sends_sequence_id_survey_email_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."survey_email_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_email_sequence_sends" ADD CONSTRAINT "survey_email_sequence_sends_survey_response_id_survey_responses_id_fk" FOREIGN KEY ("survey_response_id") REFERENCES "public"."survey_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_webhook_deliveries" ADD CONSTRAINT "survey_webhook_deliveries_webhook_id_survey_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."survey_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_attendees" ADD CONSTRAINT "booking_attendees_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_call_daily_rollups" ADD CONSTRAINT "mcp_tool_call_daily_rollups_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD CONSTRAINT "mcp_tool_calls_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD CONSTRAINT "mcp_tool_calls_api_key_id_portal_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."portal_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD CONSTRAINT "mcp_tool_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microsoft_teams_user_connections" ADD CONSTRAINT "microsoft_teams_user_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microsoft_teams_user_connections" ADD CONSTRAINT "microsoft_teams_user_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_api_keys" ADD CONSTRAINT "client_api_keys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metered_subscription_items" ADD CONSTRAINT "metered_subscription_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_billing_periods" ADD CONSTRAINT "usage_billing_periods_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_meter_events" ADD CONSTRAINT "usage_meter_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_approval_links" ADD CONSTRAINT "mcp_approval_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_approval_links" ADD CONSTRAINT "mcp_approval_links_pending_change_id_mcp_pending_changes_id_fk" FOREIGN KEY ("pending_change_id") REFERENCES "public"."mcp_pending_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_approval_links" ADD CONSTRAINT "mcp_approval_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_approval_links" ADD CONSTRAINT "mcp_approval_links_key_id_portal_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."portal_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_link_clicks" ADD CONSTRAINT "trigger_link_clicks_link_id_trigger_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."trigger_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_link_clicks" ADD CONSTRAINT "trigger_link_clicks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_links" ADD CONSTRAINT "trigger_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_links" ADD CONSTRAINT "trigger_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ab_assignments" ADD CONSTRAINT "ab_assignments_experiment_id_ab_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."ab_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ab_events" ADD CONSTRAINT "ab_events_experiment_id_ab_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."ab_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ab_experiments" ADD CONSTRAINT "ab_experiments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ab_experiments" ADD CONSTRAINT "ab_experiments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ab_variants" ADD CONSTRAINT "ab_variants_experiment_id_ab_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."ab_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_snapshots" ADD CONSTRAINT "site_snapshots_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_snapshots" ADD CONSTRAINT "site_snapshots_source_site_id_client_websites_id_fk" FOREIGN KEY ("source_site_id") REFERENCES "public"."client_websites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_snapshots" ADD CONSTRAINT "site_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_logs" ADD CONSTRAINT "workflow_step_logs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_widget_id_chat_widgets_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."chat_widgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD CONSTRAINT "chat_widgets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD CONSTRAINT "chat_widgets_site_id_client_websites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agentic_os_runs" ADD CONSTRAINT "agentic_os_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postcaptain_briefs" ADD CONSTRAINT "postcaptain_briefs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postcaptain_briefs" ADD CONSTRAINT "postcaptain_briefs_run_id_registered_app_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."registered_app_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postcaptain_drafts" ADD CONSTRAINT "postcaptain_drafts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postcaptain_drafts" ADD CONSTRAINT "postcaptain_drafts_run_id_registered_app_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."registered_app_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postcaptain_drafts" ADD CONSTRAINT "postcaptain_drafts_brief_id_postcaptain_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."postcaptain_briefs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_app_callbacks_audit" ADD CONSTRAINT "registered_app_callbacks_audit_app_id_registered_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."registered_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_app_callbacks_audit" ADD CONSTRAINT "registered_app_callbacks_audit_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_app_callbacks_audit" ADD CONSTRAINT "registered_app_callbacks_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_app_jobs" ADD CONSTRAINT "registered_app_jobs_app_id_registered_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."registered_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_app_jobs" ADD CONSTRAINT "registered_app_jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_app_jobs" ADD CONSTRAINT "registered_app_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_app_runs" ADD CONSTRAINT "registered_app_runs_app_id_registered_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."registered_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_app_runs" ADD CONSTRAINT "registered_app_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_app_signing_keys" ADD CONSTRAINT "registered_app_signing_keys_app_id_registered_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."registered_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_apps" ADD CONSTRAINT "registered_apps_billing_service_id_services_id_fk" FOREIGN KEY ("billing_service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magamommy_briefs" ADD CONSTRAINT "magamommy_briefs_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magamommy_concepts" ADD CONSTRAINT "magamommy_concepts_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magamommy_concepts" ADD CONSTRAINT "magamommy_concepts_brief_id_magamommy_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."magamommy_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magamommy_drops" ADD CONSTRAINT "magamommy_drops_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magamommy_drops" ADD CONSTRAINT "magamommy_drops_brief_id_magamommy_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."magamommy_briefs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magamommy_drops" ADD CONSTRAINT "magamommy_drops_concept_id_magamommy_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."magamommy_concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magamommy_drops" ADD CONSTRAINT "magamommy_drops_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_campaigns" ADD CONSTRAINT "publishing_campaigns_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_campaigns" ADD CONSTRAINT "publishing_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_permissions" ADD CONSTRAINT "publishing_permissions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_permissions" ADD CONSTRAINT "publishing_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_permissions" ADD CONSTRAINT "publishing_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_client_user_type_idx" ON "notification_preferences" USING btree ("client_id","user_id","notification_type");--> statement-breakpoint
CREATE UNIQUE INDEX "card_custom_field_values_card_field_idx" ON "card_custom_field_values" USING btree ("card_id","field_id");--> statement-breakpoint
CREATE INDEX "card_recurrences_due_idx" ON "card_recurrences" USING btree ("active","next_fire_at");--> statement-breakpoint
CREATE INDEX "card_recurrences_project_idx" ON "card_recurrences" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "card_templates_client_idx" ON "card_templates" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "card_templates_project_idx" ON "card_templates" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "column_daily_snapshots_unique_idx" ON "column_daily_snapshots" USING btree ("project_id","column_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "column_daily_snapshots_project_date_idx" ON "column_daily_snapshots" USING btree ("project_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_card_idx" ON "notifications" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "project_artifacts_project_idx" ON "project_artifacts" USING btree ("project_id","pinned","created_at");--> statement-breakpoint
CREATE INDEX "project_artifacts_project_type_idx" ON "project_artifacts" USING btree ("project_id","artifact_type");--> statement-breakpoint
CREATE UNIQUE INDEX "project_custom_fields_project_key_idx" ON "project_custom_fields" USING btree ("project_id","key");--> statement-breakpoint
CREATE INDEX "project_custom_fields_project_idx" ON "project_custom_fields" USING btree ("project_id","order");--> statement-breakpoint
CREATE INDEX "project_goals_project_idx" ON "project_goals" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_project_user_idx" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_saved_views_project_idx" ON "project_saved_views" USING btree ("project_id","scope");--> statement-breakpoint
CREATE INDEX "project_saved_views_user_idx" ON "project_saved_views" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "sprint_retro_items_retro_idx" ON "sprint_retro_items" USING btree ("retro_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "sprint_retros_sprint_idx" ON "sprint_retros" USING btree ("sprint_id");--> statement-breakpoint
CREATE INDEX "sprint_scope_history_sprint_idx" ON "sprint_scope_history" USING btree ("sprint_id","occurred_at");--> statement-breakpoint
CREATE INDEX "brain_decisions_client_idx" ON "brain_decisions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "brain_decisions_decided_at_idx" ON "brain_decisions" USING btree ("decided_at");--> statement-breakpoint
CREATE INDEX "brain_decisions_status_idx" ON "brain_decisions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_document_acks_doc_version_person_idx" ON "brain_document_acknowledgments" USING btree ("document_id","version_id","person_id");--> statement-breakpoint
CREATE INDEX "brain_document_acks_person_idx" ON "brain_document_acknowledgments" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "brain_document_acks_version_idx" ON "brain_document_acknowledgments" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_document_links_doc_entity_idx" ON "brain_document_links" USING btree ("document_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "brain_document_links_client_entity_idx" ON "brain_document_links" USING btree ("client_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_document_required_reads_doc_target_idx" ON "brain_document_required_reads" USING btree ("document_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "brain_document_required_reads_target_idx" ON "brain_document_required_reads" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "brain_document_required_reads_due_idx" ON "brain_document_required_reads" USING btree ("due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_document_versions_doc_version_idx" ON "brain_document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "brain_document_versions_doc_idx" ON "brain_document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "brain_document_versions_draft_idx" ON "brain_document_versions" USING btree ("is_draft");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_documents_client_slug_idx" ON "brain_documents" USING btree ("client_id","slug");--> statement-breakpoint
CREATE INDEX "brain_documents_client_status_idx" ON "brain_documents" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "brain_documents_category_idx" ON "brain_documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "brain_embeddings_client_idx" ON "brain_embeddings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "brain_embeddings_entity_idx" ON "brain_embeddings" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_embeddings_entity_chunk_idx" ON "brain_embeddings" USING btree ("entity_type","entity_id","chunk_index");--> statement-breakpoint
CREATE INDEX "brain_embeddings_client_entity_idx" ON "brain_embeddings" USING btree ("client_id","entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_entity_topics_entity_topic_idx" ON "brain_entity_topics" USING btree ("entity_type","entity_id","topic_id");--> statement-breakpoint
CREATE INDEX "brain_entity_topics_topic_idx" ON "brain_entity_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "brain_entity_topics_client_entity_idx" ON "brain_entity_topics" USING btree ("client_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_expertise_tags_client_slug_idx" ON "brain_expertise_tags" USING btree ("client_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_glossary_client_slug_idx" ON "brain_glossary_terms" USING btree ("client_id","slug");--> statement-breakpoint
CREATE INDEX "brain_glossary_client_status_idx" ON "brain_glossary_terms" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "brain_glossary_category_idx" ON "brain_glossary_terms" USING btree ("category");--> statement-breakpoint
CREATE INDEX "brain_goals_client_initiative_idx" ON "brain_goals" USING btree ("client_id","initiative_id");--> statement-breakpoint
CREATE INDEX "brain_goals_status_idx" ON "brain_goals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_initiative_links_init_entity_idx" ON "brain_initiative_links" USING btree ("initiative_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "brain_initiative_links_client_entity_idx" ON "brain_initiative_links" USING btree ("client_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_initiatives_client_slug_idx" ON "brain_initiatives" USING btree ("client_id","slug");--> statement-breakpoint
CREATE INDEX "brain_initiatives_client_status_idx" ON "brain_initiatives" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "brain_initiatives_target_idx" ON "brain_initiatives" USING btree ("target_date");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_org_units_client_slug_idx" ON "brain_org_units" USING btree ("client_id","slug");--> statement-breakpoint
CREATE INDEX "brain_org_units_client_parent_idx" ON "brain_org_units" USING btree ("client_id","parent_id");--> statement-breakpoint
CREATE INDEX "brain_org_units_path_idx" ON "brain_org_units" USING btree ("path");--> statement-breakpoint
CREATE INDEX "brain_people_client_idx" ON "brain_people" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "brain_people_client_status_idx" ON "brain_people" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "brain_people_manager_idx" ON "brain_people" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "brain_people_user_idx" ON "brain_people" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_person_expertise_person_tag_idx" ON "brain_person_expertise" USING btree ("person_id","expertise_tag_id");--> statement-breakpoint
CREATE INDEX "brain_person_expertise_tag_idx" ON "brain_person_expertise" USING btree ("expertise_tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_person_org_units_person_unit_idx" ON "brain_person_org_units" USING btree ("person_id","org_unit_id");--> statement-breakpoint
CREATE INDEX "brain_person_org_units_unit_idx" ON "brain_person_org_units" USING btree ("org_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_playbook_links_run_entity_idx" ON "brain_playbook_links" USING btree ("run_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "brain_playbook_links_client_entity_idx" ON "brain_playbook_links" USING btree ("client_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_playbook_run_steps_run_step_idx" ON "brain_playbook_run_steps" USING btree ("run_id","step_id");--> statement-breakpoint
CREATE INDEX "brain_playbook_run_steps_status_idx" ON "brain_playbook_run_steps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "brain_playbook_run_steps_wait_until_idx" ON "brain_playbook_run_steps" USING btree ("wait_until");--> statement-breakpoint
CREATE INDEX "brain_playbook_runs_client_status_idx" ON "brain_playbook_runs" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "brain_playbook_runs_playbook_idx" ON "brain_playbook_runs" USING btree ("playbook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_playbook_steps_playbook_key_idx" ON "brain_playbook_steps" USING btree ("playbook_id","key");--> statement-breakpoint
CREATE INDEX "brain_playbook_steps_playbook_idx" ON "brain_playbook_steps" USING btree ("playbook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_playbooks_client_slug_idx" ON "brain_playbooks" USING btree ("client_id","slug");--> statement-breakpoint
CREATE INDEX "brain_playbooks_client_status_idx" ON "brain_playbooks" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_topics_client_slug_idx" ON "brain_topics" USING btree ("client_id","slug");--> statement-breakpoint
CREATE INDEX "brain_topics_client_parent_idx" ON "brain_topics" USING btree ("client_id","parent_id");--> statement-breakpoint
CREATE INDEX "brain_topics_path_idx" ON "brain_topics" USING btree ("path");--> statement-breakpoint
CREATE INDEX "designs_website_idx" ON "designs" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "designs_customer_idx" ON "designs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "designs_session_idx" ON "designs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "designs_product_idx" ON "designs" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "designs_template_idx" ON "designs" USING btree ("is_template");--> statement-breakpoint
CREATE UNIQUE INDEX "easypost_events_event_id_idx" ON "easypost_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "easypost_events_order_id_idx" ON "easypost_events" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_design_surfaces_product_slug_idx" ON "product_design_surfaces" USING btree ("product_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "product_designs_uuid_idx" ON "product_designs" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX "product_designs_website_customer_idx" ON "product_designs" USING btree ("website_id","customer_id");--> statement-breakpoint
CREATE INDEX "product_designs_website_session_idx" ON "product_designs" USING btree ("website_id","session_id");--> statement-breakpoint
CREATE INDEX "email_renders_campaign_hash_idx" ON "email_renders" USING btree ("campaign_id","blocks_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_email_sequence_sends_sequence_response_idx" ON "survey_email_sequence_sends" USING btree ("sequence_id","survey_response_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_rollups_day_client_tool_uq" ON "mcp_tool_call_daily_rollups" USING btree ("day","client_id","tool_name");--> statement-breakpoint
CREATE INDEX "mcp_rollups_day_idx" ON "mcp_tool_call_daily_rollups" USING btree ("day");--> statement-breakpoint
CREATE INDEX "mcp_rollups_client_day_idx" ON "mcp_tool_call_daily_rollups" USING btree ("client_id","day");--> statement-breakpoint
CREATE INDEX "mcp_tool_calls_client_created_idx" ON "mcp_tool_calls" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "mcp_tool_calls_tool_created_idx" ON "mcp_tool_calls" USING btree ("tool_name","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "microsoft_teams_user_connections_client_user_unique" ON "microsoft_teams_user_connections" USING btree ("client_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "microsoft_teams_user_connections_subscription_id" ON "microsoft_teams_user_connections" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "client_api_keys_client_id_idx" ON "client_api_keys" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_api_keys_provider_idx" ON "client_api_keys" USING btree ("client_id","provider");--> statement-breakpoint
CREATE INDEX "metered_subscription_items_client_status_resource_idx" ON "metered_subscription_items" USING btree ("client_id","status","resource");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_billing_periods_client_period_resource_unique" ON "usage_billing_periods" USING btree ("client_id","period","resource");--> statement-breakpoint
CREATE INDEX "usage_meter_events_client_period_resource_idx" ON "usage_meter_events" USING btree ("client_id","period","resource");--> statement-breakpoint
CREATE INDEX "trigger_link_clicks_link_id_occurred_at_idx" ON "trigger_link_clicks" USING btree ("link_id","occurred_at");--> statement-breakpoint
CREATE INDEX "trigger_link_clicks_client_id_idx" ON "trigger_link_clicks" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "trigger_links_client_id_idx" ON "trigger_links" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ab_assignments_experiment_visitor_idx" ON "ab_assignments" USING btree ("experiment_id","visitor_id");--> statement-breakpoint
CREATE INDEX "ab_events_experiment_occurred_idx" ON "ab_events" USING btree ("experiment_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ab_events_experiment_visitor_kind_idx" ON "ab_events" USING btree ("experiment_id","visitor_id","kind");--> statement-breakpoint
CREATE INDEX "ab_experiments_post_idx" ON "ab_experiments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "ab_experiments_status_idx" ON "ab_experiments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ab_experiments_target_idx" ON "ab_experiments" USING btree ("target_type","target_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ab_variants_experiment_key_idx" ON "ab_variants" USING btree ("experiment_id","key");--> statement-breakpoint
CREATE INDEX "chat_conversations_inbox_idx" ON "chat_conversations" USING btree ("client_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "chat_conversations_widget_visitor_idx" ON "chat_conversations" USING btree ("widget_id","visitor_id");--> statement-breakpoint
CREATE INDEX "chat_messages_conv_occurred_idx" ON "chat_messages" USING btree ("conversation_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_widgets_site_idx" ON "chat_widgets" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "agentic_os_runs_created_at_idx" ON "agentic_os_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agentic_os_runs_skill_id_idx" ON "agentic_os_runs" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "agentic_os_runs_status_idx" ON "agentic_os_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "postcaptain_briefs_client_idx" ON "postcaptain_briefs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "postcaptain_briefs_run_idx" ON "postcaptain_briefs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "postcaptain_drafts_client_idx" ON "postcaptain_drafts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "postcaptain_drafts_run_idx" ON "postcaptain_drafts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "registered_app_callbacks_audit_app_client_idx" ON "registered_app_callbacks_audit" USING btree ("app_id","client_id");--> statement-breakpoint
CREATE INDEX "registered_app_callbacks_audit_ts_idx" ON "registered_app_callbacks_audit" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "registered_app_jobs_app_client_idx" ON "registered_app_jobs" USING btree ("app_id","client_id");--> statement-breakpoint
CREATE INDEX "registered_app_jobs_next_run_at_idx" ON "registered_app_jobs" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "registered_app_jobs_enabled_next_run_at_idx" ON "registered_app_jobs" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "registered_app_runs_app_client_idx" ON "registered_app_runs" USING btree ("app_id","client_id");--> statement-breakpoint
CREATE INDEX "registered_app_runs_status_idx" ON "registered_app_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "registered_app_runs_job_idx" ON "registered_app_runs" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registered_app_signing_keys_app_kid_uq" ON "registered_app_signing_keys" USING btree ("app_id","kid");--> statement-breakpoint
CREATE INDEX "registered_app_signing_keys_app_status_idx" ON "registered_app_signing_keys" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "magamommy_briefs_website_idx" ON "magamommy_briefs" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "magamommy_briefs_week_idx" ON "magamommy_briefs" USING btree ("week_of");--> statement-breakpoint
CREATE INDEX "magamommy_concepts_website_idx" ON "magamommy_concepts" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "magamommy_concepts_brief_idx" ON "magamommy_concepts" USING btree ("brief_id");--> statement-breakpoint
CREATE UNIQUE INDEX "magamommy_drops_site_week_uidx" ON "magamommy_drops" USING btree ("website_id","week_of");--> statement-breakpoint
CREATE INDEX "magamommy_drops_status_idx" ON "magamommy_drops" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "publishing_campaigns_client_slug_idx" ON "publishing_campaigns" USING btree ("client_id","slug");--> statement-breakpoint
CREATE INDEX "publishing_campaigns_client_status_idx" ON "publishing_campaigns" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "publishing_permissions_client_user_key_idx" ON "publishing_permissions" USING btree ("client_id","user_id","permission_key");--> statement-breakpoint
CREATE INDEX "publishing_permissions_client_user_idx" ON "publishing_permissions" USING btree ("client_id","user_id");--> statement-breakpoint
ALTER TABLE "client_websites" ADD CONSTRAINT "client_websites_draft_updated_by_users_id_fk" FOREIGN KEY ("draft_updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_ai_review_items" ADD CONSTRAINT "brain_ai_review_items_suggested_reviewer_person_id_brain_people_id_fk" FOREIGN KEY ("suggested_reviewer_person_id") REFERENCES "public"."brain_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD CONSTRAINT "survey_webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_owner_client_id_clients_id_fk" FOREIGN KEY ("owner_client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_members_user_idx" ON "client_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_members_client_user_idx" ON "client_members" USING btree ("client_id","user_id");--> statement-breakpoint
CREATE INDEX "client_services_client_status_created_idx" ON "client_services" USING btree ("client_id","status","created_at");--> statement-breakpoint
CREATE INDEX "client_services_client_status_idx" ON "client_services" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "client_websites_client_idx" ON "client_websites" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_websites_subdomain_idx" ON "client_websites" USING btree ("subdomain");--> statement-breakpoint
CREATE INDEX "client_websites_created_idx" ON "client_websites" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "service_requests_client_status_created_idx" ON "service_requests" USING btree ("client_id","status","created_at");--> statement-breakpoint
CREATE INDEX "service_requests_client_status_idx" ON "service_requests" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "media_client_created_idx" ON "media" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_website_published_idx" ON "posts" USING btree ("website_id","published","published_at");--> statement-breakpoint
CREATE INDEX "posts_website_slug_idx" ON "posts" USING btree ("website_id","slug");--> statement-breakpoint
CREATE INDEX "crm_activities_client_deal_idx" ON "crm_activities" USING btree ("client_id","deal_id");--> statement-breakpoint
CREATE INDEX "crm_activities_client_contact_idx" ON "crm_activities" USING btree ("client_id","contact_id");--> statement-breakpoint
CREATE INDEX "crm_activities_client_created_idx" ON "crm_activities" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_companies_client_idx" ON "crm_companies" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "crm_companies_client_updated_idx" ON "crm_companies" USING btree ("client_id","updated_at");--> statement-breakpoint
CREATE INDEX "crm_companies_client_name_idx" ON "crm_companies" USING btree ("client_id","name");--> statement-breakpoint
CREATE INDEX "crm_contacts_client_idx" ON "crm_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "crm_contacts_client_company_idx" ON "crm_contacts" USING btree ("client_id","company_id");--> statement-breakpoint
CREATE INDEX "crm_contacts_client_email_idx" ON "crm_contacts" USING btree ("client_id","email");--> statement-breakpoint
CREATE INDEX "crm_contacts_client_updated_idx" ON "crm_contacts" USING btree ("client_id","updated_at");--> statement-breakpoint
CREATE INDEX "crm_deals_client_idx" ON "crm_deals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "crm_deals_client_stage_idx" ON "crm_deals" USING btree ("client_id","stage_id");--> statement-breakpoint
CREATE INDEX "crm_deals_client_owner_idx" ON "crm_deals" USING btree ("client_id","owner_id");--> statement-breakpoint
CREATE INDEX "crm_deals_client_updated_idx" ON "crm_deals" USING btree ("client_id","updated_at");--> statement-breakpoint
CREATE INDEX "kanban_card_activities_card_idx" ON "kanban_card_activities" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "kanban_card_activities_card_created_idx" ON "kanban_card_activities" USING btree ("card_id","created_at");--> statement-breakpoint
CREATE INDEX "kanban_card_artifacts_card_idx" ON "kanban_card_artifacts" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "kanban_card_checklist_items_card_idx" ON "kanban_card_checklist_items" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "kanban_card_comments_card_idx" ON "kanban_card_comments" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "kanban_card_comments_card_created_idx" ON "kanban_card_comments" USING btree ("card_id","created_at");--> statement-breakpoint
CREATE INDEX "kanban_card_dependencies_blocker_idx" ON "kanban_card_dependencies" USING btree ("blocker_card_id");--> statement-breakpoint
CREATE INDEX "kanban_card_files_card_idx" ON "kanban_card_files" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "kanban_card_time_logs_card_idx" ON "kanban_card_time_logs" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "kanban_cards_campaign_idx" ON "kanban_cards" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "kanban_cards_scheduled_for_idx" ON "kanban_cards" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "kanban_cards_project_idx" ON "kanban_cards" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "kanban_cards_column_idx" ON "kanban_cards" USING btree ("column_id");--> statement-breakpoint
CREATE INDEX "kanban_cards_project_column_order_idx" ON "kanban_cards" USING btree ("project_id","column_id","order");--> statement-breakpoint
CREATE INDEX "kanban_cards_sprint_idx" ON "kanban_cards" USING btree ("sprint_id");--> statement-breakpoint
CREATE INDEX "kanban_cards_sprint_order_idx" ON "kanban_cards" USING btree ("sprint_id","sprint_order");--> statement-breakpoint
CREATE INDEX "kanban_columns_project_idx" ON "kanban_columns" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "kanban_columns_project_order_idx" ON "kanban_columns" USING btree ("project_id","order");--> statement-breakpoint
CREATE INDEX "kanban_labels_project_idx" ON "kanban_labels" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "projects_client_status_idx" ON "projects" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "projects_client_updated_idx" ON "projects" USING btree ("client_id","updated_at");--> statement-breakpoint
CREATE INDEX "sprints_project_idx" ON "sprints" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sprints_project_order_idx" ON "sprints" USING btree ("project_id","order");--> statement-breakpoint
CREATE INDEX "suggested_project_requests_client_status_created_idx" ON "suggested_project_requests" USING btree ("client_id","status","created_at");--> statement-breakpoint
CREATE INDEX "suggested_project_requests_client_status_idx" ON "suggested_project_requests" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "support_tickets_client_status_updated_idx" ON "support_tickets" USING btree ("client_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "support_tickets_updated_idx" ON "support_tickets" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "automation_rules_client_idx" ON "automation_rules" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "brain_ai_review_items_suggested_reviewer_idx" ON "brain_ai_review_items" USING btree ("suggested_reviewer_person_id");--> statement-breakpoint
CREATE INDEX "brain_ai_review_items_client_status_created_idx" ON "brain_ai_review_items" USING btree ("client_id","status","created_at");--> statement-breakpoint
CREATE INDEX "brain_ai_review_items_status_idx" ON "brain_ai_review_items" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_embedding_jobs_entity_unique_idx" ON "brain_embedding_jobs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "brain_embedding_jobs_status_idx" ON "brain_embedding_jobs" USING btree ("status","enqueued_at");--> statement-breakpoint
CREATE INDEX "brain_meetings_client_meeting_date_idx" ON "brain_meetings" USING btree ("client_id","meeting_date");--> statement-breakpoint
CREATE INDEX "brain_meetings_client_created_idx" ON "brain_meetings" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "brain_notes_client_updated_idx" ON "brain_notes" USING btree ("client_id","updated_at");--> statement-breakpoint
CREATE INDEX "brain_notes_client_company_idx" ON "brain_notes" USING btree ("client_id","company_id");--> statement-breakpoint
CREATE INDEX "brain_notes_client_deal_idx" ON "brain_notes" USING btree ("client_id","deal_id");--> statement-breakpoint
CREATE INDEX "brain_notes_client_pinned_idx" ON "brain_notes" USING btree ("client_id","pinned");--> statement-breakpoint
CREATE INDEX "brain_notes_status_idx" ON "brain_notes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "brain_relationship_overlays_client_company_idx" ON "brain_relationship_overlays" USING btree ("client_id","company_id");--> statement-breakpoint
CREATE INDEX "brain_relationship_overlays_client_deal_idx" ON "brain_relationship_overlays" USING btree ("client_id","deal_id");--> statement-breakpoint
CREATE INDEX "brain_tasks_client_status_due_idx" ON "brain_tasks" USING btree ("client_id","status","due_date");--> statement-breakpoint
CREATE INDEX "brain_tasks_client_owner_idx" ON "brain_tasks" USING btree ("client_id","owner_id");--> statement-breakpoint
CREATE INDEX "email_campaign_sends_campaign_idx" ON "email_campaign_sends" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "email_campaign_sends_subscriber_idx" ON "email_campaign_sends" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_campaign_sends_campaign_subscriber_uniq_idx" ON "email_campaign_sends" USING btree ("campaign_id","subscriber_id");--> statement-breakpoint
CREATE INDEX "email_campaigns_client_created_at_idx" ON "email_campaigns" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "email_campaigns_list_id_idx" ON "email_campaigns" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "email_campaigns_status_scheduled_at_idx" ON "email_campaigns" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "email_lists_client_id_idx" ON "email_lists" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "email_segments_client_id_idx" ON "email_segments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "email_subscriber_tag_assignments_subscriber_idx" ON "email_subscriber_tag_assignments" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "email_subscriber_tag_assignments_tag_idx" ON "email_subscriber_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "email_subscribers_list_id_idx" ON "email_subscribers" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "email_subscribers_list_status_idx" ON "email_subscribers" USING btree ("list_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "email_subscribers_list_email_uniq_idx" ON "email_subscribers" USING btree ("list_id","email");--> statement-breakpoint
CREATE INDEX "email_subscribers_list_subscribed_at_idx" ON "email_subscribers" USING btree ("list_id","subscribed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_partial_responses_survey_session_idx" ON "survey_partial_responses" USING btree ("survey_id","session_id");--> statement-breakpoint
CREATE INDEX "surveys_client_updated_idx" ON "surveys" USING btree ("client_id","updated_at");--> statement-breakpoint
CREATE INDEX "booking_pages_client_idx" ON "booking_pages" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bookings_client_idx" ON "bookings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bookings_booking_page_idx" ON "bookings" USING btree ("booking_page_id");--> statement-breakpoint
CREATE INDEX "bookings_start_status_idx" ON "bookings" USING btree ("start_time","status");--> statement-breakpoint
CREATE INDEX "invoices_client_status_created_idx" ON "invoices" USING btree ("client_id","status","created_at");--> statement-breakpoint
CREATE INDEX "mcp_pending_changes_client_status_created_idx" ON "mcp_pending_changes" USING btree ("client_id","status","created_at");--> statement-breakpoint
CREATE INDEX "mcp_pending_changes_status_idx" ON "mcp_pending_changes" USING btree ("status");--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "is_private";--> statement-breakpoint
ALTER TABLE "client_websites" ADD CONSTRAINT "client_websites_preview_code_unique" UNIQUE("preview_code");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_custom_domain_unique" UNIQUE("custom_domain");