import { describe, it, expect } from 'vitest';
import { crmEntityUrl, dayBucket, initials, relativeTime, splitActor } from '@/lib/notifications/feed';

describe('notification feed helpers (PUX-148)', () => {
  it('crmEntityUrl never returns a dead end', () => {
    expect(crmEntityUrl('contact', 7)).toBe('/portal/crm/contacts/7');
    expect(crmEntityUrl('document', 3)).toBe('/portal/brain/documents/3'); // was /portal/brain/notes/3 — a route that does not exist
    expect(crmEntityUrl('post', 12)).toBe('/portal/websites');            // a post URL needs its siteId → the room
    expect(crmEntityUrl('deck', 5)).toBe('/portal/tools/pitch-decks/5');
    expect(crmEntityUrl('ticket', null)).toBe('/portal/tickets');
    expect(crmEntityUrl('booking', null)).toBe('/portal/tools/booking');
    expect(crmEntityUrl(null, null)).toBe('/portal/notifications');
    expect(crmEntityUrl('something_new', 1)).toBe('/portal/notifications');
  });

  it('dayBucket / splitActor / initials / relativeTime', () => {
    const now = new Date('2026-08-27T15:00:00');
    expect(dayBucket('2026-08-27T01:00:00', now)).toBe('Today');
    expect(dayBucket('2026-08-26T23:59:00', now)).toBe('Earlier');
    expect(splitActor('Dana Park replied on #482', 'Dana Park')).toEqual({ actor: 'Dana Park', rest: 'replied on #482' });
    expect(splitActor('AI credits at 80%', null)).toEqual({ actor: null, rest: 'AI credits at 80%' });
    expect(splitActor('Someone else did it', 'Dana Park').actor).toBeNull();
    expect(initials('Dana Park')).toBe('DP');
    expect(initials('Cher')).toBe('C');
    expect(relativeTime('2026-08-27T14:58:00Z', Date.parse('2026-08-27T15:00:00Z'))).toBe('2m ago');
  });
});
