-- Brain note templates — reusable note bodies a tenant can apply manually,
-- via slash command, on a daily cron, or auto-attached to new meetings. The
-- body is plain markdown with `{{variables}}` resolved by lib/brain/template.ts.
--
-- Daily cron: `app/api/cron/brain-daily-notes/route.ts` walks every client and
-- materializes one note per (template.id, YYYY-MM-DD). The cron's idempotency
-- key is `brain_notes.source_url = 'daily://<templateId>/<YYYY-MM-DD>'`.

CREATE TABLE IF NOT EXISTS "brain_note_templates" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(150) NOT NULL,
  "body" text NOT NULL,
  -- 'manual' | 'daily' | 'meeting' | 'slash'
  "trigger" varchar(50) NOT NULL DEFAULT 'manual',
  -- string[] of variable names this template references (UI hint)
  "variables" json,
  "enabled" boolean NOT NULL DEFAULT true,
  -- Optional pre-populated tags for notes created from this template.
  "default_tags" json,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "brain_note_templates_client_idx"
  ON "brain_note_templates" ("client_id");

CREATE UNIQUE INDEX IF NOT EXISTS "brain_note_templates_client_name_idx"
  ON "brain_note_templates" ("client_id", "name");
