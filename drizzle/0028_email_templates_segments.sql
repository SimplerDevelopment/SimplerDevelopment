-- Email Templates
CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "category" varchar(50) DEFAULT 'custom' NOT NULL,
  "subject" varchar(255),
  "html_content" text NOT NULL,
  "thumbnail_url" varchar(500),
  "is_global" boolean DEFAULT false NOT NULL,
  "usage_count" integer DEFAULT 0 NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Email Subscriber Tags
CREATE TABLE IF NOT EXISTS "email_subscriber_tags" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "color" varchar(20) DEFAULT '#6366f1',
  "subscriber_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Tag Assignments (many-to-many)
CREATE TABLE IF NOT EXISTS "email_subscriber_tag_assignments" (
  "id" serial PRIMARY KEY NOT NULL,
  "subscriber_id" integer NOT NULL REFERENCES "email_subscribers"("id") ON DELETE CASCADE,
  "tag_id" integer NOT NULL REFERENCES "email_subscriber_tags"("id") ON DELETE CASCADE
);

-- Email Segments
CREATE TABLE IF NOT EXISTS "email_segments" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "rules" json DEFAULT '[]',
  "match_type" varchar(10) DEFAULT 'all' NOT NULL,
  "subscriber_count" integer DEFAULT 0 NOT NULL,
  "last_calculated_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "email_templates_client_idx" ON "email_templates" ("client_id");
CREATE INDEX IF NOT EXISTS "email_subscriber_tags_client_idx" ON "email_subscriber_tags" ("client_id");
CREATE INDEX IF NOT EXISTS "email_tag_assignments_subscriber_idx" ON "email_subscriber_tag_assignments" ("subscriber_id");
CREATE INDEX IF NOT EXISTS "email_tag_assignments_tag_idx" ON "email_subscriber_tag_assignments" ("tag_id");
CREATE INDEX IF NOT EXISTS "email_segments_client_idx" ON "email_segments" ("client_id");
