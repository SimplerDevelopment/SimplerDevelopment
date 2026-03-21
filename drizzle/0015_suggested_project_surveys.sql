ALTER TABLE "suggested_projects" ADD COLUMN "survey_fields" json DEFAULT '[]'::json;

CREATE TABLE "suggested_project_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "suggested_project_id" integer NOT NULL,
  "client_id" integer NOT NULL,
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "answers" json,
  "message" text,
  "admin_notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "spr_project_fk" FOREIGN KEY ("suggested_project_id") REFERENCES "suggested_projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "spr_client_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
