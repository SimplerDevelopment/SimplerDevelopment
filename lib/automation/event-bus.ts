/**
 * Automation Event Bus
 *
 * Lightweight in-process pub/sub for automation triggers.
 * API routes call `emitEvent()` after mutations — the engine picks up
 * matching rules and executes their actions asynchronously.
 */

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
 * Emit an automation event. Handlers run asynchronously —
 * the caller does NOT wait for automations to finish.
 */
export function emitEvent(
  event: string,
  clientId: number,
  userId: number,
  payload: Record<string, unknown>,
): void {
  const automationEvent: AutomationEvent = {
    event,
    clientId,
    userId,
    payload,
    timestamp: new Date(),
  };

  // Fire-and-forget — don't block the API response
  for (const handler of handlers) {
    handler(automationEvent).catch((err) => {
      console.error(`[automation] Handler error for ${event}:`, err);
    });
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
