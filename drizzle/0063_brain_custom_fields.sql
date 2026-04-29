-- Brain custom fields — per-tenant, per-entity-type extensible metadata.
-- Mirrors crm_custom_fields/values shape but lives in its own table pair so
-- Brain and CRM custom-field UIs/lifecycles stay decoupled.
--
-- Two-layer model:
--   * brain_custom_fields           — definitions (one row per field)
--   * brain_custom_field_values     — values (one row per (definition, entity))
--
-- Definitions can be 'manual' (user-created via UI) or 'auto-derived'
-- (created by an importer when it encounters an unknown key). Auto-derived
-- defs default to text; users can re-type them later.

CREATE TABLE IF NOT EXISTS "brain_custom_fields" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "entity_type" varchar(20) NOT NULL,
  "field_name" varchar(100) NOT NULL,
  "field_label" varchar(150),
  "field_type" varchar(20) NOT NULL,
  "options" json,
  "required" boolean DEFAULT false NOT NULL,
  "filterable" boolean DEFAULT false NOT NULL,
  "category" varchar(100),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "source" varchar(50) DEFAULT 'manual' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_custom_fields_unique_idx"
  ON "brain_custom_fields" ("client_id", "entity_type", "field_name");

CREATE INDEX IF NOT EXISTS "brain_custom_fields_client_entity_idx"
  ON "brain_custom_fields" ("client_id", "entity_type");

CREATE TABLE IF NOT EXISTS "brain_custom_field_values" (
  "id" serial PRIMARY KEY,
  "custom_field_id" integer NOT NULL REFERENCES "brain_custom_fields"("id") ON DELETE CASCADE,
  "entity_type" varchar(20) NOT NULL,
  "entity_id" integer NOT NULL,
  "value" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Each (definition, entity) pair is unique — upsert on this index.
CREATE UNIQUE INDEX IF NOT EXISTS "brain_custom_field_values_unique_idx"
  ON "brain_custom_field_values" ("custom_field_id", "entity_id");

-- For "show me all field values for note X" — primary read pattern.
CREATE INDEX IF NOT EXISTS "brain_custom_field_values_entity_idx"
  ON "brain_custom_field_values" ("entity_type", "entity_id");
