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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_branding" ADD CONSTRAINT "site_branding_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_navigation" ADD CONSTRAINT "site_navigation_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;