CREATE TABLE "booking_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"duration" integer DEFAULT 30 NOT NULL,
	"buffer_before" integer DEFAULT 0 NOT NULL,
	"buffer_after" integer DEFAULT 15 NOT NULL,
	"max_advance_days" integer DEFAULT 60 NOT NULL,
	"min_notice_mins" integer DEFAULT 60 NOT NULL,
	"timezone" varchar(100) DEFAULT 'America/New_York' NOT NULL,
	"availability" json DEFAULT '[{"day":1,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":2,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":3,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":4,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":5,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":0,"startTime":"09:00","endTime":"17:00","enabled":false},{"day":6,"startTime":"09:00","endTime":"17:00","enabled":false}]'::json,
	"questions" json DEFAULT '[]'::json,
	"color" varchar(7) DEFAULT '#2563eb',
	"active" boolean DEFAULT true NOT NULL,
	"google_calendar_sync" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_page_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"guest_name" varchar(255) NOT NULL,
	"guest_email" varchar(255) NOT NULL,
	"guest_phone" varchar(50),
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"timezone" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'confirmed' NOT NULL,
	"answers" json,
	"notes" text,
	"google_event_id" varchar(255),
	"cancel_token" varchar(64) NOT NULL,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendar_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"calendar_id" varchar(255) DEFAULT 'primary' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_tokens_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_booking_page_id_booking_pages_id_fk" FOREIGN KEY ("booking_page_id") REFERENCES "public"."booking_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_tokens" ADD CONSTRAINT "google_calendar_tokens_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;