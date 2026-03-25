CREATE TABLE "pitch_deck_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer NOT NULL,
	"slides" json NOT NULL,
	"theme" json NOT NULL,
	"label" varchar(255),
	"trigger" varchar(50) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pitch_decks" ALTER COLUMN "theme" SET DEFAULT '{"primaryColor":"#2563eb","accentColor":"#60a5fa","backgroundColor":"#0f172a","textColor":"#f8fafc","headingFont":"Inter","bodyFont":"Inter"}'::json;--> statement-breakpoint
ALTER TABLE "pitch_deck_versions" ADD CONSTRAINT "pitch_deck_versions_deck_id_pitch_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."pitch_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_deck_versions" ADD CONSTRAINT "pitch_deck_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;