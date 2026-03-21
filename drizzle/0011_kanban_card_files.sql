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

ALTER TABLE "kanban_card_files" ADD CONSTRAINT "kanban_card_files_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kanban_card_files" ADD CONSTRAINT "kanban_card_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kanban_card_files" ADD CONSTRAINT "kanban_card_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
