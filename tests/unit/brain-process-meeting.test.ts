// @vitest-environment node
/**
 * Unit tests for lib/brain/process-meeting.ts.
 *
 * The module orchestrates the brain meeting processing pipeline:
 *   1. attachment + link enrichment (parallel)
 *   2. transcript AI processing (optional)
 *   3. CRM auto-linking (only for email sources)
 *
 * It is heavily wired to DB + sibling brain/ai modules, so we mock all of
 * them. Each test reseeds the mocks via beforeEach.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock DB — only `update` and `delete` are exercised by process-meeting.
// We just capture calls; no in-memory rows are needed.
// ---------------------------------------------------------------------------

const dbCalls = {
  updates: [] as Array<{ table: unknown; patch: Record<string, unknown>; filter: unknown }>,
  deletes: [] as Array<{ table: unknown; filter: unknown }>,
};

vi.mock('@/lib/db', () => {
  return {
    db: {
      update(table: unknown) {
        return {
          set(patch: Record<string, unknown>) {
            return {
              where(filter: unknown) {
                dbCalls.updates.push({ table, patch, filter });
                return Promise.resolve();
              },
            };
          },
        };
      },
      delete(table: unknown) {
        return {
          where(filter: unknown) {
            dbCalls.deletes.push({ table, filter });
            return Promise.resolve();
          },
        };
      },
    },
  };
});

vi.mock('@/lib/db/schema', () => ({
  brainMeetings: { __table: 'brainMeetings', id: { __col: 'id' } },
  brainAiReviewItems: {
    __table: 'brainAiReviewItems',
    clientId: { __col: 'clientId' },
    sourceType: { __col: 'sourceType' },
    sourceId: { __col: 'sourceId' },
    status: { __col: 'status' },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---------------------------------------------------------------------------
// Mock the brain/ai modules. Each is a vi.fn so individual tests can override.
// ---------------------------------------------------------------------------

const getMeetingMock = vi.fn();
const buildThreadTranscriptMock = vi.fn();
const collectThreadParticipantsMock = vi.fn();
const getBrainProfileMock = vi.fn();
const processMeetingTranscriptMock = vi.fn();
const classifyAndLinkCrmMock = vi.fn();
const analyzeMeetingAttachmentsMock = vi.fn();
const extractAndFetchLinksMock = vi.fn();

vi.mock('@/lib/brain/meetings', () => ({
  getMeeting: (...a: unknown[]) => getMeetingMock(...a),
  buildThreadTranscript: (...a: unknown[]) => buildThreadTranscriptMock(...a),
  collectThreadParticipants: (...a: unknown[]) => collectThreadParticipantsMock(...a),
}));

vi.mock('@/lib/brain/profiles', () => ({
  getBrainProfile: (...a: unknown[]) => getBrainProfileMock(...a),
}));

vi.mock('@/lib/ai/meeting-processor', () => ({
  processMeetingTranscript: (...a: unknown[]) => processMeetingTranscriptMock(...a),
}));

vi.mock('@/lib/brain/classify-crm', () => ({
  classifyAndLinkCrm: (...a: unknown[]) => classifyAndLinkCrmMock(...a),
}));

vi.mock('@/lib/brain/analyze-attachment', () => ({
  analyzeMeetingAttachments: (...a: unknown[]) => analyzeMeetingAttachmentsMock(...a),
}));

vi.mock('@/lib/brain/extract-links', () => ({
  extractAndFetchLinks: (...a: unknown[]) => extractAndFetchLinksMock(...a),
}));

// Helper to build a meeting fixture with overrides.
function makeMeeting(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    clientId: 1,
    title: 'Quarterly sync',
    transcript: 'Hello world. Visit https://example.com.',
    meetingDate: new Date('2026-05-01T00:00:00Z'),
    source: 'email',
    participants: [{ name: 'Ada', email: 'ada@acme.test' }],
    sourceMetadata: { senderEmail: 'ada@acme.test', from: 'Ada <ada@acme.test>' },
    thread: null,
    ...overrides,
  };
}

beforeEach(() => {
  dbCalls.updates.length = 0;
  dbCalls.deletes.length = 0;
  getMeetingMock.mockReset();
  buildThreadTranscriptMock.mockReset();
  collectThreadParticipantsMock.mockReset();
  getBrainProfileMock.mockReset();
  processMeetingTranscriptMock.mockReset();
  classifyAndLinkCrmMock.mockReset();
  analyzeMeetingAttachmentsMock.mockReset();
  extractAndFetchLinksMock.mockReset();
});

async function importModule() {
  return await import('@/lib/brain/process-meeting');
}

// ---------------------------------------------------------------------------
// processBrainMeeting
// ---------------------------------------------------------------------------

describe('processBrainMeeting', () => {
  it('throws when the meeting is not found', async () => {
    getMeetingMock.mockResolvedValue(null);
    const { processBrainMeeting } = await importModule();
    await expect(
      processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 }),
    ).rejects.toThrow(/not found/i);
  });

  it('throws when the meeting has neither transcript nor attachments', async () => {
    getMeetingMock.mockResolvedValue(
      makeMeeting({ transcript: '', sourceMetadata: {} }),
    );
    const { processBrainMeeting } = await importModule();
    await expect(
      processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 }),
    ).rejects.toThrow(/no transcript or attachments/i);
  });

  it('throws when transcript is only whitespace and no attachments exist', async () => {
    getMeetingMock.mockResolvedValue(
      makeMeeting({ transcript: '   \n  ', sourceMetadata: {} }),
    );
    const { processBrainMeeting } = await importModule();
    await expect(
      processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 }),
    ).rejects.toThrow(/no transcript or attachments/i);
  });

  it('runs full pipeline for a transcript-only email and links to CRM when enabled', async () => {
    getMeetingMock.mockResolvedValue(makeMeeting());
    extractAndFetchLinksMock.mockResolvedValue([
      { url: 'https://example.com', title: 'Example' },
    ]);
    processMeetingTranscriptMock.mockResolvedValue({
      jobId: 555,
      reviewItemIds: [1, 2, 3],
      extraction: { summary: 'Summary text' },
    });
    getBrainProfileMock.mockResolvedValue({ autoLinkCrm: true });
    classifyAndLinkCrmMock.mockResolvedValue({
      jobId: 777,
      reviewItemIds: [9, 10],
      appliedLinks: { contactId: 42, contactCreated: true, companyId: 99 },
      skipped: undefined,
    });

    const { processBrainMeeting } = await importModule();
    const result = await processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 });

    expect(result.meetingId).toBe(100);
    expect(result.attachmentsAnalyzed).toBe(0);
    expect(result.attachmentTokens).toBe(0);
    expect(result.linksExtracted).toBe(1);
    expect(result.transcript).toEqual({ jobId: 555, reviewItemCount: 3, summary: 'Summary text' });
    expect(result.crm).toEqual({
      jobId: 777,
      reviewItemCount: 2,
      contactId: 42,
      contactCreated: true,
      companyId: 99,
      skipped: undefined,
    });

    // Pending review items got wiped before AI re-extraction.
    expect(dbCalls.deletes).toHaveLength(1);
    // Source metadata got persisted with the new links.
    expect(dbCalls.updates).toHaveLength(1);
    const patch = dbCalls.updates[0].patch as { sourceMetadata: { links: unknown[] } };
    expect(patch.sourceMetadata.links).toHaveLength(1);
  });

  it('analyzes attachments and writes the updated attachments back to source_metadata', async () => {
    const attachments = [
      { key: 'r2/a.pdf', filename: 'a.pdf', contentType: 'application/pdf', size: 1024 },
    ];
    getMeetingMock.mockResolvedValue(
      makeMeeting({
        transcript: '',
        sourceMetadata: { attachments, senderEmail: 'ada@acme.test' },
      }),
    );
    analyzeMeetingAttachmentsMock.mockResolvedValue({
      attachments: attachments.map((a) => ({ ...a, analysis: 'PDF summary' })),
      totalTokens: 1500,
    });

    const { processBrainMeeting } = await importModule();
    const result = await processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 });

    expect(analyzeMeetingAttachmentsMock).toHaveBeenCalledWith(attachments, { clientId: 1 });
    expect(extractAndFetchLinksMock).not.toHaveBeenCalled();
    expect(result.attachmentsAnalyzed).toBe(1);
    expect(result.attachmentTokens).toBe(1500);
    expect(result.transcript).toBeNull();
    // No transcript → no extraction → CRM is skipped with no_extraction (but
    // it's also a non-email source filter check first — source is 'email' so
    // we get no_extraction).
    expect(result.crm?.skipped).toBe('no_extraction');
    // Update wrote both attachments and links.
    const patch = dbCalls.updates[0].patch as {
      sourceMetadata: { attachments: unknown[]; links: unknown[] };
    };
    expect(patch.sourceMetadata.attachments).toHaveLength(1);
    expect(patch.sourceMetadata.links).toEqual([]);
  });

  it('preserves existing link metadata when extractAndFetchLinks throws', async () => {
    const existingLinks = [{ url: 'https://kept.example', title: 'Kept' }];
    getMeetingMock.mockResolvedValue(
      makeMeeting({
        sourceMetadata: {
          links: existingLinks,
          senderEmail: 'ada@acme.test',
        },
      }),
    );
    extractAndFetchLinksMock.mockRejectedValue(new Error('network'));
    processMeetingTranscriptMock.mockResolvedValue({
      jobId: 1,
      reviewItemIds: [],
      extraction: { summary: 'x' },
    });
    getBrainProfileMock.mockResolvedValue({ autoLinkCrm: false });

    const { processBrainMeeting } = await importModule();
    const result = await processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 });

    expect(result.linksExtracted).toBe(1);
    expect(result.crm?.skipped).toBe('disabled');
  });

  it('skips transcript AI processing when options.skipTranscriptAi is true', async () => {
    getMeetingMock.mockResolvedValue(makeMeeting());
    extractAndFetchLinksMock.mockResolvedValue([]);

    const { processBrainMeeting } = await importModule();
    const result = await processBrainMeeting({
      clientId: 1,
      meetingId: 100,
      userId: 2,
      options: { skipTranscriptAi: true },
    });

    expect(processMeetingTranscriptMock).not.toHaveBeenCalled();
    expect(dbCalls.deletes).toHaveLength(0);
    expect(result.transcript).toBeNull();
    // No extraction → crm.skipped = 'no_extraction'.
    expect(result.crm?.skipped).toBe('no_extraction');
  });

  it('reports crm.skipped=not_email_source for non-email sources', async () => {
    getMeetingMock.mockResolvedValue(
      makeMeeting({ source: 'manual', sourceMetadata: {} }),
    );
    extractAndFetchLinksMock.mockResolvedValue([]);
    processMeetingTranscriptMock.mockResolvedValue({
      jobId: 1,
      reviewItemIds: [],
      extraction: { summary: 'x' },
    });

    const { processBrainMeeting } = await importModule();
    const result = await processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 });

    expect(getBrainProfileMock).not.toHaveBeenCalled();
    expect(classifyAndLinkCrmMock).not.toHaveBeenCalled();
    expect(result.crm?.skipped).toBe('not_email_source');
  });

  it('routes gmail-api threaded meetings through buildThreadTranscript + collectThreadParticipants', async () => {
    const thread = [
      { id: 100, title: 't1', meetingDate: new Date(), createdAt: new Date(), transcript: 'first', sourceMetadata: null },
      { id: 101, title: 't2', meetingDate: new Date(), createdAt: new Date(), transcript: 'second', sourceMetadata: null },
    ];
    getMeetingMock.mockResolvedValue(
      makeMeeting({ source: 'gmail-api', thread }),
    );
    extractAndFetchLinksMock.mockResolvedValue([]);
    buildThreadTranscriptMock.mockReturnValue('combined transcript');
    collectThreadParticipantsMock.mockReturnValue([
      { name: 'Ada', email: 'ada@acme.test' },
      { name: 'Bob' },
    ]);
    processMeetingTranscriptMock.mockResolvedValue({
      jobId: 1,
      reviewItemIds: [],
      extraction: { summary: 'thread summary' },
    });
    getBrainProfileMock.mockResolvedValue({ autoLinkCrm: false });

    const { processBrainMeeting } = await importModule();
    await processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 });

    expect(buildThreadTranscriptMock).toHaveBeenCalledWith(thread);
    expect(collectThreadParticipantsMock).toHaveBeenCalledWith(thread);
    // processMeetingTranscript received the combined transcript + thread participants.
    const args = processMeetingTranscriptMock.mock.calls[0][0];
    expect(args.transcript).toBe('combined transcript');
    expect(args.participants).toEqual([
      { name: 'Ada', email: 'ada@acme.test' },
      { name: 'Bob' },
    ]);
    // Dedupe delete used all thread sibling ids.
    const filter = dbCalls.deletes[0].filter as { args: unknown[] };
    const inArrayClause = filter.args.find(
      (a) => (a as { op?: string }).op === 'inArray',
    ) as { list: number[] };
    expect(inArrayClause.list).toEqual([100, 101]);
  });

  it('falls back to single-meeting transcript when thread combine returns empty', async () => {
    const thread = [
      { id: 100, title: 't1', meetingDate: new Date(), createdAt: new Date(), transcript: 'orig', sourceMetadata: null },
      { id: 101, title: 't2', meetingDate: new Date(), createdAt: new Date(), transcript: '', sourceMetadata: null },
    ];
    getMeetingMock.mockResolvedValue(
      makeMeeting({ source: 'gmail-api', thread }),
    );
    extractAndFetchLinksMock.mockResolvedValue([]);
    buildThreadTranscriptMock.mockReturnValue('');
    collectThreadParticipantsMock.mockReturnValue([]);
    processMeetingTranscriptMock.mockResolvedValue({
      jobId: 1,
      reviewItemIds: [],
      extraction: { summary: 's' },
    });
    getBrainProfileMock.mockResolvedValue({ autoLinkCrm: false });

    const { processBrainMeeting } = await importModule();
    await processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 });

    const args = processMeetingTranscriptMock.mock.calls[0][0];
    // buildThreadTranscript returned '' → original transcript used.
    expect(args.transcript).toBe('Hello world. Visit https://example.com.');
    // collectThreadParticipants returned [] → original participants used.
    expect(args.participants).toEqual([{ name: 'Ada', email: 'ada@acme.test' }]);
  });

  it('treats a single-segment gmail thread as non-thread (no thread combine)', async () => {
    getMeetingMock.mockResolvedValue(
      makeMeeting({
        source: 'gmail-api',
        thread: [
          { id: 100, title: 't1', meetingDate: new Date(), createdAt: new Date(), transcript: 'orig', sourceMetadata: null },
        ],
      }),
    );
    extractAndFetchLinksMock.mockResolvedValue([]);
    processMeetingTranscriptMock.mockResolvedValue({
      jobId: 1,
      reviewItemIds: [],
      extraction: { summary: 's' },
    });
    getBrainProfileMock.mockResolvedValue({ autoLinkCrm: false });

    const { processBrainMeeting } = await importModule();
    await processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 });

    // Thread combine not called — single segment doesn't trigger the path.
    expect(buildThreadTranscriptMock).not.toHaveBeenCalled();
    expect(collectThreadParticipantsMock).not.toHaveBeenCalled();
  });

  it('soft-fails when classifyAndLinkCrm throws', async () => {
    getMeetingMock.mockResolvedValue(makeMeeting());
    extractAndFetchLinksMock.mockResolvedValue([]);
    processMeetingTranscriptMock.mockResolvedValue({
      jobId: 1,
      reviewItemIds: [],
      extraction: { summary: 's' },
    });
    getBrainProfileMock.mockResolvedValue({ autoLinkCrm: true });
    classifyAndLinkCrmMock.mockRejectedValue(new Error('boom'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { processBrainMeeting } = await importModule();
    const result = await processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 });
    errSpy.mockRestore();

    expect(result.crm).toEqual({
      jobId: null,
      reviewItemCount: 0,
      contactId: null,
      contactCreated: false,
      companyId: null,
      skipped: 'failed',
    });
  });

  it('propagates skip codes from classifyAndLinkCrm (no_sender_email)', async () => {
    getMeetingMock.mockResolvedValue(makeMeeting());
    extractAndFetchLinksMock.mockResolvedValue([]);
    processMeetingTranscriptMock.mockResolvedValue({
      jobId: 1,
      reviewItemIds: [],
      extraction: { summary: 's' },
    });
    getBrainProfileMock.mockResolvedValue({ autoLinkCrm: true });
    classifyAndLinkCrmMock.mockResolvedValue({
      jobId: -1,
      reviewItemIds: [],
      appliedLinks: {},
      skipped: 'no_sender_email',
    });

    const { processBrainMeeting } = await importModule();
    const result = await processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 });
    expect(result.crm?.skipped).toBe('no_sender_email');
    expect(result.crm?.contactId).toBeNull();
    expect(result.crm?.companyId).toBeNull();
    expect(result.crm?.contactCreated).toBe(false);
  });

  it('skips DB metadata write when nothing changed (no attachments, no links, no existing links)', async () => {
    // Transcript-only meeting but extractAndFetchLinks returns [] and there are
    // no existing links and no attachments → skip the metadata UPDATE.
    getMeetingMock.mockResolvedValue(
      makeMeeting({
        sourceMetadata: { senderEmail: 'x@x.test' }, // no attachments, no links
      }),
    );
    extractAndFetchLinksMock.mockResolvedValue([]);
    processMeetingTranscriptMock.mockResolvedValue({
      jobId: 1,
      reviewItemIds: [],
      extraction: { summary: 's' },
    });
    getBrainProfileMock.mockResolvedValue({ autoLinkCrm: false });

    const { processBrainMeeting } = await importModule();
    await processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 });

    // No source_metadata write.
    expect(dbCalls.updates).toHaveLength(0);
  });

  it('treats null sourceMetadata as empty (no attachments / no links)', async () => {
    getMeetingMock.mockResolvedValue(
      makeMeeting({ sourceMetadata: null }),
    );
    extractAndFetchLinksMock.mockResolvedValue([]);
    processMeetingTranscriptMock.mockResolvedValue({
      jobId: 1,
      reviewItemIds: [],
      extraction: { summary: 's' },
    });
    getBrainProfileMock.mockResolvedValue({ autoLinkCrm: false });

    const { processBrainMeeting } = await importModule();
    const result = await processBrainMeeting({ clientId: 1, meetingId: 100, userId: 2 });

    expect(result.attachmentsAnalyzed).toBe(0);
    expect(result.linksExtracted).toBe(0);
    expect(analyzeMeetingAttachmentsMock).not.toHaveBeenCalled();
  });
});
