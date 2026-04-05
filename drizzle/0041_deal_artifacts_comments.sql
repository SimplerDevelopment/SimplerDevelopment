CREATE TABLE IF NOT EXISTS "crm_deal_artifacts" (
  "id" serial PRIMARY KEY NOT NULL,
  "deal_id" integer NOT NULL REFERENCES "crm_deals"("id") ON DELETE CASCADE,
  "artifact_type" varchar(50) NOT NULL,
  "artifact_id" integer NOT NULL,
  "display_title" varchar(255) NOT NULL,
  "pinned" boolean DEFAULT false NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_deal_comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "deal_id" integer NOT NULL REFERENCES "crm_deals"("id") ON DELETE CASCADE,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "attachments" json DEFAULT '[]',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_deal_artifacts_deal" ON "crm_deal_artifacts" ("deal_id");
CREATE INDEX IF NOT EXISTS "idx_deal_comments_deal" ON "crm_deal_comments" ("deal_id");
