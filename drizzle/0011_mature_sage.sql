CREATE TABLE "github_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"github_user_id" integer NOT NULL,
	"github_username" varchar(100) NOT NULL,
	"access_token" text NOT NULL,
	"scope" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "subdomain" varchar(100);--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "github_repo_name" varchar(255);--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "github_repo_url" varchar(500);--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "vercel_project_id" varchar(255);--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "vercel_project_url" varchar(500);--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "vercel_domain" varchar(255);--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "deployment_status" varchar(50) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "last_deployed_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN "provision_error" text;--> statement-breakpoint
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;