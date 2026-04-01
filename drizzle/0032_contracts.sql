-- Contracts
CREATE TABLE IF NOT EXISTS "crm_contracts" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "proposal_id" integer REFERENCES "crm_proposals"("id") ON DELETE SET NULL,
  "deal_id" integer REFERENCES "crm_deals"("id") ON DELETE SET NULL,
  "contact_id" integer REFERENCES "crm_contacts"("id") ON DELETE SET NULL,
  "company_id" integer REFERENCES "crm_companies"("id") ON DELETE SET NULL,
  "title" varchar(255) NOT NULL,
  "summary" text,
  "status" varchar(30) DEFAULT 'draft' NOT NULL,
  "clauses" json DEFAULT '[]',
  "line_items" json DEFAULT '[]',
  "fees" json DEFAULT '[]',
  "currency" varchar(3) DEFAULT 'USD',
  "valid_until" timestamp,
  "client_token" varchar(64) NOT NULL UNIQUE,
  "document_hash" varchar(64),
  "accent_color" varchar(20) DEFAULT '#2563eb',
  "logo_url" varchar(500),
  "footer_text" text,
  "sent_at" timestamp,
  "fully_executed_at" timestamp,
  "voided_at" timestamp,
  "void_reason" text,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Contract Signers (multi-party)
CREATE TABLE IF NOT EXISTS "crm_contract_signers" (
  "id" serial PRIMARY KEY NOT NULL,
  "contract_id" integer NOT NULL REFERENCES "crm_contracts"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "email" varchar(255) NOT NULL,
  "role" varchar(100) DEFAULT 'signer' NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "token" varchar(64) NOT NULL UNIQUE,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "signature_name" varchar(255),
  "signature_data" text,
  "signed_at" timestamp,
  "signed_ip" varchar(45),
  "viewed_at" timestamp,
  "declined_at" timestamp,
  "decline_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Contract Templates
CREATE TABLE IF NOT EXISTS "crm_contract_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "clauses" json DEFAULT '[]',
  "line_items" json DEFAULT '[]',
  "fees" json DEFAULT '[]',
  "accent_color" varchar(20) DEFAULT '#2563eb',
  "footer_text" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "crm_contracts_client_idx" ON "crm_contracts" ("client_id");
CREATE INDEX IF NOT EXISTS "crm_contracts_status_idx" ON "crm_contracts" ("client_id", "status");
CREATE INDEX IF NOT EXISTS "crm_contract_signers_contract_idx" ON "crm_contract_signers" ("contract_id");
