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
ALTER TABLE "crm_proposal_templates" ADD CONSTRAINT "crm_proposal_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;