CREATE TABLE "post_taxonomy_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"term_id" integer NOT NULL
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
ALTER TABLE "post_types" DROP CONSTRAINT "post_types_name_unique";--> statement-breakpoint
ALTER TABLE "post_types" DROP CONSTRAINT "post_types_slug_unique";--> statement-breakpoint
ALTER TABLE "post_types" ADD COLUMN "website_id" integer;--> statement-breakpoint
ALTER TABLE "post_taxonomy_terms" ADD CONSTRAINT "post_taxonomy_terms_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_taxonomy_terms" ADD CONSTRAINT "post_taxonomy_terms_term_id_taxonomy_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."taxonomy_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_taxonomy_id_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomies_slug_website_idx" ON "taxonomies" USING btree ("slug","website_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_terms_slug_taxonomy_idx" ON "taxonomy_terms" USING btree ("slug","taxonomy_id");--> statement-breakpoint
ALTER TABLE "post_types" ADD CONSTRAINT "post_types_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;