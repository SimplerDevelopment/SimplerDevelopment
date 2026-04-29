-- Brain Knowledge + Calendar — Phase A.
-- Knowledge: brain_notes table for free-form notes/documents linked to
-- relationships, deals, contacts, or meetings.
-- Calendar:  brain_calendar_events table for scheduling free-form items
--   distinct from tasks (which use due_date) and meetings (which record past
--   communications). Phase C will add bidirectional Google Calendar sync —
--   the google_event_id / google_calendar_id / last_synced_at columns are
--   reserved here so no extra migration is needed when sync ships.
-- Settings: enabled_modules JSON gets a `calendar` key (default true) and
-- the existing `knowledge` key is flipped on for newly-eligible profiles.

CREATE TABLE IF NOT EXISTS "brain_notes" (
  "id"                       serial PRIMARY KEY,
  "client_id"                integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "title"                    varchar(255) NOT NULL,
  "body"                     text NOT NULL DEFAULT '',
  "meeting_id"               integer REFERENCES "brain_meetings"("id") ON DELETE SET NULL,
  "relationship_overlay_id"  integer REFERENCES "brain_relationship_overlays"("id") ON DELETE SET NULL,
  "company_id"               integer REFERENCES "crm_companies"("id") ON DELETE SET NULL,
  "deal_id"                  integer REFERENCES "crm_deals"("id") ON DELETE SET NULL,
  "contact_id"               integer REFERENCES "crm_contacts"("id") ON DELETE SET NULL,
  "tags"                     json NOT NULL DEFAULT '[]'::json,
  "confidentiality_level"    varchar(20) NOT NULL DEFAULT 'standard',
  "pinned"                   boolean NOT NULL DEFAULT false,
  "source"                   varchar(50) NOT NULL DEFAULT 'manual',
  "review_item_id"           integer REFERENCES "brain_ai_review_items"("id") ON DELETE SET NULL,
  "created_by"               integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"               timestamp NOT NULL DEFAULT now(),
  "updated_at"               timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "brain_notes_client_idx"          ON "brain_notes" ("client_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "brain_notes_relationship_idx"    ON "brain_notes" ("relationship_overlay_id");
CREATE INDEX IF NOT EXISTS "brain_notes_company_idx"         ON "brain_notes" ("company_id");
CREATE INDEX IF NOT EXISTS "brain_notes_deal_idx"            ON "brain_notes" ("deal_id");
CREATE INDEX IF NOT EXISTS "brain_notes_contact_idx"         ON "brain_notes" ("contact_id");
CREATE INDEX IF NOT EXISTS "brain_notes_meeting_idx"         ON "brain_notes" ("meeting_id");

CREATE TABLE IF NOT EXISTS "brain_calendar_events" (
  "id"                                 serial PRIMARY KEY,
  "client_id"                          integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "title"                              varchar(255) NOT NULL,
  "description"                        text,
  "start_at"                           timestamp NOT NULL,
  "end_at"                             timestamp NOT NULL,
  "all_day"                            boolean NOT NULL DEFAULT false,
  "timezone"                           varchar(100) NOT NULL DEFAULT 'UTC',
  "location"                           varchar(500),
  "link"                               varchar(1000),
  "related_task_id"                    integer REFERENCES "brain_tasks"("id") ON DELETE SET NULL,
  "related_meeting_id"                 integer REFERENCES "brain_meetings"("id") ON DELETE SET NULL,
  "related_relationship_overlay_id"    integer REFERENCES "brain_relationship_overlays"("id") ON DELETE SET NULL,
  "source"                             varchar(20) NOT NULL DEFAULT 'manual',
  "google_event_id"                    varchar(255),
  "google_calendar_id"                 varchar(255),
  "last_synced_at"                     timestamp,
  "created_by"                         integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"                         timestamp NOT NULL DEFAULT now(),
  "updated_at"                         timestamp NOT NULL DEFAULT now()
);

-- Range queries (agenda for [from, to]) hit start_at and end_at; this
-- composite index covers the common "events overlapping [from, to]" filter
-- (start_at < to AND end_at >= from), per-client.
CREATE INDEX IF NOT EXISTS "brain_calendar_events_client_range_idx"
  ON "brain_calendar_events" ("client_id", "start_at", "end_at");

-- Reverse-lookup index for Phase C — when Google Calendar pushes a webhook
-- with a googleEventId, we resolve back to the local row in O(log n).
CREATE INDEX IF NOT EXISTS "brain_calendar_events_google_event_idx"
  ON "brain_calendar_events" ("google_event_id")
  WHERE "google_event_id" IS NOT NULL;

-- Backfill enabled_modules: turn on `calendar` (default true) and `knowledge`
-- (now that the module has a real implementation backing it).
UPDATE brain_profiles
   SET enabled_modules = jsonb_set(
         jsonb_set(
           enabled_modules::jsonb,
           '{calendar}',
           'true'::jsonb,
           true
         ),
         '{knowledge}',
         'true'::jsonb,
         false  -- only set if missing; respect users who explicitly turned it off
       )
 WHERE NOT (enabled_modules::jsonb ? 'calendar')
    OR NOT (enabled_modules::jsonb ? 'knowledge');
