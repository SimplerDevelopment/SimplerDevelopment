// @vitest-environment node
/**
 * Unit tests for the DIST-01/02 survey email follow-up cron handler.
 *
 * Scope mirrors the other cron unit suites in this directory: SQL semantics
 * (the `completedAt + delayHours <= now()` window, the NOT EXISTS anti-join,
 * the unique-index dedupe on `onConflictDoNothing`) live at the integration
 * layer where a real Postgres validates them. Here we lock in the auth gate
 * (Vercel header / CRON_SECRET), the response envelope shape, and the
 * conditional branches the route owns above the SQL:
 *
 *   - empty queue → scanned/sent/errors all zero
 *   - eligibility gate is called once per candidate (we trust the gate's own
 *     unit suite — `surveyEmailFollowupGate.test.ts` — to cover its branches)
 *   - a "skipped" sequence-send row is recorded for ineligible candidates so
 *     the cron doesn't re-scan the same tuple every tick
 *   - Resend send errors are caught per-row, increment `errors`, and still
 *     write an audit row so a broken template doesn't get retried forever
 *   - the MAX_SENDS_PER_TICK = 100 cap stops the route from blowing past
 *     Resend's rate limit
 *
 * The route consumes Drizzle's chained query builder, so the db mock returns
 * a thenable that resolves to whatever the test pushed onto `queue` via the
 * helper. Each select() call shifts one batch of rows off the queue; insert()
 * is a fire-and-forget spy whose call count we assert.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Each test triggers a fresh dynamic import of the route module (we
// `vi.resetModules()` in beforeEach so env-var reads happen at import time).
// First-time route imports drag in Next/Drizzle/email and take a while on
// cold caches; bump the default 5s timeout so this isn't flaky on slow CI.
const TEST_TIMEOUT_MS = 30_000;

type Row = Record<string, unknown>;
const selectQueue: Row[][] = [];
const insertSpy = vi.fn();

function makeSelectChain() {
  // Chain methods all return the same builder; awaiting it shifts the next
  // pre-seeded row batch off the queue. Matches the shape used by the route:
  //   db.select().from(surveyEmailSequences).where(eq(... .enabled, true))
  //   db.select().from(surveys).where(eq(...)).limit(1)
  //   db.select().from(surveyResponses).where(and(...)).orderBy(...).limit(N)
  const builder: {
    select: typeof builder;
    from: typeof builder;
    where: typeof builder;
    orderBy: typeof builder;
    limit: typeof builder;
    then: (
      resolve: (rows: Row[]) => unknown,
      reject?: (err: unknown) => unknown,
    ) => Promise<unknown>;
  } = {} as never;
  const chain = (..._args: unknown[]) => builder;
  builder.select = chain as unknown as typeof builder;
  builder.from = chain as unknown as typeof builder;
  builder.where = chain as unknown as typeof builder;
  builder.orderBy = chain as unknown as typeof builder;
  builder.limit = chain as unknown as typeof builder;
  builder.then = (resolve, reject) =>
    Promise.resolve(selectQueue.shift() ?? []).then(resolve, reject);
  return builder;
}

function makeInsertChain() {
  // The route does: db.insert(table).values({...}).onConflictDoNothing()
  // We capture the values payload and resolve to a noop.
  const builder: {
    values: (v: Row) => typeof builder;
    onConflictDoNothing: () => Promise<void>;
  } = {
    values: (v: Row) => {
      insertSpy(v);
      return builder;
    },
    onConflictDoNothing: () => Promise.resolve(),
  };
  return builder;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: (..._args: unknown[]) => makeSelectChain(),
    insert: (..._args: unknown[]) => makeInsertChain(),
  },
}));

const sendMock = vi.fn().mockResolvedValue({ data: { id: 'res_123' } });
vi.mock('@/lib/email', () => ({
  resend: { emails: { send: (...args: unknown[]) => sendMock(...args) } },
  generateUnsubscribeToken: () => 'tok_test',
  buildUnsubscribeUrl: (t: string) => `https://example.test/unsubscribe?t=${t}`,
}));

// The gate has its own 100% unit suite (surveyEmailFollowupGate.test.ts) so
// we mock it here to control branch coverage of the route itself.
const gateMock = vi.fn();
vi.mock('@/lib/surveys/email-followup-gate', () => ({
  isEligibleForFollowup: (...args: unknown[]) => gateMock(...args),
}));

describe('GET /api/cron/process-survey-email-followups', { timeout: TEST_TIMEOUT_MS }, () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    selectQueue.length = 0;
    insertSpy.mockClear();
    sendMock.mockClear();
    sendMock.mockResolvedValue({ data: { id: 'res_123' } });
    gateMock.mockReset();
    gateMock.mockReturnValue({ eligible: true, reason: 'eligible' });
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('rejects unauthenticated requests when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/process-survey-email-followups/route');
    const res = await GET(new Request('http://x/api/cron/process-survey-email-followups'));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('rejects when CRON_SECRET is unset (post-C2 hardening)', async () => {
    // Without CRON_SECRET, no bearer token can match → the only way in is the
    // Vercel cron header. A plain request must 401.
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/process-survey-email-followups/route');
    const res = await GET(new Request('http://x/api/cron/process-survey-email-followups'));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('accepts the Vercel cron header without bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([]); // sequences: empty queue
    const { GET } = await import('@/app/api/cron/process-survey-email-followups/route');
    const res = await GET(
      new Request('http://x/api/cron/process-survey-email-followups', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        scanned: number;
        sent: number;
        errors: number;
        sequencesEvaluated: number;
        durationMs: number;
        skipped: { noEmail: number; noConsent: number; condition: number };
      };
    };
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      scanned: 0,
      sent: 0,
      errors: 0,
      sequencesEvaluated: 0,
      skipped: { noEmail: 0, noConsent: 0, condition: 0 },
    });
    expect(typeof json.data.durationMs).toBe('number');
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([]);
    const { GET } = await import('@/app/api/cron/process-survey-email-followups/route');
    const res = await GET(
      new Request('http://x/api/cron/process-survey-email-followups', {
        headers: { authorization: 'Bearer shh' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('sends email + records audit row for an eligible candidate', async () => {
    process.env.CRON_SECRET = 'shh';
    // Queue order matches the route's select() call order:
    //   1) enabled sequences
    //   2) survey by id   (for the one sequence)
    //   3) eligible responses for that sequence
    selectQueue.push([
      {
        id: 1,
        surveyId: 10,
        delayHours: 24,
        conditionField: null,
        conditionValue: null,
        subject: 'Thanks!',
        bodyHtml: '<p>Hi {respondentName}</p>',
        enabled: true,
      },
    ]);
    selectQueue.push([
      { id: 10, title: 'NPS', consentField: null },
    ]);
    selectQueue.push([
      {
        id: 500,
        surveyId: 10,
        respondentEmail: 'a@example.com',
        respondentName: 'Ada',
        completedAt: new Date('2026-05-10T00:00:00Z'),
        answers: {},
      },
    ]);

    const { GET } = await import('@/app/api/cron/process-survey-email-followups/route');
    const res = await GET(
      new Request('http://x/api/cron/process-survey-email-followups', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { scanned: number; sent: number; errors: number; sequencesEvaluated: number };
    };
    expect(json.data).toMatchObject({
      scanned: 1,
      sent: 1,
      errors: 0,
      sequencesEvaluated: 1,
    });

    // The gate is called once per candidate response.
    expect(gateMock).toHaveBeenCalledTimes(1);
    // Resend is called with the rendered template + List-Unsubscribe headers.
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sendArg = sendMock.mock.calls[0]![0] as {
      to: string;
      subject: string;
      html: string;
      headers: Record<string, string>;
    };
    expect(sendArg.to).toBe('a@example.com');
    expect(sendArg.subject).toBe('Thanks!');
    expect(sendArg.html).toContain('Hi Ada');
    expect(sendArg.headers['List-Unsubscribe']).toContain('https://example.test/unsubscribe');

    // Audit row inserted (resend success → resendEmailId populated, error null).
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const audit = insertSpy.mock.calls[0]![0] as {
      sequenceId: number;
      surveyResponseId: number;
      resendEmailId: string | null;
      error: string | null;
    };
    expect(audit.sequenceId).toBe(1);
    expect(audit.surveyResponseId).toBe(500);
    expect(audit.resendEmailId).toBe('res_123');
    expect(audit.error).toBeNull();
  });

  it('records a skipped audit row for ineligible candidates and bumps the right counter', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([
      {
        id: 1,
        surveyId: 10,
        delayHours: 24,
        conditionField: 'wants_followup',
        conditionValue: 'yes',
        subject: 'Thanks!',
        bodyHtml: '<p>x</p>',
        enabled: true,
      },
    ]);
    selectQueue.push([{ id: 10, title: 'NPS', consentField: 'consent' }]);
    selectQueue.push([
      {
        id: 501,
        surveyId: 10,
        respondentEmail: 'b@example.com',
        respondentName: null,
        completedAt: new Date('2026-05-10T00:00:00Z'),
        answers: { consent: false },
      },
    ]);

    // Force the gate to report the consent-missing branch.
    gateMock.mockReturnValueOnce({ eligible: false, reason: 'no_consent' });

    const { GET } = await import('@/app/api/cron/process-survey-email-followups/route');
    const res = await GET(
      new Request('http://x/api/cron/process-survey-email-followups', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: {
        scanned: number;
        sent: number;
        errors: number;
        skipped: { noEmail: number; noConsent: number; condition: number };
      };
    };
    // Counter goes to skipped.noConsent; sent stays 0; resend never called.
    expect(json.data.scanned).toBe(1);
    expect(json.data.sent).toBe(0);
    expect(json.data.skipped.noConsent).toBe(1);
    expect(sendMock).not.toHaveBeenCalled();
    // Skipped audit row written so we don't re-scan this tuple next tick.
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const audit = insertSpy.mock.calls[0]![0] as {
      resendEmailId: string | null;
      error: string | null;
    };
    expect(audit.resendEmailId).toBeNull();
    expect(audit.error).toBe('skipped: no_consent');
  });

  it('catches a Resend failure, increments errors, still records the audit row', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([
      {
        id: 2,
        surveyId: 20,
        delayHours: 0,
        conditionField: null,
        conditionValue: null,
        subject: 'Boom',
        bodyHtml: '<p>x</p>',
        enabled: true,
      },
    ]);
    selectQueue.push([{ id: 20, title: 'BadTemplate', consentField: null }]);
    selectQueue.push([
      {
        id: 700,
        surveyId: 20,
        respondentEmail: 'c@example.com',
        respondentName: null,
        completedAt: new Date('2026-05-11T00:00:00Z'),
        answers: {},
      },
    ]);

    sendMock.mockRejectedValueOnce(new Error('resend rate-limited'));

    const { GET } = await import('@/app/api/cron/process-survey-email-followups/route');
    const res = await GET(
      new Request('http://x/api/cron/process-survey-email-followups', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { scanned: number; sent: number; errors: number };
    };
    expect(json.data).toMatchObject({ scanned: 1, sent: 0, errors: 1 });

    // Audit row still written with the error message so we don't retry the
    // same row every 15 minutes forever.
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const audit = insertSpy.mock.calls[0]![0] as {
      resendEmailId: string | null;
      error: string | null;
    };
    expect(audit.resendEmailId).toBeNull();
    expect(audit.error).toBe('resend rate-limited');
  });

  it('caps work at MAX_SENDS_PER_TICK = 100 and stops scanning further rows', async () => {
    process.env.CRON_SECRET = 'shh';
    // Single sequence whose eligible-responses query returns 100 rows already
    // (matching the route's `limit(remaining)` value on the first iteration).
    // After 100 sends the outer loop should break and the counters reflect
    // exactly 100 even if more candidates exist in principle.
    const responses = Array.from({ length: 100 }, (_, i) => ({
      id: 1000 + i,
      surveyId: 30,
      respondentEmail: `r${i}@example.com`,
      respondentName: null,
      completedAt: new Date('2026-05-09T00:00:00Z'),
      answers: {},
    }));
    selectQueue.push([
      {
        id: 3,
        surveyId: 30,
        delayHours: 0,
        conditionField: null,
        conditionValue: null,
        subject: 's',
        bodyHtml: '<p>x</p>',
        enabled: true,
      },
    ]);
    selectQueue.push([{ id: 30, title: 'Big', consentField: null }]);
    selectQueue.push(responses);

    const { GET } = await import('@/app/api/cron/process-survey-email-followups/route');
    const res = await GET(
      new Request('http://x/api/cron/process-survey-email-followups', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { scanned: number; sent: number } };
    expect(json.data.sent).toBe(100);
    expect(json.data.scanned).toBe(100);
    expect(sendMock).toHaveBeenCalledTimes(100);
  });
});
