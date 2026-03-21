ALTER TABLE "services" ADD COLUMN "survey_fields" json DEFAULT '[]'::json;

CREATE TABLE "service_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "service_id" integer NOT NULL,
  "client_id" integer NOT NULL,
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "answers" json,
  "message" text,
  "admin_notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "service_requests_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "service_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
