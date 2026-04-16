CREATE TABLE IF NOT EXISTS "portal_api_keys" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "name" varchar(100) NOT NULL,
  "key_hash" varchar(128) NOT NULL,
  "key_preview" varchar(20) NOT NULL,
  "scopes" json DEFAULT '[]'::json NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "last_used_at" timestamp,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "portal_api_keys_key_hash_unique" UNIQUE("key_hash")
);

DO $$ BEGIN
  ALTER TABLE "portal_api_keys" ADD CONSTRAINT "portal_api_keys_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "portal_api_keys" ADD CONSTRAINT "portal_api_keys_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "portal_api_keys_client_idx" ON "portal_api_keys" ("client_id");
CREATE INDEX IF NOT EXISTS "portal_api_keys_user_idx" ON "portal_api_keys" ("user_id");
