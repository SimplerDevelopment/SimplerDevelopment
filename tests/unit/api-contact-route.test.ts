// @vitest-environment node
/**
 * Unit tests for the public contact-form route's CRM lead capture.
 *
 * The email side of this route was already covered by its own behaviour (send
 * or degrade); what's load-bearing here is the capture block: it must open a
 * deal exactly once per new contact, stay silent for returning senders, and
 * never turn a CRM problem into a visitor-visible 500.
 *
 * SD_AGENCY_CLIENT_ID is read at module scope (matching CONTACT_INBOX /
 * FROM_EMAIL alongside it), so tests that vary it re-import the module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const dbQueue: unknown[] = [];

  function makeThenable(resolver: () => unknown) {
    const obj: Record<string, unknown> = {
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(resolver()).then(onFulfilled),
      from: vi.fn(() => makeThenable(resolver)),
      where: vi.fn(() => makeThenable(resolver)),
      orderBy: vi.fn(() => makeThenable(resolver)),
      limit: vi.fn(() => makeThenable(resolver)),
      values: vi.fn(() => makeThenable(resolver)),
      returning: vi.fn(() => makeThenable(resolver)),
    };
    return obj;
  }

  function nextResult() {
    if (dbQueue.length === 0) return [];
    return dbQueue.shift();
  }

  const select = vi.fn(() => makeThenable(nextResult));
  const insert = vi.fn(() => makeThenable(nextResult));

  return {
    dbQueue,
    db: { select, insert },
    upsertContactByEmail: vi.fn(),
    ensureDefaultPipeline: vi.fn(),
    emitEvent: vi.fn(),
    sendEmail: vi.fn(() => Promise.resolve({ error: null })),
  };
});

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/db/schema', () => ({
  crmDeals: {},
  crmPipelineStages: { id: 'id', pipelineId: 'pipelineId', sortOrder: 'sortOrder' },
}));
vi.mock('drizzle-orm', () => ({ asc: vi.fn(), eq: vi.fn() }));
vi.mock('@/lib/crm/contacts', () => ({ upsertContactByEmail: mocks.upsertContactByEmail }));
vi.mock('@/lib/crm/default-pipeline', () => ({ ensureDefaultPipeline: mocks.ensureDefaultPipeline }));
vi.mock('@/lib/automation/event-bus', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('@/lib/email', () => ({ sendEmail: mocks.sendEmail }));

const VALID_BODY = {
  name: 'Jane Doe',
  email: 'Jane@Example.com',
  subject: 'Consulting enquiry',
  message: 'We would like to talk about a project.',
};

function request(body: Record<string, unknown>): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

async function loadRoute(agencyClientId: string | undefined) {
  vi.resetModules();
  if (agencyClientId === undefined) delete process.env.SD_AGENCY_CLIENT_ID;
  else process.env.SD_AGENCY_CLIENT_ID = agencyClientId;
  return import('@/app/api/contact/route');
}

describe('POST /api/contact — CRM lead capture', () => {
  beforeEach(() => {
    mocks.dbQueue.length = 0;
    vi.clearAllMocks();
    mocks.sendEmail.mockResolvedValue({ error: null });
    process.env.RESEND_API_KEY = 'test-key';
  });

  it('opens a deal and emits crm.contact.created for a new contact', async () => {
    mocks.upsertContactByEmail.mockResolvedValue({ contactId: 77, created: true });
    mocks.ensureDefaultPipeline.mockResolvedValue({ id: 5 });
    mocks.dbQueue.push([{ id: 42 }]); // first stage lookup

    const { POST } = await loadRoute('104');
    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(200);
    expect(mocks.upsertContactByEmail).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 104, email: 'Jane@Example.com', source: 'contact-form' }),
    );

    const deal = mocks.db.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(deal).toMatchObject({
      clientId: 104,
      pipelineId: 5,
      stageId: 42,
      contactId: 77,
      title: 'Contact form: Consulting enquiry',
      notes: VALID_BODY.message,
    });

    expect(mocks.emitEvent).toHaveBeenCalledWith(
      'crm.contact.created',
      104,
      0,
      expect.objectContaining({ id: 77, email: VALID_BODY.email, source: 'contact-form' }),
    );
  });

  it('does not open a second deal for a returning sender', async () => {
    mocks.upsertContactByEmail.mockResolvedValue({ contactId: 77, created: false });

    const { POST } = await loadRoute('104');
    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(200);
    expect(mocks.ensureDefaultPipeline).not.toHaveBeenCalled();
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.emitEvent).not.toHaveBeenCalled();
  });

  it('still delivers the enquiry when CRM capture throws', async () => {
    mocks.upsertContactByEmail.mockRejectedValue(new Error('db down'));

    const { POST } = await loadRoute('104');
    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(200);
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
  });

  it('skips capture entirely when SD_AGENCY_CLIENT_ID is unset', async () => {
    const { POST } = await loadRoute(undefined);
    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(200);
    expect(mocks.upsertContactByEmail).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
  });

  it('captures the lead even when no mail provider is configured', async () => {
    delete process.env.RESEND_API_KEY;
    mocks.upsertContactByEmail.mockResolvedValue({ contactId: 78, created: true });
    mocks.ensureDefaultPipeline.mockResolvedValue({ id: 5 });
    mocks.dbQueue.push([{ id: 42 }]);

    const { POST } = await loadRoute('104');
    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(200);
    expect(mocks.upsertContactByEmail).toHaveBeenCalledOnce();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('rejects an invalid body before touching the CRM', async () => {
    const { POST } = await loadRoute('104');
    const res = await POST(request({ ...VALID_BODY, email: 'not-an-email' }));

    expect(res.status).toBe(400);
    expect(mocks.upsertContactByEmail).not.toHaveBeenCalled();
  });

  it('drops honeypot submissions without creating a contact', async () => {
    const { POST } = await loadRoute('104');
    const res = await POST(request({ ...VALID_BODY, website: 'spam' }));

    expect(res.status).toBe(200);
    expect(mocks.upsertContactByEmail).not.toHaveBeenCalled();
  });
});
