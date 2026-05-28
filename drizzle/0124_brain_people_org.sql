-- Brain Phase 4 — People + Org graph.
--
-- Adds five tables: brain_people (internal humans w/ reports-to self-FK),
-- brain_org_units (hierarchical teams/departments w/ ltree-style `path` +
-- self-FK on parent_id), brain_person_org_units (many-to-many), and the
-- expertise tag namespace + junction (brain_expertise_tags +
-- brain_person_expertise). See lib/db/schema/brain.ts for column docs.
--
-- Hand-applied to switchyard locally (drizzle journal is stuck on an older
-- collision — see drizzle/0119_schema_only_columns.sql header). Operator
-- applies to metro before staging→main merge. Idempotent — every CREATE is
-- guarded by IF NOT EXISTS on indexes; tables themselves are guarded by
-- CREATE TABLE IF NOT EXISTS so a re-run is a no-op.
--
-- Declaration order matters for FKs:
--   1) brain_people              — self-FK manager_id
--   2) brain_org_units           — FK lead_person_id → brain_people; self-FK parent_id
--   3) brain_person_org_units    — junction
--   4) brain_expertise_tags
--   5) brain_person_expertise    — junction

-- ─── brain_people ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "brain_people" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "full_name" varchar(200) NOT NULL,
  "email" varchar(255),
  "manager_id" integer REFERENCES "brain_people"("id") ON DELETE set null,
  "title" varchar(200),
  "start_date" timestamp,
  "end_date" timestamp,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "notes" text,
  "profile_urls" json DEFAULT '[]'::json NOT NULL,
  "source" varchar(50) DEFAULT 'manual' NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "brain_people_client_idx"
  ON "brain_people" ("client_id");
CREATE INDEX IF NOT EXISTS "brain_people_client_status_idx"
  ON "brain_people" ("client_id", "status");
CREATE INDEX IF NOT EXISTS "brain_people_manager_idx"
  ON "brain_people" ("manager_id");
CREATE INDEX IF NOT EXISTS "brain_people_user_idx"
  ON "brain_people" ("user_id");

-- ─── brain_org_units ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "brain_org_units" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "parent_id" integer REFERENCES "brain_org_units"("id") ON DELETE cascade,
  "name" varchar(150) NOT NULL,
  "slug" varchar(150) NOT NULL,
  "path" varchar(1000) NOT NULL,
  "description" text,
  "lead_person_id" integer REFERENCES "brain_people"("id") ON DELETE set null,
  "color" varchar(20),
  "icon" varchar(50),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_org_units_client_slug_idx"
  ON "brain_org_units" ("client_id", "slug");
CREATE INDEX IF NOT EXISTS "brain_org_units_client_parent_idx"
  ON "brain_org_units" ("client_id", "parent_id");
CREATE INDEX IF NOT EXISTS "brain_org_units_path_idx"
  ON "brain_org_units" ("path");

-- ─── brain_person_org_units (junction) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "brain_person_org_units" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "person_id" integer NOT NULL REFERENCES "brain_people"("id") ON DELETE cascade,
  "org_unit_id" integer NOT NULL REFERENCES "brain_org_units"("id") ON DELETE cascade,
  "primary" boolean DEFAULT false NOT NULL,
  "role_in_unit" varchar(150),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_person_org_units_person_unit_idx"
  ON "brain_person_org_units" ("person_id", "org_unit_id");
CREATE INDEX IF NOT EXISTS "brain_person_org_units_unit_idx"
  ON "brain_person_org_units" ("org_unit_id");

-- ─── brain_expertise_tags ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "brain_expertise_tags" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "name" varchar(100) NOT NULL,
  "slug" varchar(100) NOT NULL,
  "description" text,
  "source" varchar(30) DEFAULT 'manual' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_expertise_tags_client_slug_idx"
  ON "brain_expertise_tags" ("client_id", "slug");

-- ─── brain_person_expertise (junction) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "brain_person_expertise" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "person_id" integer NOT NULL REFERENCES "brain_people"("id") ON DELETE cascade,
  "expertise_tag_id" integer NOT NULL REFERENCES "brain_expertise_tags"("id") ON DELETE cascade,
  "level" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_person_expertise_person_tag_idx"
  ON "brain_person_expertise" ("person_id", "expertise_tag_id");
CREATE INDEX IF NOT EXISTS "brain_person_expertise_tag_idx"
  ON "brain_person_expertise" ("expertise_tag_id");
