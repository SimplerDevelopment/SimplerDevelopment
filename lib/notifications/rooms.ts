/**
 * PUX-201 (design doc screen 60): notification_preferences rows grouped by
 * the room they come from. NOTIFICATION_TYPES is one flat CRM-flavoured list
 * (lib/db/schema/crm.ts); the room is read off the type's prefix so a new
 * type lands in the right group without a table. Kanban card events go
 * through notifyCardEvent and have no row here yet — nothing to group.
 */
export const ROOMS = ['CRM', 'Projects & tickets', 'Brain', 'Automations', 'Surveys', 'Bookings', 'Other'] as const;
export type Room = (typeof ROOMS)[number];

export function roomOf(type: string): Room {
  if (/^(deal_|contact_|proposal_)/.test(type) || type === 'mention') return 'CRM';
  if (/^(task_|ticket_)/.test(type)) return 'Projects & tickets';
  if (type.startsWith('document_')) return 'Brain';
  if (type.startsWith('automation_')) return 'Automations';
  if (type.startsWith('survey_')) return 'Surveys';
  if (type.startsWith('booking_')) return 'Bookings';
  return 'Other';
}

export function groupByRoom<T extends { notificationType: string }>(rows: T[]): [Room, T[]][] {
  const by = new Map<Room, T[]>();
  for (const r of rows) { const k = roomOf(r.notificationType); by.set(k, [...(by.get(k) ?? []), r]); }
  return ROOMS.filter((r) => by.has(r)).map((r) => [r, by.get(r)!]);
}
