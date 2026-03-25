CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"stripe_payment_method_id" varchar(255) NOT NULL,
	"brand" varchar(50) NOT NULL,
	"last4" varchar(4) NOT NULL,
	"exp_month" integer NOT NULL,
	"exp_year" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;