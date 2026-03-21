CREATE TABLE "kanban_card_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"user_id" integer,
	"body" text NOT NULL,
	"mentions" json DEFAULT '[]'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "kanban_card_time_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"user_id" integer,
	"minutes" integer NOT NULL,
	"note" text,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "kanban_card_comments" ADD CONSTRAINT "kanban_card_comments_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kanban_card_comments" ADD CONSTRAINT "kanban_card_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "kanban_card_time_logs" ADD CONSTRAINT "kanban_card_time_logs_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kanban_card_time_logs" ADD CONSTRAINT "kanban_card_time_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
