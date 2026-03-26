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
ALTER TABLE "google_website_tokens" ADD CONSTRAINT "google_website_tokens_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;