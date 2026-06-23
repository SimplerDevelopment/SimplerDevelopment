-- Fix the generic embedding trigger function so it works on tables without a
-- `website_id` column. The original 0065 version of this function had:
--
--   IF ent_type = 'post' AND OLD.website_id IS NULL THEN RETURN OLD; END IF;
--
-- inside the DELETE branch. PL/pgSQL plans the whole expression on every
-- invocation, so when the trigger fires on a non-`posts` table (brain_notes,
-- brain_meetings, etc.) it errors out with `record "old" has no field
-- "website_id"` even though `ent_type = 'post'` is false. Splitting the
-- condition into nested IFs makes the OLD.website_id reference reachable only
-- when the trigger is actually firing on `posts`.
--
-- The INSERT/UPDATE branch already used IF/ELSE for this and was unaffected.

CREATE OR REPLACE FUNCTION enqueue_embedding_job() RETURNS TRIGGER AS $$
DECLARE
  resolved_client_id INTEGER;
  ent_type TEXT := TG_ARGV[0];
  ent_id INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF ent_type = 'post' THEN
      IF OLD.website_id IS NULL THEN RETURN OLD; END IF;
    END IF;

    DELETE FROM brain_embeddings WHERE entity_type = ent_type AND entity_id = OLD.id;
    DELETE FROM brain_embedding_jobs WHERE entity_type = ent_type AND entity_id = OLD.id;
    RETURN OLD;
  END IF;

  IF ent_type = 'post' THEN
    IF NEW.website_id IS NULL THEN RETURN NEW; END IF;
    SELECT client_id INTO resolved_client_id FROM client_websites WHERE id = NEW.website_id;
  ELSE
    resolved_client_id := NEW.client_id;
  END IF;

  IF resolved_client_id IS NULL THEN RETURN NEW; END IF;
  ent_id := NEW.id;

  INSERT INTO brain_embedding_jobs
    (client_id, entity_type, entity_id, status, attempts, last_error, enqueued_at, started_at)
  VALUES
    (resolved_client_id, ent_type, ent_id, 'pending', 0, NULL, now(), NULL)
  ON CONFLICT (entity_type, entity_id)
  DO UPDATE SET
    status = 'pending',
    attempts = 0,
    last_error = NULL,
    enqueued_at = now(),
    started_at = NULL,
    client_id = EXCLUDED.client_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
