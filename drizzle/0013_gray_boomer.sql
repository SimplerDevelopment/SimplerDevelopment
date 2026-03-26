ALTER TABLE "posts" ADD COLUMN "seo_title" varchar(255);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "seo_description" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "og_image" varchar(500);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "no_index" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "canonical_url" varchar(500);