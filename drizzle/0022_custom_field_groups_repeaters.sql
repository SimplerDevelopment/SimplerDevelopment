ALTER TABLE "custom_fields" ADD COLUMN "parent_id" integer;
--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_parent_id_custom_fields_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;
