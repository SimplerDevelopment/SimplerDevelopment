-- Microsoft Teams per-user delegated OAuth connections.
-- Mirrors google_workspace_user_connections in shape; multi-tenant by design.
-- Subscription columns are populated by the renewal cron + webhook flow (PR 2).
--
-- NOTE: hand-written per the project convention (see CLAUDE.md memory on
-- migration tracker drift). bun run db:generate currently fails with a
-- snapshot-chain collision because the on-disk journal jumps 0003 → 0070;
-- this file should be applied manually to prod and staging until that drift
-- is reconciled. After the drift is fixed, this migration will be regenerated
-- from lib/db/schema/tools.ts and this file can be replaced with the
-- canonical drizzle output.

CREATE TABLE "microsoft_teams_user_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"microsoft_tenant_id" varchar(64) NOT NULL,
	"microsoft_user_id" varchar(64) NOT NULL,
	"microsoft_account_email" varchar(320) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subscription_id" varchar(64),
	"subscription_resource" text,
	"subscription_expiration" timestamp,
	"subscription_client_state" varchar(64),
	"delta_token" text,
	"last_sync_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "microsoft_teams_user_connections" ADD CONSTRAINT "microsoft_teams_user_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microsoft_teams_user_connections" ADD CONSTRAINT "microsoft_teams_user_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "microsoft_teams_user_connections_client_user_unique" ON "microsoft_teams_user_connections" ("client_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "microsoft_teams_user_connections_subscription_id" ON "microsoft_teams_user_connections" ("subscription_id");
