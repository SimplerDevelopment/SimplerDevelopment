import { describe, it, expect } from 'vitest';
import { roomOf, groupByRoom } from '@/lib/notifications/rooms';
import { NOTIFICATION_TYPES } from '@/lib/db/schema/crm';

describe('notification rooms (PUX-201)', () => {
  it('maps every real type to a room by prefix and groups in room order', () => {
    expect(roomOf('deal_stale')).toBe('CRM');
    expect(roomOf('mention')).toBe('CRM');
    expect(roomOf('ticket_sla_resolution_breach')).toBe('Projects & tickets');
    expect(roomOf('document_comment_mention')).toBe('Brain');
    expect(roomOf('booking_hold_stuck')).toBe('Bookings');
    expect(NOTIFICATION_TYPES.map(roomOf)).not.toContain('Other');
    const g = groupByRoom([{ notificationType: 'survey_zero_responses' }, { notificationType: 'deal_assigned' }]);
    expect(g.map(([r]) => r)).toEqual(['CRM', 'Surveys']);
  });
});
