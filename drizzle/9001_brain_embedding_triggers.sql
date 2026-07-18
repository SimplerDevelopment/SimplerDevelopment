-- Triggers that auto-enqueue embedding jobs on every write to embedded
-- tables. The "constant thing" — any code path that mutates one of these
-- tables (TypeScript helpers, MCP tools, ad-hoc SQL, bulk imports) gets
-- the same automatic re-embed treatment for free.
--
-- One generic plpgsql function with the entity_type passed as a TG_ARGV.
-- For posts the client_id comes via client_websites; everything else has
-- it on the row directly.

CREATE OR REPLACE FUNCTION enqueue_embedding_job() RETURNS TRIGGER AS $$
DECLARE
  resolved_client_id INTEGER;
  ent_type TEXT := TG_ARGV[0];
  ent_id INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Posts can be agency-level (website_id IS NULL) — we never embedded
    -- them in the first place, so nothing to clean up.
    IF ent_type = 'post' AND OLD.website_id IS NULL THEN RETURN OLD; END IF;

    -- Direct cleanup. Bypass the queue for deletes — there's nothing to
    -- "embed", just chunks to remove.
    DELETE FROM brain_embeddings WHERE entity_type = ent_type AND entity_id = OLD.id;
    DELETE FROM brain_embedding_jobs WHERE entity_type = ent_type AND entity_id = OLD.id;
    RETURN OLD;
  END IF;

  -- INSERT or UPDATE — resolve client_id, then upsert a pending job.
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

-- Apply per table. Each table gets exactly one trigger covering all three
-- ops; the function dispatches on TG_OP. DROP first so re-running the
-- migration is safe.

DROP TRIGGER IF EXISTS tr_brain_notes_embed ON brain_notes;
CREATE TRIGGER tr_brain_notes_embed
  AFTER INSERT OR UPDATE OR DELETE ON brain_notes
  FOR EACH ROW EXECUTE FUNCTION enqueue_embedding_job('note');

DROP TRIGGER IF EXISTS tr_brain_meetings_embed ON brain_meetings;
CREATE TRIGGER tr_brain_meetings_embed
  AFTER INSERT OR UPDATE OR DELETE ON brain_meetings
  FOR EACH ROW EXECUTE FUNCTION enqueue_embedding_job('meeting');

DROP TRIGGER IF EXISTS tr_brain_relationships_embed ON brain_relationship_overlays;
CREATE TRIGGER tr_brain_relationships_embed
  AFTER INSERT OR UPDATE OR DELETE ON brain_relationship_overlays
  FOR EACH ROW EXECUTE FUNCTION enqueue_embedding_job('relationship');

DROP TRIGGER IF EXISTS tr_brain_tasks_embed ON brain_tasks;
CREATE TRIGGER tr_brain_tasks_embed
  AFTER INSERT OR UPDATE OR DELETE ON brain_tasks
  FOR EACH ROW EXECUTE FUNCTION enqueue_embedding_job('task');

DROP TRIGGER IF EXISTS tr_crm_companies_embed ON crm_companies;
CREATE TRIGGER tr_crm_companies_embed
  AFTER INSERT OR UPDATE OR DELETE ON crm_companies
  FOR EACH ROW EXECUTE FUNCTION enqueue_embedding_job('company');

DROP TRIGGER IF EXISTS tr_crm_contacts_embed ON crm_contacts;
CREATE TRIGGER tr_crm_contacts_embed
  AFTER INSERT OR UPDATE OR DELETE ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION enqueue_embedding_job('contact');

DROP TRIGGER IF EXISTS tr_crm_deals_embed ON crm_deals;
CREATE TRIGGER tr_crm_deals_embed
  AFTER INSERT OR UPDATE OR DELETE ON crm_deals
  FOR EACH ROW EXECUTE FUNCTION enqueue_embedding_job('deal');

DROP TRIGGER IF EXISTS tr_posts_embed ON posts;
CREATE TRIGGER tr_posts_embed
  AFTER INSERT OR UPDATE OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION enqueue_embedding_job('post');
