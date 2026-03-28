-- AI Credit System

-- Add included AI credits to services
ALTER TABLE "services" ADD COLUMN "included_ai_credits" integer NOT NULL DEFAULT 0;

-- Add credit grant tracking to client_services
ALTER TABLE "client_services" ADD COLUMN "credits_granted_at" timestamp;

-- Immutable ledger for all credit transactions
CREATE TABLE "ai_credit_ledger" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "type" varchar(20) NOT NULL,
  "amount" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "description" text,
  "service_category" varchar(50),
  "reference_id" varchar(255),
  "created_at" timestamp DEFAULT NOW() NOT NULL
);

-- Fast balance lookup cache
CREATE TABLE "ai_credit_balances" (
  "client_id" integer PRIMARY KEY REFERENCES "clients"("id") ON DELETE CASCADE,
  "balance" integer NOT NULL DEFAULT 0,
  "monthly_grant" integer NOT NULL DEFAULT 0,
  "pay_as_you_go" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp DEFAULT NOW() NOT NULL
);

-- Purchasable credit top-up packages
CREATE TABLE "ai_credit_packages" (
  "id" serial PRIMARY KEY,
  "name" varchar(100) NOT NULL,
  "tokens" integer NOT NULL,
  "price" integer NOT NULL,
  "stripe_price_id" varchar(255),
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX "idx_ai_credit_ledger_client" ON "ai_credit_ledger" ("client_id");
CREATE INDEX "idx_ai_credit_ledger_created" ON "ai_credit_ledger" ("client_id", "created_at" DESC);