CREATE TABLE "survey_webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_id" integer NOT NULL,
	"event" varchar(50) NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) NOT NULL,
	"status_code" integer,
	"request_body" json,
	"response_body" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD COLUMN "last_fired_at" timestamp;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD COLUMN "last_status" integer;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD COLUMN "failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_webhook_deliveries" ADD CONSTRAINT "survey_webhook_deliveries_webhook_id_survey_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."survey_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_webhooks" ADD CONSTRAINT "survey_webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;