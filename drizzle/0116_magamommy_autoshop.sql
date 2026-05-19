-- Magamommy autonomous-shop tables.
-- Three tables: briefs (researcher output), concepts (concept-writer output),
-- drops (orchestrator state machine, one row per Monday cron firing).
-- See lib/db/schema/magamommy.ts for the source-of-truth schema.

CREATE TABLE IF NOT EXISTS "magamommy_briefs" (
  "id" serial PRIMARY KEY NOT NULL,
  "website_id" integer NOT NULL,
  "week_of" date NOT NULL,
  "topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "raw_model_response" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "magamommy_briefs_website_fk" FOREIGN KEY ("website_id")
    REFERENCES "client_websites"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "magamommy_briefs_website_idx" ON "magamommy_briefs" ("website_id");
CREATE INDEX IF NOT EXISTS "magamommy_briefs_week_idx" ON "magamommy_briefs" ("week_of");

CREATE TABLE IF NOT EXISTS "magamommy_concepts" (
  "id" serial PRIMARY KEY NOT NULL,
  "website_id" integer NOT NULL,
  "brief_id" integer NOT NULL,
  "topic_slug" varchar(120) NOT NULL,
  "slogan" varchar(120) NOT NULL,
  "tagline" text NOT NULL,
  "visual_prompt" text NOT NULL,
  "palette" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "placement" varchar(20) DEFAULT 'front' NOT NULL,
  "style" varchar(20) DEFAULT 'bold' NOT NULL,
  "alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "magamommy_concepts_website_fk" FOREIGN KEY ("website_id")
    REFERENCES "client_websites"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "magamommy_concepts_brief_fk" FOREIGN KEY ("brief_id")
    REFERENCES "magamommy_briefs"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "magamommy_concepts_website_idx" ON "magamommy_concepts" ("website_id");
CREATE INDEX IF NOT EXISTS "magamommy_concepts_brief_idx" ON "magamommy_concepts" ("brief_id");

CREATE TABLE IF NOT EXISTS "magamommy_drops" (
  "id" serial PRIMARY KEY NOT NULL,
  "website_id" integer NOT NULL,
  "week_of" date NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "brief_id" integer,
  "concept_id" integer,
  "design_id" uuid,
  "product_id" integer,
  "error" text,
  "error_stage" varchar(30),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "magamommy_drops_website_fk" FOREIGN KEY ("website_id")
    REFERENCES "client_websites"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "magamommy_drops_brief_fk" FOREIGN KEY ("brief_id")
    REFERENCES "magamommy_briefs"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "magamommy_drops_concept_fk" FOREIGN KEY ("concept_id")
    REFERENCES "magamommy_concepts"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "magamommy_drops_product_fk" FOREIGN KEY ("product_id")
    REFERENCES "products"("id") ON DELETE set null ON UPDATE no action
);

-- Idempotence guarantee — one drop per week per site.
CREATE UNIQUE INDEX IF NOT EXISTS "magamommy_drops_site_week_uidx" ON "magamommy_drops" ("website_id", "week_of");
CREATE INDEX IF NOT EXISTS "magamommy_drops_status_idx" ON "magamommy_drops" ("status");
