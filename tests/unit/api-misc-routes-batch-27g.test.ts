// @vitest-environment node
/**
 * Unit tests for four brain-portal API routes (batch 27g):
 *   - app/api/portal/brain/calendar/agenda/route.ts                            (GET)
 *   - app/api/portal/brain/calendar/events/[id]/route.ts                       (GET, PATCH, DELETE)
 *   - app/api/portal/brain/calendar/events/route.ts                            (GET, POST)
 *   - app/api/portal/brain/communications/[id]/attachments/[idx]/route.ts      (GET)
 *
 * Each describe block isolates a single route. Mocks: requireBrainEntitlement,
 * lib/brain/calendar, lib/brain/meetings, plus env vars for the attachment route.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

const getAgendaMock = vi.fn();
const listEventsMock = vi.fn();
const getEventMock = vi.fn();
const createEventMock = vi.fn();
const updateEventMock = vi.fn();
const deleteEventMock = vi.fn();

vi.mock('@/lib/brain/calendar', () => ({
  getAgenda: (...args: unknown[]) => getAgendaMock(...args),
  listEvents: (...args: unknown[]) => listEventsMock(...args),
  getEvent: (...args: unknown[]) => getEventMock(...args),
  createEvent: (...args: unknown[]) => createEventMock(...args),
  updateEvent: (...args: unknown[]) => updateEventMock(...args),
  deleteEvent: (...args: unknown[]) => deleteEventMock(...args),
}));

const getMeetingMock = vi.fn();
vi.mock('@/lib/brain/meetings', () => ({
  getMeeting: (...args: unknown[]) => getMeetingMock(...args),
}));

// ---- modules under test ----
const agendaRoute = await import('@/app/api/portal/brain/calendar/agenda/route');
const eventsByIdRoute = await import('@/app/api/portal/brain/calendar/events/[id]/route');
const eventsRoute = await import('@/app/api/portal/brain/calendar/events/route');
const attachmentRoute = await import(
  '@/app/api/portal/brain/communications/[id]/attachments/[idx]/route'
);

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function makeJsonReq(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ENTITLED = { client: { id: 10 }, userId: 7, role: 'admin' };

beforeEach(() => {
  requireBrainEntitlementMock.mockReset();
  getAgendaMock.mockReset();
  listEventsMock.mockReset();
  getEventMock.mockReset();
  createEventMock.mockReset();
  updateEventMock.mockReset();
  deleteEventMock.mockReset();
  getMeetingMock.mockReset();
});

// ===========================================================================
// /api/portal/brain/calendar/agenda  (GET)
// ===========================================================================

describe('GET /api/portal/brain/calendar/agenda', () => {
  it('short-circuits when entitlement denies', async () => {
    const denied = new Response(JSON.stringify({ success: false }), { status: 402 });
    requireBrainEntitlementMock.mockResolvedValueOnce({ response: denied });
    const res = await agendaRoute.GET(makeReq('http://x/api/portal/brain/calendar/agenda'));
    expect(res).toBe(denied);
    expect(getAgendaMock).not.toHaveBeenCalled();
  });

  it('returns items for default date range when no params', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    getAgendaMock.mockResolvedValueOnce([{ id: 1, kind: 'event' }]);
    const res = await agendaRoute.GET(makeReq('http://x/api/portal/brain/calendar/agenda'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: 1, kind: 'event' }]);
    expect(getAgendaMock).toHaveBeenCalledTimes(1);
    const args = getAgendaMock.mock.calls[0];
    expect(args[0]).toBe(10);
    expect(args[1]).toBeInstanceOf(Date);
    expect(args[2]).toBeInstanceOf(Date);
  });

  it('parses from/to query params (ISO)', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    getAgendaMock.mockResolvedValueOnce([]);
    const res = await agendaRoute.GET(
      makeReq(
        'http://x/api/portal/brain/calendar/agenda?from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z',
      ),
    );
    expect(res.status).toBe(200);
    const [, from, to] = getAgendaMock.mock.calls[0];
    expect((from as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect((to as Date).toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('falls back to default when from is unparseable', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    getAgendaMock.mockResolvedValueOnce([]);
    const res = await agendaRoute.GET(
      makeReq('http://x/api/portal/brain/calendar/agenda?from=not-a-date&to=2030-01-01'),
    );
    expect(res.status).toBe(200);
    const [, from] = getAgendaMock.mock.calls[0];
    // default fallback yields a real Date (current month start), not NaN
    expect(Number.isNaN((from as Date).getTime())).toBe(false);
  });

  it('returns 400 when to <= from', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    const res = await agendaRoute.GET(
      makeReq(
        'http://x/api/portal/brain/calendar/agenda?from=2026-03-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z',
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/to must be after from/);
    expect(getAgendaMock).not.toHaveBeenCalled();
  });

  it('returns 400 when to === from', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    const res = await agendaRoute.GET(
      makeReq(
        'http://x/api/portal/brain/calendar/agenda?from=2026-02-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z',
      ),
    );
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// /api/portal/brain/calendar/events/[id]  (GET, PATCH, DELETE)
// ===========================================================================

describe('/api/portal/brain/calendar/events/[id]', () => {
  describe('GET', () => {
    it('short-circuits when entitlement denies', async () => {
      const denied = new Response('nope', { status: 402 });
      requireBrainEntitlementMock.mockResolvedValueOnce({ response: denied });
      const res = await eventsByIdRoute.GET(makeReq('http://x'), {
        params: Promise.resolve({ id: '5' }),
      });
      expect(res).toBe(denied);
      expect(getEventMock).not.toHaveBeenCalled();
    });

    it('returns 400 when id is not numeric', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      const res = await eventsByIdRoute.GET(makeReq('http://x'), {
        params: Promise.resolve({ id: 'abc' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Invalid event id/);
    });

    it('returns 404 when event missing', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      getEventMock.mockResolvedValueOnce(null);
      const res = await eventsByIdRoute.GET(makeReq('http://x'), {
        params: Promise.resolve({ id: '5' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns event data', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      getEventMock.mockResolvedValueOnce({ id: 5, title: 'Standup' });
      const res = await eventsByIdRoute.GET(makeReq('http://x'), {
        params: Promise.resolve({ id: '5' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 5, title: 'Standup' });
      expect(getEventMock).toHaveBeenCalledWith(10, 5);
    });
  });

  describe('PATCH', () => {
    it('short-circuits when entitlement denies', async () => {
      const denied = new Response('nope', { status: 402 });
      requireBrainEntitlementMock.mockResolvedValueOnce({ response: denied });
      const res = await eventsByIdRoute.PATCH(makeJsonReq('http://x', {}, 'PATCH'), {
        params: Promise.resolve({ id: '5' }),
      });
      expect(res).toBe(denied);
      expect(updateEventMock).not.toHaveBeenCalled();
    });

    it('returns 400 on invalid id', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      const res = await eventsByIdRoute.PATCH(makeJsonReq('http://x', {}, 'PATCH'), {
        params: Promise.resolve({ id: 'xyz' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when body is not parseable JSON', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      const req = new Request('http://x', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      });
      const res = await eventsByIdRoute.PATCH(req, { params: Promise.resolve({ id: '5' }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Invalid body/);
    });

    it('returns 400 when startAt is not a parseable date', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      const res = await eventsByIdRoute.PATCH(
        makeJsonReq('http://x', { startAt: 'not-a-date' }, 'PATCH'),
        { params: Promise.resolve({ id: '5' }) },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Invalid startAt\/endAt/);
    });

    it('returns 404 when underlying update returns null', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      updateEventMock.mockResolvedValueOnce(null);
      const res = await eventsByIdRoute.PATCH(
        makeJsonReq('http://x', { title: 'New' }, 'PATCH'),
        { params: Promise.resolve({ id: '5' }) },
      );
      expect(res.status).toBe(404);
    });

    it('updates event and passes all fields through', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      updateEventMock.mockResolvedValueOnce({ id: 5, title: 'Updated' });
      const res = await eventsByIdRoute.PATCH(
        makeJsonReq(
          'http://x',
          {
            title: 'Updated',
            description: 'desc',
            startAt: '2026-06-01T10:00:00.000Z',
            endAt: '2026-06-01T11:00:00.000Z',
            allDay: false,
            timezone: 'America/Chicago',
            location: 'Zoom',
            link: 'https://x.example',
            relatedTaskId: 1,
            relatedMeetingId: 2,
            relatedRelationshipOverlayId: 3,
          },
          'PATCH',
        ),
        { params: Promise.resolve({ id: '5' }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(5);
      expect(updateEventMock).toHaveBeenCalledTimes(1);
      const [clientId, eventId, patch, actor] = updateEventMock.mock.calls[0];
      expect(clientId).toBe(10);
      expect(eventId).toBe(5);
      expect(actor).toBe(7);
      const p = patch as Record<string, unknown>;
      expect(p.title).toBe('Updated');
      expect(p.description).toBe('desc');
      expect(p.startAt).toBeInstanceOf(Date);
      expect(p.endAt).toBeInstanceOf(Date);
      expect(p.allDay).toBe(false);
      expect(p.timezone).toBe('America/Chicago');
      expect(p.location).toBe('Zoom');
      expect(p.link).toBe('https://x.example');
      expect(p.relatedTaskId).toBe(1);
      expect(p.relatedMeetingId).toBe(2);
      expect(p.relatedRelationshipOverlayId).toBe(3);
    });

    it('passes through nulls for nullable fields when body sends null', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      updateEventMock.mockResolvedValueOnce({ id: 5 });
      await eventsByIdRoute.PATCH(
        makeJsonReq(
          'http://x',
          {
            description: null,
            location: null,
            link: null,
            relatedTaskId: null,
            relatedMeetingId: null,
            relatedRelationshipOverlayId: null,
          },
          'PATCH',
        ),
        { params: Promise.resolve({ id: '5' }) },
      );
      const [, , patch] = updateEventMock.mock.calls[0];
      const p = patch as Record<string, unknown>;
      expect(p.description).toBeNull();
      expect(p.location).toBeNull();
      expect(p.link).toBeNull();
      expect(p.relatedTaskId).toBeNull();
      expect(p.relatedMeetingId).toBeNull();
      expect(p.relatedRelationshipOverlayId).toBeNull();
    });

    it('leaves fields undefined when omitted', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      updateEventMock.mockResolvedValueOnce({ id: 5 });
      await eventsByIdRoute.PATCH(makeJsonReq('http://x', {}, 'PATCH'), {
        params: Promise.resolve({ id: '5' }),
      });
      const [, , patch] = updateEventMock.mock.calls[0];
      const p = patch as Record<string, unknown>;
      expect(p.title).toBeUndefined();
      expect(p.description).toBeUndefined();
      expect(p.startAt).toBeUndefined();
      expect(p.endAt).toBeUndefined();
      expect(p.allDay).toBeUndefined();
    });

    it('returns 400 when updateEvent throws', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      updateEventMock.mockRejectedValueOnce(new Error('boom'));
      const res = await eventsByIdRoute.PATCH(
        makeJsonReq('http://x', { title: 'X' }, 'PATCH'),
        { params: Promise.resolve({ id: '5' }) },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).toBe('boom');
    });

    it('returns 400 with generic message when updateEvent throws non-Error', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      updateEventMock.mockRejectedValueOnce('weird');
      const res = await eventsByIdRoute.PATCH(
        makeJsonReq('http://x', { title: 'X' }, 'PATCH'),
        { params: Promise.resolve({ id: '5' }) },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Failed to update event/);
    });
  });

  describe('DELETE', () => {
    it('short-circuits when entitlement denies', async () => {
      const denied = new Response('nope', { status: 402 });
      requireBrainEntitlementMock.mockResolvedValueOnce({ response: denied });
      const res = await eventsByIdRoute.DELETE(makeReq('http://x'), {
        params: Promise.resolve({ id: '5' }),
      });
      expect(res).toBe(denied);
      expect(deleteEventMock).not.toHaveBeenCalled();
    });

    it('returns 400 on invalid id', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      const res = await eventsByIdRoute.DELETE(makeReq('http://x'), {
        params: Promise.resolve({ id: 'abc' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 when delete returns falsy', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      deleteEventMock.mockResolvedValueOnce(false);
      const res = await eventsByIdRoute.DELETE(makeReq('http://x'), {
        params: Promise.resolve({ id: '5' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 200 on success', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      deleteEventMock.mockResolvedValueOnce(true);
      const res = await eventsByIdRoute.DELETE(makeReq('http://x'), {
        params: Promise.resolve({ id: '5' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(deleteEventMock).toHaveBeenCalledWith(10, 5, 7);
    });
  });
});

// ===========================================================================
// /api/portal/brain/calendar/events  (GET, POST)
// ===========================================================================

describe('/api/portal/brain/calendar/events', () => {
  describe('GET', () => {
    it('short-circuits when entitlement denies', async () => {
      const denied = new Response('nope', { status: 402 });
      requireBrainEntitlementMock.mockResolvedValueOnce({ response: denied });
      const res = await eventsRoute.GET(makeReq('http://x/api/portal/brain/calendar/events'));
      expect(res).toBe(denied);
      expect(listEventsMock).not.toHaveBeenCalled();
    });

    it('returns events for default date range', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      listEventsMock.mockResolvedValueOnce([{ id: 1, title: 'A' }]);
      const res = await eventsRoute.GET(makeReq('http://x/api/portal/brain/calendar/events'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([{ id: 1, title: 'A' }]);
      expect(listEventsMock).toHaveBeenCalledTimes(1);
      const [cid, opts] = listEventsMock.mock.calls[0];
      expect(cid).toBe(10);
      expect((opts as { from: Date }).from).toBeInstanceOf(Date);
      expect((opts as { to: Date }).to).toBeInstanceOf(Date);
    });

    it('parses from/to params', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      listEventsMock.mockResolvedValueOnce([]);
      const res = await eventsRoute.GET(
        makeReq(
          'http://x/api/portal/brain/calendar/events?from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z',
        ),
      );
      expect(res.status).toBe(200);
      const [, opts] = listEventsMock.mock.calls[0];
      expect((opts as { from: Date }).from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect((opts as { to: Date }).to.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    });

    it('falls back when from/to are unparseable', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      listEventsMock.mockResolvedValueOnce([]);
      await eventsRoute.GET(
        makeReq('http://x/api/portal/brain/calendar/events?from=bad&to=alsobad'),
      );
      const [, opts] = listEventsMock.mock.calls[0];
      expect(Number.isNaN((opts as { from: Date }).from.getTime())).toBe(false);
      expect(Number.isNaN((opts as { to: Date }).to.getTime())).toBe(false);
    });
  });

  describe('POST', () => {
    it('short-circuits when entitlement denies', async () => {
      const denied = new Response('nope', { status: 402 });
      requireBrainEntitlementMock.mockResolvedValueOnce({ response: denied });
      const res = await eventsRoute.POST(makeJsonReq('http://x', {}));
      expect(res).toBe(denied);
      expect(createEventMock).not.toHaveBeenCalled();
    });

    it('returns 400 when title missing', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      const res = await eventsRoute.POST(
        makeJsonReq('http://x', {
          startAt: '2026-01-01T00:00:00.000Z',
          endAt: '2026-01-01T01:00:00.000Z',
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/title is required/);
    });

    it('returns 400 when title is whitespace', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      const res = await eventsRoute.POST(
        makeJsonReq('http://x', {
          title: '   ',
          startAt: '2026-01-01T00:00:00.000Z',
          endAt: '2026-01-01T01:00:00.000Z',
        }),
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 when body is not JSON-parseable', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      const req = new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      });
      const res = await eventsRoute.POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 when startAt/endAt missing', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      const res = await eventsRoute.POST(makeJsonReq('http://x', { title: 'M' }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/startAt and endAt are required/);
    });

    it('returns 400 when startAt is not a valid date', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      const res = await eventsRoute.POST(
        makeJsonReq('http://x', {
          title: 'M',
          startAt: 'bad-date',
          endAt: '2026-01-01T01:00:00.000Z',
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Invalid startAt\/endAt/);
    });

    it('returns 400 when endAt is before startAt', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      const res = await eventsRoute.POST(
        makeJsonReq('http://x', {
          title: 'M',
          startAt: '2026-06-01T11:00:00.000Z',
          endAt: '2026-06-01T10:00:00.000Z',
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/endAt must be on or after startAt/);
    });

    it('creates event with all fields', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      createEventMock.mockResolvedValueOnce({ id: 99, title: 'M' });
      const res = await eventsRoute.POST(
        makeJsonReq('http://x', {
          title: 'M',
          description: 'desc',
          startAt: '2026-06-01T10:00:00.000Z',
          endAt: '2026-06-01T11:00:00.000Z',
          allDay: true,
          timezone: 'America/Chicago',
          location: 'HQ',
          link: 'https://x.example',
          relatedTaskId: 11,
          relatedMeetingId: 22,
          relatedRelationshipOverlayId: 33,
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 99, title: 'M' });
      expect(createEventMock).toHaveBeenCalledTimes(1);
      const input = createEventMock.mock.calls[0][0] as Record<string, unknown>;
      expect(input.clientId).toBe(10);
      expect(input.createdBy).toBe(7);
      expect(input.title).toBe('M');
      expect(input.description).toBe('desc');
      expect(input.startAt).toBeInstanceOf(Date);
      expect(input.endAt).toBeInstanceOf(Date);
      expect(input.allDay).toBe(true);
      expect(input.timezone).toBe('America/Chicago');
      expect(input.location).toBe('HQ');
      expect(input.link).toBe('https://x.example');
      expect(input.relatedTaskId).toBe(11);
      expect(input.relatedMeetingId).toBe(22);
      expect(input.relatedRelationshipOverlayId).toBe(33);
    });

    it('applies defaults when optional fields are omitted', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      createEventMock.mockResolvedValueOnce({ id: 100 });
      await eventsRoute.POST(
        makeJsonReq('http://x', {
          title: 'M',
          startAt: '2026-06-01T10:00:00.000Z',
          endAt: '2026-06-01T11:00:00.000Z',
        }),
      );
      const input = createEventMock.mock.calls[0][0] as Record<string, unknown>;
      expect(input.description).toBeNull();
      expect(input.allDay).toBe(false);
      expect(input.timezone).toBe('UTC');
      expect(input.location).toBeNull();
      expect(input.link).toBeNull();
      expect(input.relatedTaskId).toBeNull();
      expect(input.relatedMeetingId).toBeNull();
      expect(input.relatedRelationshipOverlayId).toBeNull();
    });

    it('returns 400 when createEvent throws Error', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      createEventMock.mockRejectedValueOnce(new Error('nope'));
      const res = await eventsRoute.POST(
        makeJsonReq('http://x', {
          title: 'M',
          startAt: '2026-06-01T10:00:00.000Z',
          endAt: '2026-06-01T11:00:00.000Z',
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('nope');
    });

    it('returns 400 with generic message when createEvent throws non-Error', async () => {
      requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
      createEventMock.mockRejectedValueOnce('weird');
      const res = await eventsRoute.POST(
        makeJsonReq('http://x', {
          title: 'M',
          startAt: '2026-06-01T10:00:00.000Z',
          endAt: '2026-06-01T11:00:00.000Z',
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Failed to create event/);
    });
  });
});

// ===========================================================================
// /api/portal/brain/communications/[id]/attachments/[idx]  (GET)
// ===========================================================================

describe('GET /api/portal/brain/communications/[id]/attachments/[idx]', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    // restore env
    process.env = { ...ORIGINAL_ENV };
  });

  it('short-circuits when entitlement denies', async () => {
    const denied = new Response('nope', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValueOnce({ response: denied });
    const res = await attachmentRoute.GET(makeReq('http://x/host'), {
      params: Promise.resolve({ id: '5', idx: '0' }),
    });
    expect(res).toBe(denied);
    expect(getMeetingMock).not.toHaveBeenCalled();
  });

  it('returns 400 when id is invalid', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    const res = await attachmentRoute.GET(makeReq('http://x/host'), {
      params: Promise.resolve({ id: 'abc', idx: '0' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Invalid id/);
  });

  it('returns 400 when idx is invalid', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    const res = await attachmentRoute.GET(makeReq('http://x/host'), {
      params: Promise.resolve({ id: '5', idx: 'xyz' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when meeting not found', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    getMeetingMock.mockResolvedValueOnce(null);
    const res = await attachmentRoute.GET(makeReq('http://x/host'), {
      params: Promise.resolve({ id: '5', idx: '0' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Meeting not found/);
    expect(getMeetingMock).toHaveBeenCalledWith(10, 5);
  });

  it('returns 404 when sourceMetadata has no attachments', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    getMeetingMock.mockResolvedValueOnce({ id: 5, sourceMetadata: null });
    const res = await attachmentRoute.GET(makeReq('http://x/host'), {
      params: Promise.resolve({ id: '5', idx: '0' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Attachment not found/);
  });

  it('returns 404 when idx is out of range', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    getMeetingMock.mockResolvedValueOnce({
      id: 5,
      sourceMetadata: {
        attachments: [{ key: 'media/abc', filename: 'a.png', contentType: 'image/png', size: 1 }],
      },
    });
    const res = await attachmentRoute.GET(makeReq('http://x/host'), {
      params: Promise.resolve({ id: '5', idx: '7' }),
    });
    expect(res.status).toBe(404);
  });

  it('redirects to /api/media/proxy for media/ keys (S3 path)', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    getMeetingMock.mockResolvedValueOnce({
      id: 5,
      sourceMetadata: {
        attachments: [
          { key: 'media/abc-uuid.png', filename: 'a.png', contentType: 'image/png', size: 1 },
        ],
      },
    });
    const res = await attachmentRoute.GET(
      makeReq('http://example.com/portal/brain/communications/5/attachments/0'),
      { params: Promise.resolve({ id: '5', idx: '0' }) },
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('/api/media/proxy/media/abc-uuid.png');
  });

  it('returns 500 when INBOUND_EMAIL_SECRET is missing for non-media keys', async () => {
    delete process.env.INBOUND_EMAIL_SECRET;
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    getMeetingMock.mockResolvedValueOnce({
      id: 5,
      sourceMetadata: {
        attachments: [
          { key: 'r2-key-xyz', filename: 'a.png', contentType: 'image/png', size: 1 },
        ],
      },
    });
    const res = await attachmentRoute.GET(makeReq('http://example.com/host'), {
      params: Promise.resolve({ id: '5', idx: '0' }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/INBOUND_EMAIL_SECRET/);
  });

  it('redirects to the configured attachment worker with HMAC sig for R2 keys', async () => {
    process.env.INBOUND_EMAIL_SECRET = 'shh';
    process.env.BRAIN_ATTACHMENT_WORKER_URL = 'https://worker.example';
    // re-import the route module so it picks up the new env values
    vi.resetModules();
    const reImported = await import(
      '@/app/api/portal/brain/communications/[id]/attachments/[idx]/route'
    );
    requireBrainEntitlementMock.mockResolvedValueOnce(ENTITLED);
    getMeetingMock.mockResolvedValueOnce({
      id: 5,
      sourceMetadata: {
        attachments: [
          { key: 'r2-key-xyz', filename: 'a.png', contentType: 'image/png', size: 1 },
        ],
      },
    });
    const res = await reImported.GET(makeReq('http://example.com/host'), {
      params: Promise.resolve({ id: '5', idx: '0' }),
    });
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('https://worker.example/attachment');
    expect(loc).toContain('key=r2-key-xyz');
    expect(loc).toContain('exp=');
    expect(loc).toContain('sig=');
  });
});
