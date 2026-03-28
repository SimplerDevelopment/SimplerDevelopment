-- Usage metering + bundle support

-- Add usage limits to services
ALTER TABLE "services" ADD COLUMN "usage_limits" json DEFAULT '{}';

-- Usage metering table
CREATE TABLE "usage_meters" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "category" varchar(50) NOT NULL,
  "period" varchar(7) NOT NULL,
  "usage" integer NOT NULL DEFAULT 0,
  "included" integer NOT NULL DEFAULT 0,
  "overage_rate" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT NOW() NOT NULL,
  "updated_at" timestamp DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX "idx_usage_meters_unique" ON "usage_meters" ("client_id", "category", "period");
CREATE INDEX "idx_usage_meters_period" ON "usage_meters" ("client_id", "period");