CREATE TYPE "public"."agentic_os_run_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'cancelled', 'unavailable');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"website_id" integer NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_preview" varchar(32) NOT NULL,
	"name" varchar(100) NOT NULL,
	"scopes" json DEFAULT '[]'::json,
	"rate_limit_per_minute" integer DEFAULT 60,
	"active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "github_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"github_user_id" integer NOT NULL,
	"github_username" varchar(100) NOT NULL,
	"access_token" text NOT NULL,
	"scope" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "portal_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"key_hash" varchar(128) NOT NULL,
	"key_preview" varchar(20) NOT NULL,
	"scopes" json DEFAULT '[]'::json NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"require_cms_approval" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portal_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "user_dashboard_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_dashboard_preferences_user_id_client_id_unique" UNIQUE("user_id","client_id")
);
--> statement-breakpoint
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
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'editor' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"invite_token" varchar(255),
	"invite_expires_at" timestamp,
	"password_reset_token" varchar(255),
	"password_reset_expires" timestamp,
	"default_client_id" integer,
	"email_verified_at" timestamp,
	"email_verification_token" varchar(64),
	"email_verification_expires" timestamp,
	"google_id" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "client_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"invited_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"start_date" timestamp DEFAULT now(),
	"renewal_date" timestamp,
	"credits_granted_at" timestamp,
	"stripe_subscription_id" varchar(255),
	"notes" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_websites" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"domain" varchar(255),
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"subdomain" varchar(100),
	"github_repo_name" varchar(255),
	"github_repo_url" varchar(500),
	"deploy_branch" varchar(100) DEFAULT 'main',
	"vercel_project_id" varchar(255),
	"vercel_project_url" varchar(500),
	"vercel_domain" varchar(255),
	"deployment_status" varchar(50) DEFAULT 'pending',
	"last_deployed_at" timestamp,
	"provision_error" text,
	"log_api_key" varchar(64),
	"custom_layout" boolean DEFAULT false NOT NULL,
	"public_access" boolean DEFAULT false NOT NULL,
	"preview_code" varchar(64),
	"branding_profile_id" integer,
	"custom_css" text,
	"custom_js" text,
	"draft_custom_css" text,
	"draft_custom_js" text,
	"draft_updated_at" timestamp,
	"draft_updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_websites_preview_code_unique" UNIQUE("preview_code")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"company" varchar(255),
	"phone" varchar(50),
	"website" varchar(255),
	"address" text,
	"stripe_customer_id" varchar(255),
	"email_prefix" varchar(50),
	"default_website_id" integer,
	"notes" text,
	"custom_domain" varchar(255),
	"custom_domain_verified_at" timestamp,
	"custom_domain_verification_token" varchar(64),
	"white_label_enabled" boolean DEFAULT false NOT NULL,
	"agency_name" varchar(255),
	"agency_logo_url" varchar(500),
	"agency_primary_color" varchar(20),
	"brain_trial_until" timestamp,
	"billing_mode" varchar(20) DEFAULT 'agency' NOT NULL,
	"trial_used_at" timestamp,
	"billable_seats_override" integer,
	"comp_discount_percent" integer,
	"byok_eligible_override" boolean,
	"publishing_project_id" integer,
	"default_timezone" varchar(60) DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clients_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "clients_custom_domain_unique" UNIQUE("custom_domain")
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
CREATE TABLE "google_website_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"gsc_site_url" varchar(500),
	"ga_property_id" varchar(100),
	"ga_measurement_id" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_website_tokens_website_id_unique" UNIQUE("website_id")
);
--> statement-breakpoint
CREATE TABLE "hosted_sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"custom_domain" varchar(255),
	"railway_project_id" varchar(255),
	"railway_service_id" varchar(255),
	"railway_environment_id" varchar(255),
	"railway_domain" varchar(500),
	"status" varchar(50) DEFAULT 'provisioning' NOT NULL,
	"plan" varchar(50) DEFAULT 'starter' NOT NULL,
	"renewal_date" timestamp,
	"notes" text,
	"dns_instructions" json DEFAULT '[]'::json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "http_request_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"method" varchar(10) NOT NULL,
	"path" varchar(2000) NOT NULL,
	"status_code" integer NOT NULL,
	"duration" integer NOT NULL,
	"user_agent" varchar(500),
	"referer" varchar(500),
	"ip" varchar(45),
	"country" varchar(2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"answers" json,
	"message" text,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50) NOT NULL,
	"price" integer NOT NULL,
	"billing_cycle" varchar(20) DEFAULT 'once',
	"stripe_price_id" varchar(255),
	"stripe_product_id" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"features" json DEFAULT '[]'::json,
	"survey_fields" json DEFAULT '[]'::json,
	"included_ai_credits" integer DEFAULT 0 NOT NULL,
	"usage_limits" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "site_branding" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"logo_url" varchar(500),
	"logo_alt" varchar(255),
	"primary_color" varchar(20) DEFAULT '#2563eb',
	"secondary_color" varchar(20) DEFAULT '#1e40af',
	"accent_color" varchar(20) DEFAULT '#f59e0b',
	"background_color" varchar(20) DEFAULT '#ffffff',
	"text_color" varchar(20) DEFAULT '#111827',
	"nav_template" varchar(50) DEFAULT 'classic',
	"nav_position" varchar(20) DEFAULT 'top',
	"nav_background" varchar(20) DEFAULT '#ffffff',
	"nav_text_color" varchar(20) DEFAULT '#111827',
	"heading_font" varchar(255),
	"body_font" varchar(255),
	"typography" json,
	"logo_square_url" varchar(500),
	"logo_rect_url" varchar(500),
	"logo_text" varchar(255),
	"logo_icon_url" varchar(500),
	"border_radius" varchar(20) DEFAULT '8px',
	"link_color" varchar(20),
	"link_hover_color" varchar(20),
	"button_style" json,
	"favicon_url" varchar(500),
	"og_image_url" varchar(500),
	"dark_mode" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_branding_website_id_unique" UNIQUE("website_id")
);
--> statement-breakpoint
CREATE TABLE "site_navigation" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"label" varchar(255) NOT NULL,
	"href" varchar(500) NOT NULL,
	"parent_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"open_in_new_tab" boolean DEFAULT false NOT NULL,
	"is_button" boolean DEFAULT false NOT NULL,
	"description" text,
	"icon" varchar(100),
	"featured_image" varchar(500),
	"column_group" integer,
	"draft" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "site_webhook_deliveries" (
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
CREATE TABLE "site_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"url" varchar(500) NOT NULL,
	"secret" varchar(64),
	"events" json DEFAULT '["*"]'::json NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp,
	"last_status" integer,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"environment_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"snapshot" json NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_domains" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"domain" varchar(255) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_env_vars" (
	"id" serial PRIMARY KEY NOT NULL,
	"environment_id" integer NOT NULL,
	"key" varchar(255) NOT NULL,
	"value" text NOT NULL,
	"synced_to_vercel" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_environments" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"name" varchar(50) NOT NULL,
	"vercel_target" varchar(50) NOT NULL,
	"preview_url" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_template_usages" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"post_id" integer NOT NULL,
	"block_path" varchar(255) NOT NULL,
	"synced_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100) DEFAULT 'custom' NOT NULL,
	"scope" varchar(50) DEFAULT 'block' NOT NULL,
	"blocks" json NOT NULL,
	"thumbnail" varchar(500),
	"tags" json DEFAULT '[]'::json,
	"locked_fields" json DEFAULT '[]'::json,
	"client_id" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"draft" json,
	"parent_template_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "block_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "branding_messaging" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"branding_profile_id" integer,
	"company_name" varchar(255),
	"tagline" varchar(500),
	"mission_statement" text,
	"vision_statement" text,
	"value_proposition" text,
	"tone_of_voice" varchar(255),
	"brand_personality" text,
	"writing_style" text,
	"elevator_pitch" text,
	"boilerplate" text,
	"key_differentiators" json,
	"target_audience" text,
	"industry" varchar(255),
	"year_founded" varchar(10),
	"company_size" varchar(100),
	"headquarters" varchar(255),
	"website_url" varchar(500),
	"social_proof" text,
	"key_clients" text,
	"certifications" text,
	"additional_context" text,
	"tone_axes" json,
	"voice_samples" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branding_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"primary_color" varchar(20) DEFAULT '#2563eb',
	"secondary_color" varchar(20) DEFAULT '#1e40af',
	"accent_color" varchar(20) DEFAULT '#f59e0b',
	"background_color" varchar(20) DEFAULT '#ffffff',
	"text_color" varchar(20) DEFAULT '#111827',
	"nav_template" varchar(50) DEFAULT 'classic',
	"nav_position" varchar(20) DEFAULT 'top',
	"nav_background" varchar(20) DEFAULT '#ffffff',
	"nav_text_color" varchar(20) DEFAULT '#111827',
	"heading_font" varchar(255),
	"body_font" varchar(255),
	"typography" json,
	"logo_url" varchar(500),
	"logo_alt" varchar(255),
	"logo_square_url" varchar(500),
	"logo_rect_url" varchar(500),
	"logo_text" varchar(255),
	"logo_icon_url" varchar(500),
	"border_radius" varchar(20) DEFAULT '8px',
	"link_color" varchar(20),
	"link_hover_color" varchar(20),
	"button_style" json,
	"button_presets" json,
	"favicon_url" varchar(500),
	"og_image_url" varchar(500),
	"dark_mode" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"color" varchar(7),
	"website_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_type_id" integer NOT NULL,
	"parent_id" integer,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"field_type" varchar(50) NOT NULL,
	"options" json,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"help_text" text,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" varchar(255) NOT NULL,
	"stored_filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"url" varchar(500) NOT NULL,
	"thumbnail_url" varchar(500),
	"alt" text,
	"caption" text,
	"version" integer DEFAULT 1 NOT NULL,
	"uploaded_by" integer,
	"client_id" integer,
	"website_id" integer,
	"branding_profile_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_id" integer NOT NULL,
	"version" integer NOT NULL,
	"filename" varchar(255) NOT NULL,
	"stored_filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"url" varchar(500) NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"category_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_custom_field_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"custom_field_id" integer NOT NULL,
	"value" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"content" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"trigger" varchar(20) NOT NULL,
	"created_by" integer,
	"content_hash" varchar(16),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"tag_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_taxonomy_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"term_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50) DEFAULT 'article',
	"active" boolean DEFAULT true NOT NULL,
	"website_id" integer,
	"custom_css" text,
	"custom_js" text,
	"template" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"post_type" varchar(50) DEFAULT 'blog' NOT NULL,
	"excerpt" text,
	"content" text NOT NULL,
	"cover_image" varchar(500),
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"scheduled_publish_at" timestamp,
	"seo_title" varchar(255),
	"seo_description" text,
	"og_image" varchar(500),
	"no_index" boolean DEFAULT false NOT NULL,
	"canonical_url" varchar(500),
	"custom_css" text,
	"custom_js" text,
	"website_id" integer,
	"parent_post_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"website_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50) DEFAULT 'label',
	"hierarchical" boolean DEFAULT false NOT NULL,
	"website_id" integer,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"taxonomy_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"color" varchar(7),
	"parent_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"contact_id" integer,
	"deal_id" integer,
	"company_id" integer,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"due_date" timestamp,
	"completed_at" timestamp,
	"created_by" integer,
	"via_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"domain" varchar(255),
	"industry" varchar(100),
	"size" varchar(50),
	"phone" varchar(50),
	"address" text,
	"website" varchar(500),
	"logo_url" varchar(1000),
	"notes" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"description" text,
	"revenue" varchar(100),
	"employee_count" integer,
	"founded_year" integer,
	"linkedin_url" varchar(500),
	"twitter_url" varchar(500),
	"facebook_url" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contact_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"tag_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"company_id" integer,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100),
	"email" varchar(255),
	"phone" varchar(50),
	"linkedin_url" varchar(500),
	"title" varchar(150),
	"source" varchar(100),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"avatar_url" varchar(500),
	"address" text,
	"notes" text,
	"last_contacted_at" timestamp,
	"owner_id" integer,
	"score" integer DEFAULT 0 NOT NULL,
	"seniority" varchar(100),
	"department" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contract_signers" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(100) DEFAULT 'signer' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"token" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"signature_name" varchar(255),
	"signature_data" text,
	"signed_at" timestamp,
	"signed_ip" varchar(45),
	"viewed_at" timestamp,
	"declined_at" timestamp,
	"decline_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_contract_signers_token_unique" UNIQUE("token")
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
CREATE TABLE "crm_contract_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"clauses" json DEFAULT '[]'::json,
	"line_items" json DEFAULT '[]'::json,
	"fees" json DEFAULT '[]'::json,
	"accent_color" varchar(20) DEFAULT '#2563eb',
	"footer_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"proposal_id" integer,
	"deal_id" integer,
	"contact_id" integer,
	"company_id" integer,
	"title" varchar(255) NOT NULL,
	"summary" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"clauses" json DEFAULT '[]'::json,
	"line_items" json DEFAULT '[]'::json,
	"fees" json DEFAULT '[]'::json,
	"currency" varchar(3) DEFAULT 'USD',
	"valid_until" timestamp,
	"client_token" varchar(64) NOT NULL,
	"document_hash" varchar(64),
	"accent_color" varchar(20) DEFAULT '#2563eb',
	"logo_url" varchar(500),
	"footer_text" text,
	"sent_at" timestamp,
	"fully_executed_at" timestamp,
	"voided_at" timestamp,
	"void_reason" text,
	"created_by" integer,
	"esign_provider" varchar(20),
	"esign_provider_request_id" varchar(255),
	"esign_signer_email" varchar(255),
	"esign_signer_name" varchar(255),
	"esign_status" varchar(20) DEFAULT 'not_sent',
	"esign_sent_at" timestamp,
	"esign_signed_at" timestamp,
	"esign_declined_at" timestamp,
	"esign_last_reminder_at" timestamp,
	"esign_reminder_count" integer DEFAULT 0 NOT NULL,
	"esign_audit_file_url" text,
	"esign_webhook_events" json DEFAULT '[]'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_contracts_client_token_unique" UNIQUE("client_token")
);
--> statement-breakpoint
CREATE TABLE "crm_custom_field_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"custom_field_id" integer NOT NULL,
	"entity_id" integer NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"value" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"field_name" varchar(100) NOT NULL,
	"field_type" varchar(20) NOT NULL,
	"options" json,
	"required" boolean DEFAULT false NOT NULL,
	"filterable" boolean DEFAULT false NOT NULL,
	"category" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deal_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"artifact_type" varchar(50) NOT NULL,
	"artifact_id" integer NOT NULL,
	"display_title" varchar(255) NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deal_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"body" text NOT NULL,
	"attachments" json DEFAULT '[]'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"pipeline_id" integer NOT NULL,
	"stage_id" integer NOT NULL,
	"contact_id" integer,
	"company_id" integer,
	"title" varchar(255) NOT NULL,
	"value" integer,
	"currency" varchar(3) DEFAULT 'USD',
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium',
	"expected_close_date" timestamp,
	"closed_at" timestamp,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"recurring_value" integer,
	"billing_cycle" varchar(20),
	"owner_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_email_messages" (
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
--> statement-breakpoint
CREATE TABLE "crm_enrichment_config" (
	"client_id" integer PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"key_source" varchar(20) DEFAULT 'platform' NOT NULL,
	"own_api_key" varchar(500),
	"platform_credit_balance" integer DEFAULT 0 NOT NULL,
	"cost_per_enrichment" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_enrichment_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"fields_populated" json DEFAULT '[]'::json,
	"field_changes" json DEFAULT '{}'::json,
	"cost" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"entity_type" varchar(20),
	"entity_id" integer,
	"read" boolean DEFAULT false NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipeline_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"pipeline_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT '#6366f1',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"probability" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipelines" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_proposal_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"sections" json DEFAULT '[]'::json,
	"line_items" json DEFAULT '[]'::json,
	"fees" json DEFAULT '[]'::json,
	"accent_color" varchar(20) DEFAULT '#2563eb',
	"footer_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"contact_id" integer,
	"company_id" integer,
	"deal_id" integer,
	"title" varchar(255) NOT NULL,
	"summary" text,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"sections" json DEFAULT '[]'::json,
	"line_items" json DEFAULT '[]'::json,
	"fees" json DEFAULT '[]'::json,
	"currency" varchar(3) DEFAULT 'USD',
	"valid_until" timestamp,
	"client_token" varchar(64) NOT NULL,
	"signature_name" varchar(255),
	"signature_data" text,
	"signed_at" timestamp,
	"signed_ip" varchar(45),
	"sent_at" timestamp,
	"first_viewed_at" timestamp,
	"last_viewed_at" timestamp,
	"view_count" integer DEFAULT 0 NOT NULL,
	"accepted_at" timestamp,
	"declined_at" timestamp,
	"decline_reason" text,
	"accent_color" varchar(20) DEFAULT '#2563eb',
	"logo_url" varchar(500),
	"cover_image_url" varchar(500),
	"footer_text" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_proposals_client_token_unique" UNIQUE("client_token")
);
--> statement-breakpoint
CREATE TABLE "crm_saved_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"filters" json NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_scoring_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"points" integer NOT NULL,
	"description" varchar(255),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_sequence_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"sequence_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"last_sent_at" timestamp,
	"halted_reason" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "crm_sequence_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"enrollment_id" integer NOT NULL,
	"step_id" integer NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"resend_email_id" varchar(255),
	"error" text
);
--> statement-breakpoint
CREATE TABLE "crm_sequence_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"sequence_id" integer NOT NULL,
	"step_order" integer NOT NULL,
	"delay_hours" integer DEFAULT 0 NOT NULL,
	"subject" varchar(500) NOT NULL,
	"body_html" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT '#6366f1',
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "kanban_card_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"user_id" integer,
	"type" varchar(50) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_card_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"artifact_type" varchar(50) NOT NULL,
	"artifact_id" integer NOT NULL,
	"display_title" varchar(255) NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_card_assignees" (
	"card_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kanban_card_assignees_card_id_user_id_pk" PRIMARY KEY("card_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "kanban_card_checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"text" varchar(500) NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"completed_by" integer,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_card_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"user_id" integer,
	"body" text NOT NULL,
	"mentions" json DEFAULT '[]'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_card_dependencies" (
	"blocked_card_id" integer NOT NULL,
	"blocker_card_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kanban_card_dependencies_blocked_card_id_blocker_card_id_pk" PRIMARY KEY("blocked_card_id","blocker_card_id")
);
--> statement-breakpoint
CREATE TABLE "kanban_card_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"comment_id" integer,
	"user_id" integer,
	"original_name" varchar(255) NOT NULL,
	"stored_filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"url" varchar(500) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_card_labels" (
	"card_id" integer NOT NULL,
	"label_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kanban_card_labels_card_id_label_id_pk" PRIMARY KEY("card_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "kanban_card_time_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"user_id" integer,
	"minutes" integer NOT NULL,
	"note" text,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_card_watchers" (
	"card_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kanban_card_watchers_card_id_user_id_pk" PRIMARY KEY("card_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "kanban_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"column_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"number" integer,
	"title" varchar(255) NOT NULL,
	"description" text,
	"due_date" timestamp,
	"priority" varchar(20) DEFAULT 'medium',
	"order" integer DEFAULT 0 NOT NULL,
	"sprint_id" integer,
	"sprint_order" integer,
	"story_points" integer,
	"card_type" varchar(20) DEFAULT 'task' NOT NULL,
	"parent_card_id" integer,
	"workflow_state" varchar(20) DEFAULT 'todo' NOT NULL,
	"campaign_id" integer,
	"scheduled_for" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_columns" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"color" varchar(7),
	"is_done" boolean DEFAULT false NOT NULL,
	"wip_limit" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" varchar(50) NOT NULL,
	"color" varchar(7) DEFAULT '#6366f1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "project_webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_id" integer NOT NULL,
	"event" varchar(50) NOT NULL,
	"status" integer,
	"error" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"url" varchar(500) NOT NULL,
	"secret" varchar(64) NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp,
	"last_status" integer,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"project_key" varchar(10),
	"client_id" integer NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"system_kind" varchar(30),
	"start_date" timestamp,
	"due_date" timestamp,
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
CREATE TABLE "sprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"goal" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"status" varchar(20) DEFAULT 'planning' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggested_project_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"suggested_project_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"answers" json,
	"message" text,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggested_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100) DEFAULT 'development' NOT NULL,
	"estimated_price" integer,
	"estimated_timeline" varchar(100),
	"features" json DEFAULT '[]'::json,
	"icon" varchar(50) DEFAULT 'rocket_launch' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"client_id" integer,
	"order" integer DEFAULT 0 NOT NULL,
	"survey_fields" json DEFAULT '[]'::json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"client_id" integer NOT NULL,
	"project_id" integer,
	"subject" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"category" varchar(50) DEFAULT 'general',
	"assigned_to" integer,
	"created_by" integer,
	"resolved_at" timestamp,
	"csat_score" integer,
	"csat_comment" text,
	"csat_submitted_at" timestamp,
	"first_response_due_at" timestamp,
	"first_response_at" timestamp,
	"resolution_due_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"attachments" json DEFAULT '[]'::json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_action_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer,
	"source" varchar(20) NOT NULL,
	"tool" varchar(100) NOT NULL,
	"scope_required" varchar(50),
	"scope_allowed" boolean,
	"params_hash" text NOT NULL,
	"outcome" varchar(20) NOT NULL,
	"error_message" text,
	"rule_id" integer,
	"key_id" integer,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"rule_id" integer NOT NULL,
	"trigger_event" varchar(100) NOT NULL,
	"trigger_payload" json,
	"actions_executed" json DEFAULT '[]'::json,
	"status" varchar(20) DEFAULT 'success' NOT NULL,
	"duration" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"trigger" json NOT NULL,
	"conditions" json DEFAULT '[]'::json,
	"actions" json NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"source" varchar(20) DEFAULT 'nlp' NOT NULL,
	"product_scope" varchar(50),
	"scopes" json DEFAULT '[]'::json NOT NULL,
	"schedule" json,
	"next_run_at" timestamp with time zone,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"last_executed_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_ai_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"job_type" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"input" json DEFAULT '{}'::json,
	"output" json DEFAULT '{}'::json,
	"error" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "brain_ai_review_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"source_type" varchar(50) NOT NULL,
	"source_id" integer NOT NULL,
	"proposed_type" varchar(50) NOT NULL,
	"proposed_payload" json NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"result_entity_type" varchar(50),
	"result_entity_id" integer,
	"suggested_reviewer_person_id" integer,
	"suggested_reviewer_score" integer,
	"suggested_reviewer_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"actor_id" integer,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" integer,
	"metadata" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_calendar_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
	"location" varchar(500),
	"link" varchar(1000),
	"related_task_id" integer,
	"related_meeting_id" integer,
	"related_relationship_overlay_id" integer,
	"source" varchar(20) DEFAULT 'manual' NOT NULL,
	"google_event_id" varchar(255),
	"google_calendar_id" varchar(255),
	"last_synced_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_custom_field_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"custom_field_id" integer NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" integer NOT NULL,
	"value" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"field_name" varchar(100) NOT NULL,
	"field_label" varchar(150),
	"field_type" varchar(20) NOT NULL,
	"options" json,
	"required" boolean DEFAULT false NOT NULL,
	"filterable" boolean DEFAULT false NOT NULL,
	"category" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "brain_embedding_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"enqueued_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp
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
CREATE TABLE "brain_kb_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"from_note_id" integer NOT NULL,
	"to_note_id" integer,
	"raw_target" varchar(500) NOT NULL,
	"anchor" varchar(255),
	"display_text" varchar(500),
	"link_type" varchar(20) DEFAULT 'wikilink' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_meeting_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer NOT NULL,
	"contact_id" integer,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"role_in_meeting" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"company_id" integer,
	"deal_id" integer,
	"title" varchar(255) NOT NULL,
	"meeting_date" timestamp,
	"transcript" text,
	"ai_summary" text,
	"human_summary" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"confidentiality_level" varchar(20) DEFAULT 'standard' NOT NULL,
	"source" varchar(50) DEFAULT 'paste' NOT NULL,
	"source_ref" varchar(500) NOT NULL,
	"source_metadata" json DEFAULT '{}'::json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_note_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(150) NOT NULL,
	"body" text NOT NULL,
	"trigger" varchar(50) DEFAULT 'manual' NOT NULL,
	"variables" json,
	"enabled" boolean DEFAULT true NOT NULL,
	"default_tags" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"meeting_id" integer,
	"relationship_overlay_id" integer,
	"company_id" integer,
	"deal_id" integer,
	"contact_id" integer,
	"tags" json DEFAULT '[]'::json NOT NULL,
	"confidentiality_level" varchar(20) DEFAULT 'standard' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"review_item_id" integer,
	"source_url" varchar(1000),
	"attachment_url" varchar(1000),
	"attachment_filename" varchar(500),
	"attachment_mime_type" varchar(200),
	"attachment_file_size" integer,
	"attachment_stored_key" varchar(500),
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
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
CREATE TABLE "brain_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"industry_template" varchar(50) DEFAULT 'generic' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"default_confidentiality" varchar(20) DEFAULT 'standard' NOT NULL,
	"ai_provider" varchar(50) DEFAULT 'anthropic' NOT NULL,
	"embedding_provider" varchar(50),
	"enabled_modules" json DEFAULT '{"meetings":true,"tasks":true,"prospects":false,"knowledge":true,"ask":false,"automations":true,"calendar":true}'::json NOT NULL,
	"service_lines" json DEFAULT '[]'::json NOT NULL,
	"agent_preferences" json DEFAULT '{}'::json NOT NULL,
	"email_ingest_token" varchar(64),
	"auto_process_email" boolean DEFAULT false NOT NULL,
	"auto_link_crm" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brain_profiles_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "brain_relationship_overlays" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"company_id" integer,
	"deal_id" integer,
	"relationship_type" varchar(50) DEFAULT 'generic' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"owner_id" integer,
	"secondary_owner_id" integer,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"service_lines" json DEFAULT '[]'::json NOT NULL,
	"summary" text,
	"current_priorities" text,
	"open_loops" text,
	"last_touch_at" timestamp,
	"next_review_at" timestamp,
	"confidentiality_level" varchar(20) DEFAULT 'standard' NOT NULL,
	"compliance_flags" json DEFAULT '[]'::json NOT NULL,
	"source_system" varchar(100),
	"external_url" varchar(1000),
	"stale_after_days" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_saved_searches" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer,
	"name" varchar(150) NOT NULL,
	"icon" varchar(50) DEFAULT 'bookmark' NOT NULL,
	"filters" json NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"meeting_id" integer,
	"company_id" integer,
	"deal_id" integer,
	"linked_kanban_card_id" integer,
	"title" varchar(500) NOT NULL,
	"description" text,
	"owner_id" integer,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"due_date" timestamp,
	"blocked_reason" text,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"created_by_ai" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"compliance_flag" boolean DEFAULT false NOT NULL,
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
CREATE TABLE "bulk_pricing_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"variant_id" integer,
	"min_quantity" integer NOT NULL,
	"max_quantity" integer,
	"price_type" varchar(20) DEFAULT 'fixed' NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"variant_id" integer,
	"design_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"customer_id" integer,
	"session_id" varchar(255),
	"customer_email" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"expires_at" timestamp,
	"recovery_token" varchar(100),
	"recovery_token_expires_at" timestamp,
	"recovery_email_sent_at" timestamp,
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
CREATE TABLE "discount_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"description" varchar(255),
	"discount_type" varchar(20) NOT NULL,
	"amount" integer NOT NULL,
	"min_order_amount" integer,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp,
	"expires_at" timestamp,
	"applicable_to" varchar(10) DEFAULT 'both' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
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
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer,
	"variant_id" integer,
	"design_id" uuid,
	"design_snapshot" jsonb,
	"print_ready_url" varchar(500),
	"product_name" varchar(255) NOT NULL,
	"variant_name" varchar(255),
	"sku" varchar(100),
	"unit_price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"total" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"note" text,
	"changed_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"customer_id" integer,
	"order_number" varchar(50) NOT NULL,
	"customer_email" varchar(255) NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_phone" varchar(50),
	"shipping_address" json,
	"billing_address" json,
	"subtotal" integer NOT NULL,
	"shipping_total" integer DEFAULT 0 NOT NULL,
	"tax_total" integer DEFAULT 0 NOT NULL,
	"discount_total" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"stripe_charge_id" varchar(255),
	"payment_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"shipping_method" varchar(255),
	"tracking_number" varchar(255),
	"tracking_url" varchar(500),
	"carrier" varchar(50),
	"easypost_shipment_id" varchar(255),
	"label_url" varchar(500),
	"label_cost_cents" integer,
	"label_purchased_at" timestamp,
	"latest_tracking_status" varchar(50),
	"latest_tracking_event_at" timestamp,
	"shipped_at" timestamp,
	"delivered_at" timestamp,
	"customer_note" text,
	"internal_note" text,
	"platform_fee" integer,
	"transfer_id" varchar(255),
	"discount_code" varchar(50),
	"printful_order_id" varchar(100),
	"printful_fulfillment_status" varchar(30),
	"printful_fulfillment_error" text,
	"printful_submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"stripe_payment_method_id" varchar(255) NOT NULL,
	"brand" varchar(50) NOT NULL,
	"last4" varchar(4) NOT NULL,
	"exp_month" integer NOT NULL,
	"exp_year" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printful_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer,
	"event_id" varchar(255) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"printful_order_id" varchar(100),
	"order_id" integer,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"image" varchar(500),
	"parent_id" integer,
	"order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"url" varchar(500) NOT NULL,
	"alt" varchar(255),
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_option_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"option_id" integer NOT NULL,
	"value" varchar(100) NOT NULL,
	"label" varchar(100),
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"sku" varchar(100),
	"barcode" varchar(100),
	"price" integer NOT NULL,
	"compare_at_price" integer,
	"cost_price" integer,
	"quantity" integer DEFAULT 0 NOT NULL,
	"weight" numeric(10, 2),
	"length_in" numeric(8, 2),
	"width_in" numeric(8, 2),
	"height_in" numeric(8, 2),
	"image" varchar(500),
	"option_values" json DEFAULT '[]'::json,
	"printful_variant_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"category_id" integer,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"short_description" varchar(500),
	"price" integer NOT NULL,
	"compare_at_price" integer,
	"cost_price" integer,
	"sku" varchar(100),
	"barcode" varchar(100),
	"track_inventory" boolean DEFAULT true NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"weight" numeric(10, 2),
	"weight_unit" varchar(5) DEFAULT 'g',
	"length_in" numeric(8, 2),
	"width_in" numeric(8, 2),
	"height_in" numeric(8, 2),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"is_designable" boolean DEFAULT false NOT NULL,
	"printful_variant_id" integer,
	"seo_title" varchar(255),
	"seo_description" text,
	"tags" json DEFAULT '[]'::json,
	"metadata" json,
	"designable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"zone_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"rate_type" varchar(20) DEFAULT 'flat' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"weight_tiers" json,
	"free_above" integer,
	"min_delivery_days" integer,
	"max_delivery_days" integer,
	"provider" varchar(20) DEFAULT 'manual' NOT NULL,
	"carrier_code" varchar(30),
	"service_code" varchar(60),
	"live_rate_only" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"countries" json DEFAULT '[]'::json,
	"states" json DEFAULT '[]'::json,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_customer_message_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"body" text NOT NULL,
	"is_staff" boolean DEFAULT false NOT NULL,
	"author_name" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_customer_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"order_id" integer,
	"subject" varchar(255) NOT NULL,
	"category" varchar(50) DEFAULT 'general' NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_customer_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_customer_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "store_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"first_name" varchar(100),
	"last_name" varchar(100),
	"phone" varchar(50),
	"avatar_url" varchar(500),
	"default_shipping_address" json,
	"default_billing_address" json,
	"address_book" json DEFAULT '[]'::json,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verify_token" varchar(100),
	"password_reset_token" varchar(100),
	"password_reset_expires" timestamp,
	"last_login_at" timestamp,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"total_spent" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_product_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"customer_id" integer,
	"order_id" integer,
	"rating" integer NOT NULL,
	"title" varchar(255),
	"body" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"store_name" varchar(255),
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT '0',
	"tax_inclusive" boolean DEFAULT false NOT NULL,
	"stripe_account_id" varchar(255),
	"stripe_onboarding_complete" boolean DEFAULT false NOT NULL,
	"stripe_mode" varchar(20) DEFAULT 'connect' NOT NULL,
	"stripe_byok_allowed" boolean DEFAULT false NOT NULL,
	"stripe_secret_key_encrypted" text,
	"stripe_publishable_key" varchar(255),
	"stripe_webhook_secret_encrypted" text,
	"payout_schedule" varchar(20) DEFAULT 'weekly',
	"platform_fee_percent" numeric(5, 2) DEFAULT '5.00',
	"requires_shipping" boolean DEFAULT true NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"order_prefix" varchar(10) DEFAULT 'ORD',
	"enable_reviews" boolean DEFAULT true NOT NULL,
	"enable_customer_accounts" boolean DEFAULT true NOT NULL,
	"enable_guest_checkout" boolean DEFAULT true NOT NULL,
	"enable_wishlist" boolean DEFAULT true NOT NULL,
	"enable_order_tracking" boolean DEFAULT true NOT NULL,
	"enable_customer_support" boolean DEFAULT true NOT NULL,
	"customer_portal_welcome_message" text,
	"support_email" varchar(255),
	"return_policy_url" varchar(500),
	"shipping_policy_url" varchar(500),
	"shipping_provider" varchar(20) DEFAULT 'manual' NOT NULL,
	"easypost_api_key_encrypted" text,
	"easypost_mode" varchar(10) DEFAULT 'test',
	"easypost_webhook_secret" varchar(255),
	"fulfillment_provider" varchar(20) DEFAULT 'manual' NOT NULL,
	"printful_api_key_encrypted" text,
	"printful_store_id" varchar(100),
	"ship_from_address" jsonb,
	"default_parcel_length_in" numeric(8, 2),
	"default_parcel_width_in" numeric(8, 2),
	"default_parcel_height_in" numeric(8, 2),
	"default_parcel_weight_oz" numeric(8, 2),
	"live_rates_fallback" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_settings_website_id_unique" UNIQUE("website_id")
);
--> statement-breakpoint
CREATE TABLE "store_wishlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"wishlist_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"variant_id" integer,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_wishlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"website_id" integer NOT NULL,
	"name" varchar(100) DEFAULT 'My Wishlist' NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_library_assets" (
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
CREATE TABLE "catalog_optins" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"catalog_product_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"inksoft_id" integer,
	"brand" varchar(100),
	"supplier_name" varchar(255),
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"long_description" text,
	"can_print" boolean DEFAULT false NOT NULL,
	"can_digital_print" boolean DEFAULT false NOT NULL,
	"can_screen_print" boolean DEFAULT false NOT NULL,
	"can_embroider" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"complete" boolean DEFAULT true NOT NULL,
	"seo_title" varchar(255),
	"seo_description" text,
	"seo_keywords" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_sides" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"inksoft_id" integer,
	"catalog_style_id" integer NOT NULL,
	"side" varchar(50) NOT NULL,
	"source_image_path" varchar(600),
	"image_url" varchar(500),
	"width" integer,
	"height" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_sizes" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"inksoft_id" integer,
	"catalog_style_id" integer NOT NULL,
	"name" varchar(100),
	"long_name" varchar(255),
	"unit_price_cents" integer,
	"weight" real,
	"in_stock" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_styles" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"inksoft_id" integer,
	"catalog_product_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"color_hex_1" varchar(7),
	"color_hex_2" varchar(7),
	"is_default" boolean DEFAULT false NOT NULL,
	"is_light_color" boolean DEFAULT false NOT NULL,
	"is_dark_color" boolean DEFAULT false NOT NULL,
	"is_heathered" boolean DEFAULT false NOT NULL,
	"unit_price_cents" integer,
	"source_image_path_front" varchar(600),
	"front_image_url" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_campaign_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"subscriber_id" integer NOT NULL,
	"resend_email_id" varchar(255),
	"ab_variant" varchar(10),
	"sent_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"bounced_at" timestamp,
	"complained_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"preview_text" varchar(255),
	"from_name" varchar(255) NOT NULL,
	"from_email" varchar(255) NOT NULL,
	"reply_to" varchar(255),
	"list_id" integer NOT NULL,
	"client_id" integer,
	"html_content" text NOT NULL,
	"block_content" json,
	"content_blocks" json,
	"use_block_editor" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"sent_at" timestamp,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_opened" integer DEFAULT 0 NOT NULL,
	"total_clicked" integer DEFAULT 0 NOT NULL,
	"total_bounced" integer DEFAULT 0 NOT NULL,
	"total_unsubscribed" integer DEFAULT 0 NOT NULL,
	"ab_enabled" boolean DEFAULT false NOT NULL,
	"ab_subject_b" varchar(255),
	"ab_winner_metric" varchar(20) DEFAULT 'open',
	"ab_test_size_pct" integer DEFAULT 10,
	"ab_winner_subject" varchar(255),
	"ab_decided_at" timestamp,
	"parent_campaign_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_journey_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"journey_id" integer NOT NULL,
	"subscriber_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"current_step_order" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "email_journey_step_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"enrollment_id" integer NOT NULL,
	"step_id" integer NOT NULL,
	"subscriber_id" integer NOT NULL,
	"resend_email_id" varchar(255),
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"opened_at" timestamp,
	"clicked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "email_journey_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"journey_id" integer NOT NULL,
	"step_order" integer NOT NULL,
	"step_type" varchar(20) NOT NULL,
	"config" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_journeys" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"trigger_type" varchar(30) DEFAULT 'manual' NOT NULL,
	"trigger_config" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"client_id" integer,
	"created_by" integer,
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
CREATE TABLE "email_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"rules" json DEFAULT '[]'::json,
	"match_type" varchar(10) DEFAULT 'all' NOT NULL,
	"subscriber_count" integer DEFAULT 0 NOT NULL,
	"last_calculated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_signup_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"list_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"embed_key" varchar(64) NOT NULL,
	"ask_name" boolean DEFAULT false NOT NULL,
	"redirect_url" varchar(500),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_signup_forms_embed_key_unique" UNIQUE("embed_key")
);
--> statement-breakpoint
CREATE TABLE "email_subscriber_tag_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscriber_id" integer NOT NULL,
	"tag_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_subscriber_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT '#6366f1',
	"subscriber_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"unsubscribe_token" varchar(64) NOT NULL,
	"metadata" json,
	"subscribed_at" timestamp DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_subscribers_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50) DEFAULT 'custom' NOT NULL,
	"subject" varchar(255),
	"html_content" text NOT NULL,
	"block_content" json,
	"thumbnail_url" varchar(500),
	"is_global" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"website_id" integer NOT NULL,
	"event" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"description" text,
	"html_content" text DEFAULT '' NOT NULL,
	"block_content" json,
	"variables" json DEFAULT '[]'::json,
	"branding_profile_id" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_ai_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"summary" text NOT NULL,
	"sentiment" varchar(20),
	"themes" json,
	"per_question" json,
	"response_count_at_generation" integer,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "survey_ai_summaries_survey_id_unique" UNIQUE("survey_id")
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
CREATE TABLE "survey_email_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body_html" text NOT NULL,
	"delay_hours" integer DEFAULT 0 NOT NULL,
	"condition_field" varchar(64),
	"condition_value" varchar(255),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_partial_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"answers" json DEFAULT '{}'::json NOT NULL,
	"last_page" integer DEFAULT 0 NOT NULL,
	"respondent_email" varchar(255),
	"source" varchar(30) DEFAULT 'link',
	"source_id" varchar(255),
	"ip_address" varchar(45),
	"user_agent" text,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"form_name" varchar(100) DEFAULT 'main' NOT NULL,
	"answers" json NOT NULL,
	"respondent_email" varchar(255),
	"respondent_name" varchar(255),
	"source" varchar(30) DEFAULT 'link' NOT NULL,
	"source_id" varchar(255),
	"ip_address" varchar(45),
	"user_agent" text,
	"completed_at" timestamp,
	"variant_id" integer,
	"score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"fields" json DEFAULT '[]'::json NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "survey_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"url" varchar(500) NOT NULL,
	"secret" varchar(64),
	"events" json DEFAULT '["response.submitted"]'::json NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp,
	"last_status" integer,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"fields" json DEFAULT '[]'::json,
	"pages" json DEFAULT '[{"title":"Page 1"}]'::json,
	"thank_you_title" varchar(255) DEFAULT 'Thank you!',
	"thank_you_message" text DEFAULT 'Your response has been recorded.',
	"redirect_url" varchar(500),
	"color" varchar(7) DEFAULT '#2563eb',
	"branding_profile_id" integer,
	"survey_styling" json DEFAULT '{}'::json,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"allow_multiple" boolean DEFAULT true NOT NULL,
	"require_email" boolean DEFAULT false NOT NULL,
	"publish_results" boolean DEFAULT false NOT NULL,
	"certificate_enabled" boolean DEFAULT false NOT NULL,
	"consent_field" varchar(64),
	"notify_on_response" boolean DEFAULT true NOT NULL,
	"notify_digest" varchar(10) DEFAULT 'off' NOT NULL,
	"closes_at" timestamp,
	"max_responses" integer,
	"linked_type" varchar(30),
	"linked_id" integer,
	"recommendation" json,
	"scoring_config" json,
	"response_count" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"parent_survey_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "surveys_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "booking_add_ons" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_page_id" integer NOT NULL,
	"source" varchar(10) DEFAULT 'custom' NOT NULL,
	"name" varchar(255),
	"description" text,
	"price" integer,
	"image" varchar(500),
	"product_id" integer,
	"variant_id" integer,
	"max_quantity" integer DEFAULT 10,
	"active" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
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
CREATE TABLE "booking_date_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_page_id" integer NOT NULL,
	"date" varchar(10) NOT NULL,
	"type" varchar(10) NOT NULL,
	"start_time" varchar(5),
	"end_time" varchar(5),
	"note" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_page_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_page_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"display_name" varchar(255),
	"color" varchar(7),
	"availability" json,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"website_id" integer,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"price" integer DEFAULT 0 NOT NULL,
	"price_label" varchar(100),
	"max_guests" integer,
	"duration" integer DEFAULT 30 NOT NULL,
	"buffer_before" integer DEFAULT 0 NOT NULL,
	"buffer_after" integer DEFAULT 15 NOT NULL,
	"max_advance_days" integer DEFAULT 60 NOT NULL,
	"min_notice_mins" integer DEFAULT 60 NOT NULL,
	"timezone" varchar(100) DEFAULT 'America/New_York' NOT NULL,
	"availability" json DEFAULT '[{"day":1,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":2,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":3,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":4,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":5,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":0,"startTime":"09:00","endTime":"17:00","enabled":false},{"day":6,"startTime":"09:00","endTime":"17:00","enabled":false}]'::json,
	"questions" json DEFAULT '[]'::json,
	"color" varchar(7) DEFAULT '#2563eb',
	"branding_profile_id" integer,
	"styling" json DEFAULT '{}'::json,
	"enable_add_ons" boolean DEFAULT false NOT NULL,
	"enable_gift_certificates" boolean DEFAULT false NOT NULL,
	"enable_discount_codes" boolean DEFAULT false NOT NULL,
	"enable_waivers" boolean DEFAULT false NOT NULL,
	"waiver_content" text,
	"require_waiver_before_booking" boolean DEFAULT false NOT NULL,
	"checkin_enabled" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"google_calendar_sync" boolean DEFAULT false NOT NULL,
	"conference_type" varchar(20) DEFAULT 'none' NOT NULL,
	"thumbnail" varchar(500),
	"allow_staff_selection" boolean DEFAULT false NOT NULL,
	"assigned_members" json DEFAULT '[]'::json,
	"assignment_mode" varchar(20) DEFAULT 'fixed' NOT NULL,
	"round_robin_pool" json,
	"booking_type" varchar(20) DEFAULT 'individual' NOT NULL,
	"group_capacity" integer,
	"reschedule_enabled" boolean DEFAULT true NOT NULL,
	"reschedule_window_hours" integer DEFAULT 24 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "booking_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"booking_page_id" integer,
	"slug" varchar(100) NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_email" varchar(255) NOT NULL,
	"customer_phone" varchar(50),
	"title" varchar(255) NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"line_items" json DEFAULT '[]'::json,
	"start_time" timestamp,
	"end_time" timestamp,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"paid_at" timestamp,
	"booking_id" integer,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_quotes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "booking_selected_add_ons" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"add_on_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"product_name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_waivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"booking_page_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"signer_name" varchar(255) NOT NULL,
	"signer_email" varchar(255) NOT NULL,
	"signature_data" text NOT NULL,
	"waiver_content" text NOT NULL,
	"ip_address" varchar(45),
	"signed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_page_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"guest_name" varchar(255) NOT NULL,
	"guest_email" varchar(255) NOT NULL,
	"guest_phone" varchar(50),
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"timezone" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'confirmed' NOT NULL,
	"answers" json,
	"notes" text,
	"google_event_id" varchar(255),
	"meeting_link" varchar(500),
	"cancel_token" varchar(64) NOT NULL,
	"cancelled_at" timestamp,
	"assigned_to" integer,
	"assigned_user_id" integer,
	"group_size" integer DEFAULT 1 NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"discount_total" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"discount_code" varchar(50),
	"gift_certificate_code" varchar(50),
	"gift_certificate_amount" integer DEFAULT 0 NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"payment_status" varchar(20) DEFAULT 'free' NOT NULL,
	"paid_at" timestamp,
	"checkin_code" varchar(10),
	"checked_in_at" timestamp,
	"checked_in_by" integer,
	"reminder_sent_at" timestamp,
	"reschedule_token" varchar(64),
	"previous_start_time" timestamp,
	"previous_end_time" timestamp,
	"reschedule_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reschedule_token_unique" UNIQUE("reschedule_token")
);
--> statement-breakpoint
CREATE TABLE "gift_certificate_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"gift_certificate_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"context" varchar(20) NOT NULL,
	"reference_id" integer,
	"reference_type" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"website_id" integer,
	"code" varchar(50) NOT NULL,
	"initial_amount" integer NOT NULL,
	"remaining_amount" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending_payment' NOT NULL,
	"purchaser_name" varchar(255) NOT NULL,
	"purchaser_email" varchar(255) NOT NULL,
	"recipient_name" varchar(255),
	"recipient_email" varchar(255),
	"personal_message" text,
	"stripe_payment_intent_id" varchar(255),
	"payment_status" varchar(20) DEFAULT 'pending',
	"redeemable_at" varchar(20) DEFAULT 'both' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gift_certificates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "google_calendar_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"calendar_id" varchar(255) DEFAULT 'primary' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_tokens_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "google_workspace_client_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"google_account_email" varchar(320) NOT NULL,
	"google_account_id" varchar(64) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sync_settings" jsonb DEFAULT '{"aggressiveness":"moderate","storeBodies":true}'::jsonb NOT NULL,
	"gmail_history_id" varchar(64),
	"drive_start_page_token" varchar(128),
	"calendar_sync_token" text,
	"contacts_sync_token" text,
	"last_sync_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_workspace_client_connections_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "google_workspace_tenant_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"google_project_id" varchar(64) NOT NULL,
	"oauth_client_id" text NOT NULL,
	"oauth_client_secret_encrypted" text NOT NULL,
	"oauth_redirect_uri" text NOT NULL,
	"pubsub_topic" text NOT NULL,
	"pubsub_verification_token" text NOT NULL,
	"consent_screen_user_type" varchar(16) DEFAULT 'internal' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"configured_by_user_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_workspace_tenant_credentials_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "google_workspace_user_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"google_account_email" varchar(320) NOT NULL,
	"google_account_id" varchar(64) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sync_settings" jsonb DEFAULT '{"aggressiveness":"passive","storeBodies":false}'::jsonb NOT NULL,
	"gmail_history_id" varchar(64),
	"gmail_watch_expiration" timestamp,
	"drive_start_page_token" varchar(128),
	"drive_channel_id" varchar(64),
	"drive_channel_resource_id" varchar(64),
	"drive_channel_expiration" timestamp,
	"drive_channel_token" varchar(64),
	"calendar_sync_token" text,
	"contacts_sync_token" text,
	"last_sync_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"total_request_bytes" bigint DEFAULT 0 NOT NULL,
	"total_response_bytes" bigint DEFAULT 0 NOT NULL,
	"total_estimated_tokens" bigint DEFAULT 0 NOT NULL,
	"total_duration_ms" bigint DEFAULT 0 NOT NULL,
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
CREATE TABLE "pitch_deck_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer NOT NULL,
	"slides" json NOT NULL,
	"theme" json NOT NULL,
	"format_version" integer DEFAULT 1 NOT NULL,
	"label" varchar(255),
	"trigger" varchar(50) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitch_deck_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer NOT NULL,
	"session_id" varchar(100),
	"slide_index" integer,
	"dwell_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitch_decks" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"slides" json DEFAULT '[]'::json,
	"format_version" integer DEFAULT 1 NOT NULL,
	"theme" json DEFAULT '{"primaryColor":"#2563eb","accentColor":"#60a5fa","backgroundColor":"#0f172a","textColor":"#f8fafc","headingFont":"Inter","bodyFont":"Inter"}'::json,
	"source_url" varchar(500),
	"branding_profile_id" integer,
	"seo_title" varchar(255),
	"seo_description" text,
	"og_image" varchar(500),
	"canonical_url" varchar(500),
	"no_index" boolean DEFAULT false NOT NULL,
	"parent_deck_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoom_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "zoom_tokens_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" varchar(255) DEFAULT 'New Conversation' NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"total_input_tokens" integer DEFAULT 0 NOT NULL,
	"total_output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_credit_balances" (
	"client_id" integer PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"monthly_grant" integer DEFAULT 0 NOT NULL,
	"pay_as_you_go" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_credit_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"description" text,
	"service_category" varchar(50),
	"reference_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_credit_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"tokens" integer NOT NULL,
	"price" integer NOT NULL,
	"stripe_price_id" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"tool_calls" json,
	"injected_by" integer,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "invoice_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"description" varchar(255) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"total" integer NOT NULL,
	"service_id" integer
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(50) NOT NULL,
	"client_id" integer NOT NULL,
	"project_id" integer,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"due_date" timestamp,
	"paid_at" timestamp,
	"stripe_payment_intent_id" varchar(255),
	"stripe_checkout_session_id" varchar(255),
	"subtotal" integer NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
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
CREATE TABLE "usage_alert_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"resource" varchar(50) NOT NULL,
	"period" varchar(7) NOT NULL,
	"level" varchar(20) NOT NULL,
	"usage_at_alert" numeric(18, 4) NOT NULL,
	"included_quantity" numeric(18, 4) NOT NULL,
	"notified_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "usage_meters" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"category" varchar(50) NOT NULL,
	"period" varchar(7) NOT NULL,
	"usage" integer DEFAULT 0 NOT NULL,
	"included" integer DEFAULT 0 NOT NULL,
	"overage_rate" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_thresholds" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"resource" varchar(50) NOT NULL,
	"warn_at_pct" integer DEFAULT 80 NOT NULL,
	"hard_limit_quantity" numeric(18, 4),
	"notify_email" boolean DEFAULT true NOT NULL,
	"notify_portal" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "mcp_pending_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer,
	"key_id" integer,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer,
	"operation" varchar(20) NOT NULL,
	"summary" varchar(500),
	"payload" json NOT NULL,
	"original_snapshot" json,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reviewer_id" integer,
	"reviewed_at" timestamp,
	"review_note" text,
	"applied_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_push_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"token" varchar(256) NOT NULL,
	"platform" varchar(16),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "device_push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_access_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"token_preview" varchar(24) NOT NULL,
	"oauth_client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"scopes" json NOT NULL,
	"resource" varchar(500),
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_hash" varchar(128) NOT NULL,
	"oauth_client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"scopes" json NOT NULL,
	"redirect_uri" varchar(500) NOT NULL,
	"code_challenge" varchar(256),
	"code_challenge_method" varchar(16),
	"resource" varchar(500),
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_authorization_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"client_name" varchar(200) NOT NULL,
	"redirect_uris" json NOT NULL,
	"client_uri" varchar(500),
	"logo_uri" varchar(500),
	"tos_uri" varchar(500),
	"policy_uri" varchar(500),
	"token_endpoint_auth_method" varchar(32) DEFAULT 'none' NOT NULL,
	"client_secret_hash" varchar(128),
	"client_secret_preview" varchar(32),
	"client_secret_created_at" timestamp,
	"client_secret_rotated_at" timestamp,
	"software_id" varchar(200),
	"software_version" varchar(64),
	"owner_client_id" integer,
	"owner_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"token_preview" varchar(24) NOT NULL,
	"oauth_client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"scopes" json NOT NULL,
	"resource" varchar(500),
	"family_id" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_refresh_tokens_token_hash_unique" UNIQUE("token_hash")
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
CREATE TABLE "agent_action_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"run_id" varchar(36),
	"api_key_id" integer,
	"user_id" integer,
	"tool_name" varchar(100) NOT NULL,
	"scope_used" varchar(100),
	"inputs_summary" jsonb,
	"output_summary" text,
	"status" varchar(20) NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"pending_change_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
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
	"client_id" integer,
	"run_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "content_briefs" (
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
CREATE TABLE "content_drafts" (
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
	"next_run_at" timestamp with time zone NOT NULL,
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
CREATE TABLE "eval_case_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"case_key" varchar(200) NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"aggregate" real DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"output" json,
	"scores" json,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"dataset_id" integer NOT NULL,
	"case_key" varchar(200) NOT NULL,
	"input" json NOT NULL,
	"expected" json,
	"mock_output" json,
	"enabled" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_datasets" (
	"id" serial PRIMARY KEY NOT NULL,
	"suite_id" varchar(100) NOT NULL,
	"name" varchar(200) DEFAULT 'default' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"suite_id" varchar(100) NOT NULL,
	"prompt_id" integer,
	"prompt_version_id" integer,
	"dataset_id" integer,
	"trigger" varchar(20) DEFAULT 'manual' NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"pass_rate" real DEFAULT 0 NOT NULL,
	"aggregate" real DEFAULT 0 NOT NULL,
	"avg_latency_ms" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"error" text,
	"created_by" integer,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer,
	"action" varchar(40) NOT NULL,
	"prompt_id" integer,
	"version_id" integer,
	"detail" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"active_version_id" integer,
	"schedule_cron" varchar(120),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_registry_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt_id" integer NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"notes" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_api_keys" ADD CONSTRAINT "portal_api_keys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_api_keys" ADD CONSTRAINT "portal_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_dashboard_preferences" ADD CONSTRAINT "user_dashboard_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_dashboard_preferences" ADD CONSTRAINT "user_dashboard_preferences_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_members" ADD CONSTRAINT "client_members_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_members" ADD CONSTRAINT "client_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_members" ADD CONSTRAINT "client_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_services" ADD CONSTRAINT "client_services_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_services" ADD CONSTRAINT "client_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_websites" ADD CONSTRAINT "client_websites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_websites" ADD CONSTRAINT "client_websites_draft_updated_by_users_id_fk" FOREIGN KEY ("draft_updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_domain_history" ADD CONSTRAINT "custom_domain_history_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_domain_history" ADD CONSTRAINT "custom_domain_history_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_website_tokens" ADD CONSTRAINT "google_website_tokens_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_sites" ADD CONSTRAINT "hosted_sites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_sites" ADD CONSTRAINT "hosted_sites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "http_request_logs" ADD CONSTRAINT "http_request_logs_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_branding" ADD CONSTRAINT "site_branding_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_navigation" ADD CONSTRAINT "site_navigation_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_tracking" ADD CONSTRAINT "site_tracking_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_webhook_deliveries" ADD CONSTRAINT "site_webhook_deliveries_webhook_id_site_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."site_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_webhooks" ADD CONSTRAINT "site_webhooks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_webhooks" ADD CONSTRAINT "site_webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_backups" ADD CONSTRAINT "website_backups_environment_id_website_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."website_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_backups" ADD CONSTRAINT "website_backups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_domains" ADD CONSTRAINT "website_domains_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_env_vars" ADD CONSTRAINT "website_env_vars_environment_id_website_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."website_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_environments" ADD CONSTRAINT "website_environments_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_template_usages" ADD CONSTRAINT "block_template_usages_template_id_block_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."block_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_template_usages" ADD CONSTRAINT "block_template_usages_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branding_messaging" ADD CONSTRAINT "branding_messaging_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branding_messaging" ADD CONSTRAINT "branding_messaging_branding_profile_id_branding_profiles_id_fk" FOREIGN KEY ("branding_profile_id") REFERENCES "public"."branding_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branding_profiles" ADD CONSTRAINT "branding_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_post_type_id_post_types_id_fk" FOREIGN KEY ("post_type_id") REFERENCES "public"."post_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_branding_profile_id_branding_profiles_id_fk" FOREIGN KEY ("branding_profile_id") REFERENCES "public"."branding_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_versions" ADD CONSTRAINT "media_versions_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_versions" ADD CONSTRAINT "media_versions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_categories" ADD CONSTRAINT "post_categories_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_categories" ADD CONSTRAINT "post_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_custom_field_values" ADD CONSTRAINT "post_custom_field_values_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_custom_field_values" ADD CONSTRAINT "post_custom_field_values_custom_field_id_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_taxonomy_terms" ADD CONSTRAINT "post_taxonomy_terms_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_taxonomy_terms" ADD CONSTRAINT "post_taxonomy_terms_term_id_taxonomy_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."taxonomy_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_types" ADD CONSTRAINT "post_types_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_taxonomy_id_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_via_user_id_users_id_fk" FOREIGN KEY ("via_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_tags" ADD CONSTRAINT "crm_contact_tags_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_tags" ADD CONSTRAINT "crm_contact_tags_tag_id_crm_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."crm_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contract_signers" ADD CONSTRAINT "crm_contract_signers_contract_id_crm_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."crm_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contract_signing_events" ADD CONSTRAINT "crm_contract_signing_events_contract_id_crm_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."crm_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contract_signing_events" ADD CONSTRAINT "crm_contract_signing_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contract_templates" ADD CONSTRAINT "crm_contract_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_proposal_id_crm_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."crm_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_custom_field_values" ADD CONSTRAINT "crm_custom_field_values_custom_field_id_crm_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."crm_custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_custom_fields" ADD CONSTRAINT "crm_custom_fields_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_artifacts" ADD CONSTRAINT "crm_deal_artifacts_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_artifacts" ADD CONSTRAINT "crm_deal_artifacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_comments" ADD CONSTRAINT "crm_deal_comments_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_comments" ADD CONSTRAINT "crm_deal_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_stage_id_crm_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_pipeline_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_email_messages" ADD CONSTRAINT "crm_email_messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_email_messages" ADD CONSTRAINT "crm_email_messages_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_email_messages" ADD CONSTRAINT "crm_email_messages_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_enrichment_config" ADD CONSTRAINT "crm_enrichment_config_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_enrichment_log" ADD CONSTRAINT "crm_enrichment_log_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notifications" ADD CONSTRAINT "crm_notifications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notifications" ADD CONSTRAINT "crm_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stages" ADD CONSTRAINT "crm_pipeline_stages_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipelines" ADD CONSTRAINT "crm_pipelines_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposal_templates" ADD CONSTRAINT "crm_proposal_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_saved_views" ADD CONSTRAINT "crm_saved_views_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_scoring_rules" ADD CONSTRAINT "crm_scoring_rules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sequence_enrollments" ADD CONSTRAINT "crm_sequence_enrollments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sequence_enrollments" ADD CONSTRAINT "crm_sequence_enrollments_sequence_id_crm_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."crm_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sequence_enrollments" ADD CONSTRAINT "crm_sequence_enrollments_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sequence_sends" ADD CONSTRAINT "crm_sequence_sends_enrollment_id_crm_sequence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."crm_sequence_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sequence_sends" ADD CONSTRAINT "crm_sequence_sends_step_id_crm_sequence_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."crm_sequence_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sequence_steps" ADD CONSTRAINT "crm_sequence_steps_sequence_id_crm_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."crm_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sequences" ADD CONSTRAINT "crm_sequences_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sequences" ADD CONSTRAINT "crm_sequences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tags" ADD CONSTRAINT "crm_tags_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "kanban_card_activities" ADD CONSTRAINT "kanban_card_activities_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_activities" ADD CONSTRAINT "kanban_card_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_artifacts" ADD CONSTRAINT "kanban_card_artifacts_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_artifacts" ADD CONSTRAINT "kanban_card_artifacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_assignees" ADD CONSTRAINT "kanban_card_assignees_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_assignees" ADD CONSTRAINT "kanban_card_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_checklist_items" ADD CONSTRAINT "kanban_card_checklist_items_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_checklist_items" ADD CONSTRAINT "kanban_card_checklist_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_checklist_items" ADD CONSTRAINT "kanban_card_checklist_items_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_comments" ADD CONSTRAINT "kanban_card_comments_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_comments" ADD CONSTRAINT "kanban_card_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_dependencies" ADD CONSTRAINT "kanban_card_dependencies_blocked_card_id_kanban_cards_id_fk" FOREIGN KEY ("blocked_card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_dependencies" ADD CONSTRAINT "kanban_card_dependencies_blocker_card_id_kanban_cards_id_fk" FOREIGN KEY ("blocker_card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_files" ADD CONSTRAINT "kanban_card_files_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_files" ADD CONSTRAINT "kanban_card_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_files" ADD CONSTRAINT "kanban_card_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_labels" ADD CONSTRAINT "kanban_card_labels_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_labels" ADD CONSTRAINT "kanban_card_labels_label_id_kanban_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."kanban_labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_time_logs" ADD CONSTRAINT "kanban_card_time_logs_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_time_logs" ADD CONSTRAINT "kanban_card_time_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_watchers" ADD CONSTRAINT "kanban_card_watchers_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card_watchers" ADD CONSTRAINT "kanban_card_watchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_column_id_kanban_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."kanban_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_columns" ADD CONSTRAINT "kanban_columns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_labels" ADD CONSTRAINT "kanban_labels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "project_webhook_deliveries" ADD CONSTRAINT "project_webhook_deliveries_webhook_id_project_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."project_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_webhooks" ADD CONSTRAINT "project_webhooks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_webhooks" ADD CONSTRAINT "project_webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_retro_items" ADD CONSTRAINT "sprint_retro_items_retro_id_sprint_retros_id_fk" FOREIGN KEY ("retro_id") REFERENCES "public"."sprint_retros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_retro_items" ADD CONSTRAINT "sprint_retro_items_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_retro_items" ADD CONSTRAINT "sprint_retro_items_promoted_card_id_kanban_cards_id_fk" FOREIGN KEY ("promoted_card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_retros" ADD CONSTRAINT "sprint_retros_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_retros" ADD CONSTRAINT "sprint_retros_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_scope_history" ADD CONSTRAINT "sprint_scope_history_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_scope_history" ADD CONSTRAINT "sprint_scope_history_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_scope_history" ADD CONSTRAINT "sprint_scope_history_occurred_by_users_id_fk" FOREIGN KEY ("occurred_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_project_requests" ADD CONSTRAINT "suggested_project_requests_suggested_project_id_suggested_projects_id_fk" FOREIGN KEY ("suggested_project_id") REFERENCES "public"."suggested_projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_project_requests" ADD CONSTRAINT "suggested_project_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_projects" ADD CONSTRAINT "suggested_projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_projects" ADD CONSTRAINT "suggested_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_log" ADD CONSTRAINT "agent_action_log_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_log" ADD CONSTRAINT "agent_action_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_log" ADD CONSTRAINT "agent_action_log_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_ai_jobs" ADD CONSTRAINT "brain_ai_jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_ai_jobs" ADD CONSTRAINT "brain_ai_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_ai_review_items" ADD CONSTRAINT "brain_ai_review_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_ai_review_items" ADD CONSTRAINT "brain_ai_review_items_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_ai_review_items" ADD CONSTRAINT "brain_ai_review_items_suggested_reviewer_person_id_brain_people_id_fk" FOREIGN KEY ("suggested_reviewer_person_id") REFERENCES "public"."brain_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_audit_logs" ADD CONSTRAINT "brain_audit_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_audit_logs" ADD CONSTRAINT "brain_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_calendar_events" ADD CONSTRAINT "brain_calendar_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_calendar_events" ADD CONSTRAINT "brain_calendar_events_related_task_id_brain_tasks_id_fk" FOREIGN KEY ("related_task_id") REFERENCES "public"."brain_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_calendar_events" ADD CONSTRAINT "brain_calendar_events_related_meeting_id_brain_meetings_id_fk" FOREIGN KEY ("related_meeting_id") REFERENCES "public"."brain_meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_calendar_events" ADD CONSTRAINT "brain_calendar_events_related_relationship_overlay_id_brain_relationship_overlays_id_fk" FOREIGN KEY ("related_relationship_overlay_id") REFERENCES "public"."brain_relationship_overlays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_calendar_events" ADD CONSTRAINT "brain_calendar_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_custom_field_values" ADD CONSTRAINT "brain_custom_field_values_custom_field_id_brain_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."brain_custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_custom_fields" ADD CONSTRAINT "brain_custom_fields_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "brain_embedding_jobs" ADD CONSTRAINT "brain_embedding_jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "brain_kb_links" ADD CONSTRAINT "brain_kb_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_kb_links" ADD CONSTRAINT "brain_kb_links_from_note_id_brain_notes_id_fk" FOREIGN KEY ("from_note_id") REFERENCES "public"."brain_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_kb_links" ADD CONSTRAINT "brain_kb_links_to_note_id_brain_notes_id_fk" FOREIGN KEY ("to_note_id") REFERENCES "public"."brain_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_meeting_participants" ADD CONSTRAINT "brain_meeting_participants_meeting_id_brain_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."brain_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_meeting_participants" ADD CONSTRAINT "brain_meeting_participants_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_meetings" ADD CONSTRAINT "brain_meetings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_meetings" ADD CONSTRAINT "brain_meetings_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_meetings" ADD CONSTRAINT "brain_meetings_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_meetings" ADD CONSTRAINT "brain_meetings_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_meetings" ADD CONSTRAINT "brain_meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_note_templates" ADD CONSTRAINT "brain_note_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_note_templates" ADD CONSTRAINT "brain_note_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_notes" ADD CONSTRAINT "brain_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_notes" ADD CONSTRAINT "brain_notes_meeting_id_brain_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."brain_meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_notes" ADD CONSTRAINT "brain_notes_relationship_overlay_id_brain_relationship_overlays_id_fk" FOREIGN KEY ("relationship_overlay_id") REFERENCES "public"."brain_relationship_overlays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_notes" ADD CONSTRAINT "brain_notes_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_notes" ADD CONSTRAINT "brain_notes_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_notes" ADD CONSTRAINT "brain_notes_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_notes" ADD CONSTRAINT "brain_notes_review_item_id_brain_ai_review_items_id_fk" FOREIGN KEY ("review_item_id") REFERENCES "public"."brain_ai_review_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_notes" ADD CONSTRAINT "brain_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "brain_profiles" ADD CONSTRAINT "brain_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_relationship_overlays" ADD CONSTRAINT "brain_relationship_overlays_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_relationship_overlays" ADD CONSTRAINT "brain_relationship_overlays_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_relationship_overlays" ADD CONSTRAINT "brain_relationship_overlays_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_relationship_overlays" ADD CONSTRAINT "brain_relationship_overlays_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_relationship_overlays" ADD CONSTRAINT "brain_relationship_overlays_secondary_owner_id_users_id_fk" FOREIGN KEY ("secondary_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_saved_searches" ADD CONSTRAINT "brain_saved_searches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_saved_searches" ADD CONSTRAINT "brain_saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_saved_searches" ADD CONSTRAINT "brain_saved_searches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_tasks" ADD CONSTRAINT "brain_tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_tasks" ADD CONSTRAINT "brain_tasks_meeting_id_brain_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."brain_meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_tasks" ADD CONSTRAINT "brain_tasks_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_tasks" ADD CONSTRAINT "brain_tasks_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_tasks" ADD CONSTRAINT "brain_tasks_linked_kanban_card_id_kanban_cards_id_fk" FOREIGN KEY ("linked_kanban_card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_tasks" ADD CONSTRAINT "brain_tasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_tasks" ADD CONSTRAINT "brain_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_topics" ADD CONSTRAINT "brain_topics_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_topics" ADD CONSTRAINT "brain_topics_parent_id_brain_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."brain_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_topics" ADD CONSTRAINT "brain_topics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_pricing_rules" ADD CONSTRAINT "bulk_pricing_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_pricing_rules" ADD CONSTRAINT "bulk_pricing_rules_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_assets" ADD CONSTRAINT "design_assets_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "easypost_events" ADD CONSTRAINT "easypost_events_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "easypost_events" ADD CONSTRAINT "easypost_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printful_events" ADD CONSTRAINT "printful_events_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printful_events" ADD CONSTRAINT "printful_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_design_surfaces" ADD CONSTRAINT "product_design_surfaces_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_zone_id_shipping_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_zones" ADD CONSTRAINT "shipping_zones_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_customer_message_replies" ADD CONSTRAINT "store_customer_message_replies_message_id_store_customer_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."store_customer_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_customer_messages" ADD CONSTRAINT "store_customer_messages_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_customer_messages" ADD CONSTRAINT "store_customer_messages_customer_id_store_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."store_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_customer_messages" ADD CONSTRAINT "store_customer_messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_customer_sessions" ADD CONSTRAINT "store_customer_sessions_customer_id_store_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."store_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_customers" ADD CONSTRAINT "store_customers_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_product_reviews" ADD CONSTRAINT "store_product_reviews_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_product_reviews" ADD CONSTRAINT "store_product_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_product_reviews" ADD CONSTRAINT "store_product_reviews_customer_id_store_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."store_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_product_reviews" ADD CONSTRAINT "store_product_reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_wishlist_items" ADD CONSTRAINT "store_wishlist_items_wishlist_id_store_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."store_wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_wishlist_items" ADD CONSTRAINT "store_wishlist_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_wishlist_items" ADD CONSTRAINT "store_wishlist_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_wishlists" ADD CONSTRAINT "store_wishlists_customer_id_store_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."store_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_wishlists" ADD CONSTRAINT "store_wishlists_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_library_assets" ADD CONSTRAINT "design_library_assets_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_designs" ADD CONSTRAINT "product_designs_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_designs" ADD CONSTRAINT "product_designs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_designs" ADD CONSTRAINT "product_designs_style_id_product_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."product_styles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_designs" ADD CONSTRAINT "product_designs_customer_id_store_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."store_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sides" ADD CONSTRAINT "product_sides_style_id_product_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."product_styles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_styles" ADD CONSTRAINT "product_styles_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_optins" ADD CONSTRAINT "catalog_optins_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_optins" ADD CONSTRAINT "catalog_optins_catalog_product_id_catalog_products_id_fk" FOREIGN KEY ("catalog_product_id") REFERENCES "public"."catalog_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_optins" ADD CONSTRAINT "catalog_optins_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_sides" ADD CONSTRAINT "catalog_sides_catalog_style_id_catalog_styles_id_fk" FOREIGN KEY ("catalog_style_id") REFERENCES "public"."catalog_styles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_sizes" ADD CONSTRAINT "catalog_sizes_catalog_style_id_catalog_styles_id_fk" FOREIGN KEY ("catalog_style_id") REFERENCES "public"."catalog_styles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_styles" ADD CONSTRAINT "catalog_styles_catalog_product_id_catalog_products_id_fk" FOREIGN KEY ("catalog_product_id") REFERENCES "public"."catalog_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaign_sends" ADD CONSTRAINT "email_campaign_sends_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaign_sends" ADD CONSTRAINT "email_campaign_sends_subscriber_id_email_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."email_subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_list_id_email_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."email_lists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_journey_enrollments" ADD CONSTRAINT "email_journey_enrollments_journey_id_email_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."email_journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_journey_enrollments" ADD CONSTRAINT "email_journey_enrollments_subscriber_id_email_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."email_subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_journey_enrollments" ADD CONSTRAINT "email_journey_enrollments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_journey_step_sends" ADD CONSTRAINT "email_journey_step_sends_enrollment_id_email_journey_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."email_journey_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_journey_step_sends" ADD CONSTRAINT "email_journey_step_sends_step_id_email_journey_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."email_journey_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_journey_step_sends" ADD CONSTRAINT "email_journey_step_sends_subscriber_id_email_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."email_subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_journey_steps" ADD CONSTRAINT "email_journey_steps_journey_id_email_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."email_journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_journeys" ADD CONSTRAINT "email_journeys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_journeys" ADD CONSTRAINT "email_journeys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_renders" ADD CONSTRAINT "email_renders_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_segments" ADD CONSTRAINT "email_segments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_signup_forms" ADD CONSTRAINT "email_signup_forms_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_signup_forms" ADD CONSTRAINT "email_signup_forms_list_id_email_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."email_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_subscriber_tag_assignments" ADD CONSTRAINT "email_subscriber_tag_assignments_subscriber_id_email_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."email_subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_subscriber_tag_assignments" ADD CONSTRAINT "email_subscriber_tag_assignments_tag_id_email_subscriber_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."email_subscriber_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_subscriber_tags" ADD CONSTRAINT "email_subscriber_tags_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_subscribers" ADD CONSTRAINT "email_subscribers_list_id_email_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."email_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_email_templates" ADD CONSTRAINT "website_email_templates_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_email_templates" ADD CONSTRAINT "website_email_templates_branding_profile_id_branding_profiles_id_fk" FOREIGN KEY ("branding_profile_id") REFERENCES "public"."branding_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_email_templates" ADD CONSTRAINT "website_email_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_ai_summaries" ADD CONSTRAINT "survey_ai_summaries_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_email_sequence_sends" ADD CONSTRAINT "survey_email_sequence_sends_sequence_id_survey_email_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."survey_email_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_email_sequence_sends" ADD CONSTRAINT "survey_email_sequence_sends_survey_response_id_survey_responses_id_fk" FOREIGN KEY ("survey_response_id") REFERENCES "public"."survey_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_email_sequences" ADD CONSTRAINT "survey_email_sequences_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_partial_responses" ADD CONSTRAINT "survey_partial_responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_variants" ADD CONSTRAINT "survey_variants_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_webhook_deliveries" ADD CONSTRAINT "survey_webhook_deliveries_webhook_id_survey_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."survey_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD CONSTRAINT "survey_webhooks_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD CONSTRAINT "survey_webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_branding_profile_id_branding_profiles_id_fk" FOREIGN KEY ("branding_profile_id") REFERENCES "public"."branding_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_add_ons" ADD CONSTRAINT "booking_add_ons_booking_page_id_booking_pages_id_fk" FOREIGN KEY ("booking_page_id") REFERENCES "public"."booking_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_add_ons" ADD CONSTRAINT "booking_add_ons_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_add_ons" ADD CONSTRAINT "booking_add_ons_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_attendees" ADD CONSTRAINT "booking_attendees_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_date_overrides" ADD CONSTRAINT "booking_date_overrides_booking_page_id_booking_pages_id_fk" FOREIGN KEY ("booking_page_id") REFERENCES "public"."booking_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_page_members" ADD CONSTRAINT "booking_page_members_booking_page_id_booking_pages_id_fk" FOREIGN KEY ("booking_page_id") REFERENCES "public"."booking_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_page_members" ADD CONSTRAINT "booking_page_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_branding_profile_id_branding_profiles_id_fk" FOREIGN KEY ("branding_profile_id") REFERENCES "public"."branding_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_quotes" ADD CONSTRAINT "booking_quotes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_quotes" ADD CONSTRAINT "booking_quotes_booking_page_id_booking_pages_id_fk" FOREIGN KEY ("booking_page_id") REFERENCES "public"."booking_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_quotes" ADD CONSTRAINT "booking_quotes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_selected_add_ons" ADD CONSTRAINT "booking_selected_add_ons_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_selected_add_ons" ADD CONSTRAINT "booking_selected_add_ons_add_on_id_booking_add_ons_id_fk" FOREIGN KEY ("add_on_id") REFERENCES "public"."booking_add_ons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_waivers" ADD CONSTRAINT "booking_waivers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_waivers" ADD CONSTRAINT "booking_waivers_booking_page_id_booking_pages_id_fk" FOREIGN KEY ("booking_page_id") REFERENCES "public"."booking_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_waivers" ADD CONSTRAINT "booking_waivers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_booking_page_id_booking_pages_id_fk" FOREIGN KEY ("booking_page_id") REFERENCES "public"."booking_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_checked_in_by_users_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_certificate_redemptions" ADD CONSTRAINT "gift_certificate_redemptions_gift_certificate_id_gift_certificates_id_fk" FOREIGN KEY ("gift_certificate_id") REFERENCES "public"."gift_certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_tokens" ADD CONSTRAINT "google_calendar_tokens_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_workspace_client_connections" ADD CONSTRAINT "google_workspace_client_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_workspace_tenant_credentials" ADD CONSTRAINT "google_workspace_tenant_credentials_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_workspace_tenant_credentials" ADD CONSTRAINT "google_workspace_tenant_credentials_configured_by_user_id_users_id_fk" FOREIGN KEY ("configured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_workspace_user_connections" ADD CONSTRAINT "google_workspace_user_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_workspace_user_connections" ADD CONSTRAINT "google_workspace_user_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_call_daily_rollups" ADD CONSTRAINT "mcp_tool_call_daily_rollups_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD CONSTRAINT "mcp_tool_calls_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD CONSTRAINT "mcp_tool_calls_api_key_id_portal_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."portal_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD CONSTRAINT "mcp_tool_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microsoft_teams_user_connections" ADD CONSTRAINT "microsoft_teams_user_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microsoft_teams_user_connections" ADD CONSTRAINT "microsoft_teams_user_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_deck_versions" ADD CONSTRAINT "pitch_deck_versions_deck_id_pitch_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."pitch_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_deck_versions" ADD CONSTRAINT "pitch_deck_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_deck_views" ADD CONSTRAINT "pitch_deck_views_deck_id_pitch_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."pitch_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD CONSTRAINT "pitch_decks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD CONSTRAINT "pitch_decks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zoom_tokens" ADD CONSTRAINT "zoom_tokens_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_balances" ADD CONSTRAINT "ai_credit_balances_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_ledger" ADD CONSTRAINT "ai_credit_ledger_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_injected_by_users_id_fk" FOREIGN KEY ("injected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_api_keys" ADD CONSTRAINT "client_api_keys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metered_subscription_items" ADD CONSTRAINT "metered_subscription_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_alert_events" ADD CONSTRAINT "usage_alert_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_billing_periods" ADD CONSTRAINT "usage_billing_periods_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_meter_events" ADD CONSTRAINT "usage_meter_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_meters" ADD CONSTRAINT "usage_meters_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_thresholds" ADD CONSTRAINT "usage_thresholds_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_approval_links" ADD CONSTRAINT "mcp_approval_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_approval_links" ADD CONSTRAINT "mcp_approval_links_pending_change_id_mcp_pending_changes_id_fk" FOREIGN KEY ("pending_change_id") REFERENCES "public"."mcp_pending_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_approval_links" ADD CONSTRAINT "mcp_approval_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_approval_links" ADD CONSTRAINT "mcp_approval_links_key_id_portal_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."portal_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_pending_changes" ADD CONSTRAINT "mcp_pending_changes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_pending_changes" ADD CONSTRAINT "mcp_pending_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_pending_changes" ADD CONSTRAINT "mcp_pending_changes_key_id_portal_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."portal_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_pending_changes" ADD CONSTRAINT "mcp_pending_changes_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_oauth_client_id_oauth_clients_id_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_oauth_client_id_oauth_clients_id_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_owner_client_id_clients_id_fk" FOREIGN KEY ("owner_client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_oauth_client_id_oauth_clients_id_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "agent_action_logs" ADD CONSTRAINT "agent_action_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_logs" ADD CONSTRAINT "agent_action_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_logs" ADD CONSTRAINT "agent_action_logs_pending_change_id_mcp_pending_changes_id_fk" FOREIGN KEY ("pending_change_id") REFERENCES "public"."mcp_pending_changes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agentic_os_runs" ADD CONSTRAINT "agentic_os_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agentic_os_runs" ADD CONSTRAINT "agentic_os_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_run_id_registered_app_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."registered_app_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_run_id_registered_app_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."registered_app_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_brief_id_content_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."content_briefs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "publishing_campaigns" ADD CONSTRAINT "publishing_campaigns_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_campaigns" ADD CONSTRAINT "publishing_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_permissions" ADD CONSTRAINT "publishing_permissions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_permissions" ADD CONSTRAINT "publishing_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_permissions" ADD CONSTRAINT "publishing_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD CONSTRAINT "eval_case_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_dataset_id_eval_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."eval_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_prompt_id_prompt_registry_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompt_registry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_dataset_id_eval_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."eval_datasets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_audit_log" ADD CONSTRAINT "prompt_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_audit_log" ADD CONSTRAINT "prompt_audit_log_prompt_id_prompt_registry_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompt_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_audit_log" ADD CONSTRAINT "prompt_audit_log_version_id_prompt_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_id_prompt_registry_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompt_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_members_user_idx" ON "client_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_members_client_user_idx" ON "client_members" USING btree ("client_id","user_id");--> statement-breakpoint
CREATE INDEX "client_services_client_status_created_idx" ON "client_services" USING btree ("client_id","status","created_at");--> statement-breakpoint
CREATE INDEX "client_services_client_status_idx" ON "client_services" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "client_websites_client_idx" ON "client_websites" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_websites_subdomain_idx" ON "client_websites" USING btree ("subdomain");--> statement-breakpoint
CREATE INDEX "client_websites_created_idx" ON "client_websites" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "service_requests_client_status_created_idx" ON "service_requests" USING btree ("client_id","status","created_at");--> statement-breakpoint
CREATE INDEX "service_requests_client_status_idx" ON "service_requests" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_website_idx" ON "categories" USING btree ("slug","website_id");--> statement-breakpoint
CREATE INDEX "media_client_created_idx" ON "media" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_website_published_idx" ON "posts" USING btree ("website_id","published","published_at");--> statement-breakpoint
CREATE INDEX "posts_website_slug_idx" ON "posts" USING btree ("website_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_slug_website_idx" ON "tags" USING btree ("slug","website_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomies_slug_website_idx" ON "taxonomies" USING btree ("slug","website_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_terms_slug_taxonomy_idx" ON "taxonomy_terms" USING btree ("slug","taxonomy_id");--> statement-breakpoint
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
CREATE UNIQUE INDEX "crm_custom_field_values_unique_idx" ON "crm_custom_field_values" USING btree ("custom_field_id","entity_id","entity_type");--> statement-breakpoint
CREATE INDEX "crm_deals_client_idx" ON "crm_deals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "crm_deals_client_stage_idx" ON "crm_deals" USING btree ("client_id","stage_id");--> statement-breakpoint
CREATE INDEX "crm_deals_client_owner_idx" ON "crm_deals" USING btree ("client_id","owner_id");--> statement-breakpoint
CREATE INDEX "crm_deals_client_updated_idx" ON "crm_deals" USING btree ("client_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_email_messages_client_provider_idx" ON "crm_email_messages" USING btree ("client_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "crm_email_messages_contact_idx" ON "crm_email_messages" USING btree ("contact_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_sequence_enrollments_seq_contact_idx" ON "crm_sequence_enrollments" USING btree ("sequence_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_sequence_sends_enrollment_step_idx" ON "crm_sequence_sends" USING btree ("enrollment_id","step_id");--> statement-breakpoint
CREATE INDEX "crm_sequence_steps_seq_order_idx" ON "crm_sequence_steps" USING btree ("sequence_id","step_order");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_client_user_type_idx" ON "notification_preferences" USING btree ("client_id","user_id","notification_type");--> statement-breakpoint
CREATE UNIQUE INDEX "card_custom_field_values_card_field_idx" ON "card_custom_field_values" USING btree ("card_id","field_id");--> statement-breakpoint
CREATE INDEX "card_recurrences_due_idx" ON "card_recurrences" USING btree ("active","next_fire_at");--> statement-breakpoint
CREATE INDEX "card_recurrences_project_idx" ON "card_recurrences" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "card_templates_client_idx" ON "card_templates" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "card_templates_project_idx" ON "card_templates" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "column_daily_snapshots_unique_idx" ON "column_daily_snapshots" USING btree ("project_id","column_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "column_daily_snapshots_project_date_idx" ON "column_daily_snapshots" USING btree ("project_id","snapshot_date");--> statement-breakpoint
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
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "projects_client_status_idx" ON "projects" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "projects_client_updated_idx" ON "projects" USING btree ("client_id","updated_at");--> statement-breakpoint
CREATE INDEX "sprint_retro_items_retro_idx" ON "sprint_retro_items" USING btree ("retro_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "sprint_retros_sprint_idx" ON "sprint_retros" USING btree ("sprint_id");--> statement-breakpoint
CREATE INDEX "sprint_scope_history_sprint_idx" ON "sprint_scope_history" USING btree ("sprint_id","occurred_at");--> statement-breakpoint
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
CREATE UNIQUE INDEX "brain_embedding_jobs_entity_unique_idx" ON "brain_embedding_jobs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "brain_embedding_jobs_status_idx" ON "brain_embedding_jobs" USING btree ("status","enqueued_at");--> statement-breakpoint
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
CREATE UNIQUE INDEX "brain_meetings_client_source_ref_idx" ON "brain_meetings" USING btree ("client_id","source_ref");--> statement-breakpoint
CREATE INDEX "brain_meetings_client_meeting_date_idx" ON "brain_meetings" USING btree ("client_id","meeting_date");--> statement-breakpoint
CREATE INDEX "brain_meetings_client_created_idx" ON "brain_meetings" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_note_templates_client_name_idx" ON "brain_note_templates" USING btree ("client_id","name");--> statement-breakpoint
CREATE INDEX "brain_notes_client_updated_idx" ON "brain_notes" USING btree ("client_id","updated_at");--> statement-breakpoint
CREATE INDEX "brain_notes_client_company_idx" ON "brain_notes" USING btree ("client_id","company_id");--> statement-breakpoint
CREATE INDEX "brain_notes_client_deal_idx" ON "brain_notes" USING btree ("client_id","deal_id");--> statement-breakpoint
CREATE INDEX "brain_notes_client_pinned_idx" ON "brain_notes" USING btree ("client_id","pinned");--> statement-breakpoint
CREATE INDEX "brain_notes_status_idx" ON "brain_notes" USING btree ("status");--> statement-breakpoint
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
CREATE INDEX "brain_relationship_overlays_client_company_idx" ON "brain_relationship_overlays" USING btree ("client_id","company_id");--> statement-breakpoint
CREATE INDEX "brain_relationship_overlays_client_deal_idx" ON "brain_relationship_overlays" USING btree ("client_id","deal_id");--> statement-breakpoint
CREATE INDEX "brain_tasks_client_status_due_idx" ON "brain_tasks" USING btree ("client_id","status","due_date");--> statement-breakpoint
CREATE INDEX "brain_tasks_client_owner_idx" ON "brain_tasks" USING btree ("client_id","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_topics_client_slug_idx" ON "brain_topics" USING btree ("client_id","slug");--> statement-breakpoint
CREATE INDEX "brain_topics_client_parent_idx" ON "brain_topics" USING btree ("client_id","parent_id");--> statement-breakpoint
CREATE INDEX "brain_topics_path_idx" ON "brain_topics" USING btree ("path");--> statement-breakpoint
CREATE INDEX "designs_website_idx" ON "designs" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "designs_customer_idx" ON "designs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "designs_session_idx" ON "designs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "designs_product_idx" ON "designs" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "designs_template_idx" ON "designs" USING btree ("is_template");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_code_website_idx" ON "discount_codes" USING btree ("code","website_id");--> statement-breakpoint
CREATE UNIQUE INDEX "easypost_events_event_id_idx" ON "easypost_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "easypost_events_order_id_idx" ON "easypost_events" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "printful_events_event_id_idx" ON "printful_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "printful_events_order_id_idx" ON "printful_events" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_slug_website_idx" ON "product_categories" USING btree ("slug","website_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_design_surfaces_product_slug_idx" ON "product_design_surfaces" USING btree ("product_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_website_idx" ON "products" USING btree ("slug","website_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_customers_email_website_idx" ON "store_customers" USING btree ("email","website_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_designs_uuid_idx" ON "product_designs" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX "product_designs_website_customer_idx" ON "product_designs" USING btree ("website_id","customer_id");--> statement-breakpoint
CREATE INDEX "product_designs_website_session_idx" ON "product_designs" USING btree ("website_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_optins_site_product_idx" ON "catalog_optins" USING btree ("website_id","catalog_product_id");--> statement-breakpoint
CREATE INDEX "catalog_optins_website_idx" ON "catalog_optins" USING btree ("website_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_products_source_idx" ON "catalog_products" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "catalog_products_brand_idx" ON "catalog_products" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "catalog_products_slug_idx" ON "catalog_products" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_sides_source_idx" ON "catalog_sides" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "catalog_sides_style_idx" ON "catalog_sides" USING btree ("catalog_style_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_sizes_source_idx" ON "catalog_sizes" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "catalog_sizes_style_idx" ON "catalog_sizes" USING btree ("catalog_style_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_styles_source_idx" ON "catalog_styles" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "catalog_styles_product_idx" ON "catalog_styles" USING btree ("catalog_product_id");--> statement-breakpoint
CREATE INDEX "email_campaign_sends_campaign_idx" ON "email_campaign_sends" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "email_campaign_sends_subscriber_idx" ON "email_campaign_sends" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_campaign_sends_campaign_subscriber_uniq_idx" ON "email_campaign_sends" USING btree ("campaign_id","subscriber_id");--> statement-breakpoint
CREATE INDEX "email_campaigns_client_created_at_idx" ON "email_campaigns" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "email_campaigns_list_id_idx" ON "email_campaigns" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "email_campaigns_status_scheduled_at_idx" ON "email_campaigns" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_journey_enrollments_journey_subscriber_uniq_idx" ON "email_journey_enrollments" USING btree ("journey_id","subscriber_id");--> statement-breakpoint
CREATE INDEX "email_journey_enrollments_status_next_run_idx" ON "email_journey_enrollments" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "email_journey_enrollments_client_idx" ON "email_journey_enrollments" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_journey_step_sends_enrollment_step_uniq_idx" ON "email_journey_step_sends" USING btree ("enrollment_id","step_id");--> statement-breakpoint
CREATE INDEX "email_journey_step_sends_enrollment_idx" ON "email_journey_step_sends" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "email_journey_step_sends_subscriber_idx" ON "email_journey_step_sends" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "email_journey_steps_journey_order_idx" ON "email_journey_steps" USING btree ("journey_id","step_order");--> statement-breakpoint
CREATE INDEX "email_journeys_client_idx" ON "email_journeys" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "email_journeys_client_status_idx" ON "email_journeys" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "email_lists_client_id_idx" ON "email_lists" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "email_renders_campaign_hash_idx" ON "email_renders" USING btree ("campaign_id","blocks_hash");--> statement-breakpoint
CREATE INDEX "email_segments_client_id_idx" ON "email_segments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "email_signup_forms_client_idx" ON "email_signup_forms" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "email_signup_forms_list_idx" ON "email_signup_forms" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "email_subscriber_tag_assignments_subscriber_idx" ON "email_subscriber_tag_assignments" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "email_subscriber_tag_assignments_tag_idx" ON "email_subscriber_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "email_subscribers_list_id_idx" ON "email_subscribers" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "email_subscribers_list_status_idx" ON "email_subscribers" USING btree ("list_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "email_subscribers_list_email_uniq_idx" ON "email_subscribers" USING btree ("list_id","email");--> statement-breakpoint
CREATE INDEX "email_subscribers_list_subscribed_at_idx" ON "email_subscribers" USING btree ("list_id","subscribed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_email_sequence_sends_sequence_response_idx" ON "survey_email_sequence_sends" USING btree ("sequence_id","survey_response_id");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_partial_responses_survey_session_idx" ON "survey_partial_responses" USING btree ("survey_id","session_id");--> statement-breakpoint
CREATE INDEX "surveys_client_updated_idx" ON "surveys" USING btree ("client_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_date_overrides_page_date_idx" ON "booking_date_overrides" USING btree ("booking_page_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_page_members_page_user_idx" ON "booking_page_members" USING btree ("booking_page_id","user_id");--> statement-breakpoint
CREATE INDEX "booking_pages_client_idx" ON "booking_pages" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bookings_client_idx" ON "bookings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bookings_booking_page_idx" ON "bookings" USING btree ("booking_page_id");--> statement-breakpoint
CREATE INDEX "bookings_start_status_idx" ON "bookings" USING btree ("start_time","status");--> statement-breakpoint
CREATE UNIQUE INDEX "google_workspace_tenant_credentials_token_idx" ON "google_workspace_tenant_credentials" USING btree ("pubsub_verification_token");--> statement-breakpoint
CREATE UNIQUE INDEX "google_workspace_user_connections_client_user_unique" ON "google_workspace_user_connections" USING btree ("client_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_workspace_user_connections_drive_channel_id" ON "google_workspace_user_connections" USING btree ("drive_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_rollups_day_client_tool_uq" ON "mcp_tool_call_daily_rollups" USING btree ("day","client_id","tool_name");--> statement-breakpoint
CREATE INDEX "mcp_rollups_day_idx" ON "mcp_tool_call_daily_rollups" USING btree ("day");--> statement-breakpoint
CREATE INDEX "mcp_rollups_client_day_idx" ON "mcp_tool_call_daily_rollups" USING btree ("client_id","day");--> statement-breakpoint
CREATE INDEX "mcp_tool_calls_client_created_idx" ON "mcp_tool_calls" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "mcp_tool_calls_tool_created_idx" ON "mcp_tool_calls" USING btree ("tool_name","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "microsoft_teams_user_connections_client_user_unique" ON "microsoft_teams_user_connections" USING btree ("client_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "microsoft_teams_user_connections_subscription_id" ON "microsoft_teams_user_connections" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "pitch_deck_views_deck_idx" ON "pitch_deck_views" USING btree ("deck_id","created_at");--> statement-breakpoint
CREATE INDEX "client_api_keys_client_id_idx" ON "client_api_keys" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_api_keys_provider_idx" ON "client_api_keys" USING btree ("client_id","provider");--> statement-breakpoint
CREATE INDEX "invoices_client_status_created_idx" ON "invoices" USING btree ("client_id","status","created_at");--> statement-breakpoint
CREATE INDEX "metered_subscription_items_client_status_resource_idx" ON "metered_subscription_items" USING btree ("client_id","status","resource");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_alert_events_client_resource_period_level_unique" ON "usage_alert_events" USING btree ("client_id","resource","period","level");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_billing_periods_client_period_resource_unique" ON "usage_billing_periods" USING btree ("client_id","period","resource");--> statement-breakpoint
CREATE INDEX "usage_meter_events_client_period_resource_idx" ON "usage_meter_events" USING btree ("client_id","period","resource");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_thresholds_client_resource_unique" ON "usage_thresholds" USING btree ("client_id","resource");--> statement-breakpoint
CREATE INDEX "mcp_pending_changes_client_status_created_idx" ON "mcp_pending_changes" USING btree ("client_id","status","created_at");--> statement-breakpoint
CREATE INDEX "mcp_pending_changes_status_idx" ON "mcp_pending_changes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "device_push_tokens_client_user_idx" ON "device_push_tokens" USING btree ("client_id","user_id");--> statement-breakpoint
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
CREATE INDEX "agent_audit_logs_client_created_idx" ON "agent_action_logs" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_audit_logs_run_id_idx" ON "agent_action_logs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_audit_logs_client_tool_created_idx" ON "agent_action_logs" USING btree ("client_id","tool_name","created_at");--> statement-breakpoint
CREATE INDEX "agentic_os_runs_created_at_idx" ON "agentic_os_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agentic_os_runs_skill_id_idx" ON "agentic_os_runs" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "agentic_os_runs_status_idx" ON "agentic_os_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agentic_os_runs_client_id_idx" ON "agentic_os_runs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "agentic_os_runs_run_id_idx" ON "agentic_os_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "content_briefs_client_idx" ON "content_briefs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "content_briefs_run_idx" ON "content_briefs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "content_drafts_client_idx" ON "content_drafts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "content_drafts_run_idx" ON "content_drafts" USING btree ("run_id");--> statement-breakpoint
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
CREATE UNIQUE INDEX "publishing_campaigns_client_slug_idx" ON "publishing_campaigns" USING btree ("client_id","slug");--> statement-breakpoint
CREATE INDEX "publishing_campaigns_client_status_idx" ON "publishing_campaigns" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "publishing_permissions_client_user_key_idx" ON "publishing_permissions" USING btree ("client_id","user_id","permission_key");--> statement-breakpoint
CREATE INDEX "publishing_permissions_client_user_idx" ON "publishing_permissions" USING btree ("client_id","user_id");--> statement-breakpoint
CREATE INDEX "eval_case_results_run_idx" ON "eval_case_results" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_case_results_run_case_idx" ON "eval_case_results" USING btree ("run_id","case_key");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_dataset_key_idx" ON "eval_cases" USING btree ("dataset_id","case_key");--> statement-breakpoint
CREATE INDEX "eval_cases_dataset_idx" ON "eval_cases" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "eval_datasets_suite_idx" ON "eval_datasets" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "eval_runs_suite_created_idx" ON "eval_runs" USING btree ("suite_id","created_at");--> statement-breakpoint
CREATE INDEX "eval_runs_version_idx" ON "eval_runs" USING btree ("prompt_version_id");--> statement-breakpoint
CREATE INDEX "eval_runs_status_idx" ON "eval_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prompt_audit_log_prompt_idx" ON "prompt_audit_log" USING btree ("prompt_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_prompt_version_idx" ON "prompt_versions" USING btree ("prompt_id","version");--> statement-breakpoint
CREATE INDEX "prompt_versions_prompt_idx" ON "prompt_versions" USING btree ("prompt_id");