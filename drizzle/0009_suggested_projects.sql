CREATE TABLE "suggested_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100) DEFAULT 'development' NOT NULL,
	"estimated_price" integer,
	"estimated_timeline" varchar(100),
	"features" json DEFAULT '[]'::json,
	"icon" varchar(50) DEFAULT 'rocket_launch' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"client_id" integer,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "suggested_projects" ADD CONSTRAINT "suggested_projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "suggested_projects" ADD CONSTRAINT "suggested_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
