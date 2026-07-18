-- Brain perf indexes. Must be hand-applied to metro before staging→main merge.
--
-- Adds:
--   1. pg_trgm extension + GIN trigram indexes on every text column hit by
--      `ILIKE '%q%'` in brain_search (lib/brain/search.ts) so the planner
--      stops sequential-scanning brain_meetings.transcript / brain_notes.body
--      on every keystroke of the search UI.
--   2. (client_id, entity_type) btree on brain_embeddings — the HNSW vector
--      index alone handles the ORDER BY vector <=> q, but the planner needs
--      a selective predicate to narrow the candidate set before the cosine
--      scan. brain_embeddings_client_idx and brain_embeddings_entity_idx
--      exist but neither matches the actual filter shape.
--   3. brain_meetings (client_id, created_at) for listMeetings default order.
--      A plain btree covers ORDER BY ... DESC in both directions.
--
-- Idempotent — safe to re-run. Does NOT touch the existing HNSW index.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── GIN trigram indexes for brain_search ILIKE queries ─────────────────────

CREATE INDEX IF NOT EXISTS brain_meetings_transcript_trgm_idx
  ON brain_meetings USING gin (transcript gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_meetings_title_trgm_idx
  ON brain_meetings USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_meetings_ai_summary_trgm_idx
  ON brain_meetings USING gin (ai_summary gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_meetings_human_summary_trgm_idx
  ON brain_meetings USING gin (human_summary gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_notes_body_trgm_idx
  ON brain_notes USING gin (body gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_notes_title_trgm_idx
  ON brain_notes USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_tasks_title_trgm_idx
  ON brain_tasks USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_tasks_description_trgm_idx
  ON brain_tasks USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_relationship_overlays_summary_trgm_idx
  ON brain_relationship_overlays USING gin (summary gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_relationship_overlays_open_loops_trgm_idx
  ON brain_relationship_overlays USING gin (open_loops gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_relationship_overlays_current_priorities_trgm_idx
  ON brain_relationship_overlays USING gin (current_priorities gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_decisions_rationale_trgm_idx
  ON brain_decisions USING gin (rationale gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_decisions_title_trgm_idx
  ON brain_decisions USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_glossary_terms_definition_trgm_idx
  ON brain_glossary_terms USING gin (definition gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_glossary_terms_term_trgm_idx
  ON brain_glossary_terms USING gin (term gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_people_notes_trgm_idx
  ON brain_people USING gin (notes gin_trgm_ops);

-- ─── HNSW pre-filter composite ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS brain_embeddings_client_entity_idx
  ON brain_embeddings (client_id, entity_type);

-- ─── listMeetings default order ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS brain_meetings_client_created_idx
  ON brain_meetings (client_id, created_at);
