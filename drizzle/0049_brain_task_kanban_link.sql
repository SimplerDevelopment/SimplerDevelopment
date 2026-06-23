-- Company Brain — Phase 3
-- Adds the kanban-card link to brain_tasks so a Brain task can be promoted
-- into an existing project board. Nullable: tasks may live entirely in Brain.

ALTER TABLE "brain_tasks"
  ADD COLUMN IF NOT EXISTS "linked_kanban_card_id" integer
  REFERENCES "kanban_cards"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "brain_tasks_linked_kanban_card_idx"
  ON "brain_tasks" ("linked_kanban_card_id");
