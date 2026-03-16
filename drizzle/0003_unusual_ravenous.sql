CREATE TABLE "custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_type_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"field_type" varchar(50) NOT NULL,
	"options" json,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"help_text" text,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_custom_field_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"custom_field_id" integer NOT NULL,
	"value" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50) DEFAULT 'article',
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "post_types_name_unique" UNIQUE("name"),
	CONSTRAINT "post_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_post_type_id_post_types_id_fk" FOREIGN KEY ("post_type_id") REFERENCES "public"."post_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_custom_field_values" ADD CONSTRAINT "post_custom_field_values_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_custom_field_values" ADD CONSTRAINT "post_custom_field_values_custom_field_id_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;