CREATE TABLE "document_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" integer NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"parent_id" uuid,
	"author_id" integer NOT NULL,
	"body" text NOT NULL,
	"mentioned_user_ids" json DEFAULT '[]'::json NOT NULL,
	"anchor" json,
	"resolved_at" timestamp,
	"resolved_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;