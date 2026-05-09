// Walks every active card_recurrences row that is due (next_fire_at <= now)
// and materializes a card per row. Designed to be called from a cron worker
// at /api/cron/pm-recurrences. Idempotent only if you don't re-call for the
// same wall-clock window; the processor advances next_fire_at after each
// successful materialization.

import { db } from '@/lib/db';
import {
  cardRecurrences,
  cardTemplates,
  kanbanCards,
  kanbanCardLabels,
  kanbanCardChecklistItems,
  kanbanColumns,
} from '@/lib/db/schema';
import { and, eq, lte, sql } from 'drizzle-orm';
import { computeNextFireAt, renderRecurrenceTitle, type RecurrenceConfig } from './recurrence-scheduler';
import { logCardActivity } from '@/lib/pm-activity';

interface ProcessSummary {
  processed: number;
  cardsCreated: number;
  errors: { recurrenceId: number; error: string }[];
}

export async function processRecurrences(now: Date = new Date()): Promise<ProcessSummary> {
  const summary: ProcessSummary = { processed: 0, cardsCreated: 0, errors: [] };

  const due = await db.select().from(cardRecurrences).where(and(
    eq(cardRecurrences.active, true),
    lte(cardRecurrences.nextFireAt, now),
  ));

  for (const rec of due) {
    summary.processed += 1;
    try {
      // Resolve template (if linked).
      let template: typeof cardTemplates.$inferSelect | null = null;
      if (rec.templateId != null) {
        const [tpl] = await db.select().from(cardTemplates).where(eq(cardTemplates.id, rec.templateId)).limit(1);
        template = tpl ?? null;
      }

      // Title resolution: explicit titlePattern wins over template.
      const pattern = rec.titlePattern ?? template?.payload.titlePattern ?? `Recurring task — {{date}}`;
      const title = renderRecurrenceTitle(pattern, rec.nextFireAt);

      // Position the card at the bottom of its column.
      const existing = await db.select({ id: kanbanCards.id }).from(kanbanCards)
        .where(eq(kanbanCards.columnId, rec.columnId));

      const [{ max }] = await db
        .select({ max: sql<number | null>`MAX(${kanbanCards.number})` })
        .from(kanbanCards)
        .where(eq(kanbanCards.projectId, rec.projectId));
      const nextNumber = (max ?? 0) + 1;

      const [card] = await db.insert(kanbanCards).values({
        columnId: rec.columnId,
        projectId: rec.projectId,
        number: nextNumber,
        title,
        description: rec.description ?? template?.payload.description ?? null,
        priority: template?.payload.priority ?? 'medium',
        order: existing.length,
        cardType: template?.payload.cardType ?? 'task',
        workflowState: template?.payload.workflowState ?? 'todo',
        storyPoints: template?.payload.storyPoints ?? null,
        createdBy: rec.createdBy,
      }).returning();
      summary.cardsCreated += 1;

      // Apply template-side artifacts.
      if (template) {
        const labelIds = Array.isArray(template.payload.labelIds) ? template.payload.labelIds : [];
        if (labelIds.length > 0) {
          await db.insert(kanbanCardLabels)
            .values(labelIds.map(labelId => ({ cardId: card.id, labelId })))
            .onConflictDoNothing()
            .catch(() => {});
        }
        const items = Array.isArray(template.payload.checklist) ? template.payload.checklist : [];
        if (items.length > 0) {
          await db.insert(kanbanCardChecklistItems).values(
            items.map((it, idx) => ({
              cardId: card.id,
              text: String(it.text ?? '').slice(0, 500),
              order: typeof it.order === 'number' ? it.order : idx,
              createdBy: rec.createdBy,
            })),
          ).catch(() => {});
        }
      }

      await logCardActivity(card.id, rec.createdBy, 'card.created', {
        title,
        recurrenceId: rec.id,
        cadence: rec.cadence,
      });

      // Advance the schedule. nextFireAt always strictly increases — even if
      // the cron lagged, we use the original nextFireAt as the anchor so the
      // schedule doesn't drift toward the lag time.
      const cfg: RecurrenceConfig = {
        cadence: rec.cadence as RecurrenceConfig['cadence'],
        dayOfWeek: rec.dayOfWeek,
        dayOfMonth: rec.dayOfMonth,
        hourUtc: rec.hourUtc,
      };
      const newNextFire = computeNextFireAt(rec.nextFireAt, cfg);

      await db.update(cardRecurrences).set({
        lastFiredAt: now,
        lastFiredCardId: card.id,
        nextFireAt: newNextFire,
        updatedAt: now,
      }).where(eq(cardRecurrences.id, rec.id));
    } catch (err) {
      summary.errors.push({ recurrenceId: rec.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return summary;
}
