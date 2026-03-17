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
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "block_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "block_template_usages" ADD CONSTRAINT "block_template_usages_template_id_block_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."block_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_template_usages" ADD CONSTRAINT "block_template_usages_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;