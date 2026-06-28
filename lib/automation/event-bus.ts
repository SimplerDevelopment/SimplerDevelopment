/**
 * Automation Event Bus
 *
 * In-process pub/sub for automation triggers PLUS a durable journal. API routes
 * call `emitEvent()` after mutations; the engine runs matching rules inline for
 * instant execution, and every event is also journaled to `automation_jobs` and
 * marked completed once handlers finish. The process-automation-jobs cron
 * re-runs any event whose in-process dispatch was dropped (e.g. a serverless
 * cold-start) — at-least-once delivery + retries, replacing the old
 * fire-and-forget that silently lost events.
 */

import { db } from '@/lib/db';
import { automationJobs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface AutomationEvent {
  event: string;        // e.g. 'booking.created', 'crm.deal.updated'
  clientId: number;
  userId: number;
  payload: Record<string, unknown>;
  timestamp: Date;
}

type EventHandler = (event: AutomationEvent) => Promise<void>;

const handlers: EventHandler[] = [];

/**
 * Register a handler that runs for every emitted event.
 * Called once at app startup by the automation engine.
 */
export function onEvent(handler: EventHandler): void {
  handlers.push(handler);
}

/**
 * Emit an automation event. Handlers run asynchronously — the caller does NOT
 * wait for automations to finish. The event is also journaled durably so a
 * dropped in-process dispatch is retried by the process-automation-jobs cron.
 */
export function emitEvent(
  event: string,
  clientId: number,
  userId: number,
  payload: Record<string, unknown>,
): void {
  const automationEvent: AutomationEvent = { event, clientId, userId, payload, timestamp: new Date() };
  // Floated so the API response isn't blocked.
  void dispatchWithJournal(automationEvent);
}

/** Run all registered handlers for an event (no journaling). Used by the retry
 *  cron to re-process a dropped event. */
export async function runHandlers(event: AutomationEvent): Promise<void> {
  await Promise.all(handlers.map((h) => h(event)));
}

async function dispatchWithJournal(event: AutomationEvent): Promise<void> {
  // Durable journal first — a single fast insert, far likelier to survive a
  // serverless cold-start than the full handler chain it backstops.
  let jobId: number | null = null;
  try {
    const [row] = await db
      .insert(automationJobs)
      .values({
        clientId: event.clientId,
        event: event.event,
        userId: event.userId,
        payload: event.payload,
        status: 'pending',
      })
      .returning({ id: automationJobs.id });
    jobId = row?.id ?? null;
  } catch (err) {
    console.error(`[automation] journal insert failed for ${event.event}:`, err);
  }

  // In-process dispatch — unchanged behavior; each handler isolated so one
  // failure doesn't sink the others.
  let allOk = true;
  await Promise.all(
    handlers.map((h) =>
      h(event).catch((err) => {
        allOk = false;
        console.error(`[automation] Handler error for ${event.event}:`, err);
      }),
    ),
  );

  // Mark done so the retry cron skips it. If the process died before reaching
  // here, the row stays 'pending' and the cron re-runs the event (at-least-once).
  if (jobId != null && allOk) {
    await db
      .update(automationJobs)
      .set({ status: 'completed', processedAt: new Date() })
      .where(eq(automationJobs.id, jobId))
      .catch(() => {});
  }
}

// ─── KNOWN EVENT TYPES (for NLP parser + UI reference) ─────────────────────

export const AUTOMATION_EVENTS = {
  // Booking
  'booking.created': 'A new booking page is created',
  'booking.guest_booked': 'A guest books a slot on a booking page',
  'booking.confirmed': 'A booking is confirmed',
  'booking.cancelled': 'A booking is cancelled',
  'booking.rescheduled': 'A booking is rescheduled',

  // CRM
  'crm.contact.created': 'A new CRM contact is created',
  'crm.contact.updated': 'A CRM contact is updated',
  'crm.deal.created': 'A new deal is created',
  'crm.deal.updated': 'A deal is updated (stage change, etc.)',
  'crm.deal.won': 'A deal is marked as won',
  'crm.deal.lost': 'A deal is marked as lost',

  // Email
  'email.campaign.sent': 'An email campaign is sent',
  'email.subscriber.added': 'A new subscriber joins a list',
  'email.subscriber.unsubscribed': 'A subscriber opts out',

  // Projects
  'project.created': 'A new project is created',
  'project.status.changed': 'A project status changes',
  'task.created': 'A kanban card/task is created',
  'task.completed': 'A kanban card/task is moved to done',
  'task.assigned': 'A task is assigned to someone',

  // Support
  'ticket.created': 'A support ticket is opened',
  'ticket.replied': 'A reply is added to a ticket',
  'ticket.resolved': 'A ticket is resolved',

  // Websites / Forms
  'form.submitted': 'A website form is submitted',
  'page.published': 'A website page is published',

  // Surveys
  'survey.response_submitted': 'A survey response is submitted',

  // Store / Orders
  'order.placed': 'A new order is placed',
  'order.paid': 'An order payment is received',
  'order.shipped': 'An order is shipped',
  'cart.abandoned': 'A cart with items is left inactive for over an hour',

  // Invoices
  'invoice.sent': 'An invoice is sent',
  'invoice.paid': 'An invoice is paid',
  'invoice.overdue': 'An invoice becomes overdue',

  // Proposals
  'proposal.sent': 'A proposal is sent to client',
  'proposal.viewed': 'A proposal is viewed',
  'proposal.accepted': 'A proposal is accepted',
  'proposal.declined': 'A proposal is declined',
} as const;

export type AutomationEventType = keyof typeof AUTOMATION_EVENTS;
