-- Client Portal Schema Migration

CREATE TABLE IF NOT EXISTS "clients" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "company" varchar(255),
  "phone" varchar(50),
  "website" varchar(255),
  "address" text,
  "stripe_customer_id" varchar(255),
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "projects" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "status" varchar(50) DEFAULT 'active' NOT NULL,
  "start_date" timestamp,
  "due_date" timestamp,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kanban_columns" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "color" varchar(7),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kanban_cards" (
  "id" serial PRIMARY KEY NOT NULL,
  "column_id" integer NOT NULL REFERENCES "kanban_columns"("id") ON DELETE CASCADE,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "description" text,
  "assigned_to" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "due_date" timestamp,
  "priority" varchar(20) DEFAULT 'medium',
  "order" integer DEFAULT 0 NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" serial PRIMARY KEY NOT NULL,
  "number" integer NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL,
  "subject" varchar(255) NOT NULL,
  "status" varchar(50) DEFAULT 'open' NOT NULL,
  "priority" varchar(20) DEFAULT 'medium' NOT NULL,
  "category" varchar(50) DEFAULT 'general',
  "assigned_to" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ticket_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticket_id" integer NOT NULL REFERENCES "support_tickets"("id") ON DELETE CASCADE,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "is_internal" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "services" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL UNIQUE,
  "description" text,
  "category" varchar(50) NOT NULL,
  "price" integer NOT NULL,
  "billing_cycle" varchar(20) DEFAULT 'once',
  "stripe_price_id" varchar(255),
  "active" boolean DEFAULT true NOT NULL,
  "features" json DEFAULT '[]',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "client_services" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "service_id" integer NOT NULL REFERENCES "services"("id") ON DELETE RESTRICT,
  "status" varchar(50) DEFAULT 'active' NOT NULL,
  "start_date" timestamp DEFAULT now(),
  "renewal_date" timestamp,
  "notes" text,
  "metadata" json,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invoices" (
  "id" serial PRIMARY KEY NOT NULL,
  "number" varchar(50) NOT NULL UNIQUE,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL,
  "status" varchar(50) DEFAULT 'draft' NOT NULL,
  "due_date" timestamp,
  "paid_at" timestamp,
  "stripe_payment_intent_id" varchar(255),
  "stripe_checkout_session_id" varchar(255),
  "subtotal" integer NOT NULL,
  "tax" integer DEFAULT 0 NOT NULL,
  "total" integer NOT NULL,
  "notes" text,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invoice_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "invoice_id" integer NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "description" varchar(255) NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "unit_price" integer NOT NULL,
  "total" integer NOT NULL,
  "service_id" integer REFERENCES "services"("id") ON DELETE SET NULL
);
