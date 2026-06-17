-- Custom SQL migration file, put your code below! --

-- 1. Add scopes column to automation_rules
ALTER TABLE "automation_rules" ADD COLUMN "scopes" json DEFAULT '[]'::json NOT NULL;--> statement-breakpoint

-- 2. Create agent_action_log table
CREATE TABLE "agent_action_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer,
	"source" varchar(20) NOT NULL,
	"tool" varchar(100) NOT NULL,
	"scope_required" varchar(50),
	"scope_allowed" boolean,
	"params_hash" text NOT NULL,
	"outcome" varchar(20) NOT NULL,
	"error_message" text,
	"rule_id" integer,
	"key_id" integer,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "agent_action_log" ADD CONSTRAINT "agent_action_log_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_log" ADD CONSTRAINT "agent_action_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_log" ADD CONSTRAINT "agent_action_log_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE set null ON UPDATE no action;
