ALTER TABLE "pitch_decks" ADD COLUMN "seo_title" varchar(255);--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD COLUMN "seo_description" text;--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD COLUMN "og_image" varchar(500);--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD COLUMN "canonical_url" varchar(500);--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD COLUMN "no_index" boolean DEFAULT false NOT NULL;