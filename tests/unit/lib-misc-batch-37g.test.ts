// @vitest-environment node
/**
 * Unit tests for four small, pure brain lib modules:
 *   - lib/brain/meeting-sources/google-meet-recording.ts
 *   - lib/brain/meeting-sources/teams-transcript.ts
 *   - lib/brain/meeting-sources/upload.ts
 *   - lib/brain/industry-templates/generic.ts
 *
 * These adapters are normalization-only — they don't make any network or DB
 * calls — so the tests just exercise their input validation and output
 * shape. `upload.ts` pulls `randomUUID` from `crypto`, which we mock to
 * keep `sourceRef` deterministic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Deterministic UUID for upload adapter
vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    randomUUID: () => '00000000-0000-0000-0000-000000000000',
  };
});

// AdapterContext is unused by these adapters — pass a stub.
const CTX: any = { clientId: 1, userId: 2, profile: {} as any };

describe('googleMeetRecordingAdapter', () => {
  let adapter: typeof import('@/lib/brain/meeting-sources/google-meet-recording').googleMeetRecordingAdapter;

  beforeEach(async () => {
    ({ googleMeetRecordingAdapter: adapter } = await import('@/lib/brain/meeting-sources/google-meet-recording'));
  });

  it('exposes the expected static metadata', () => {
    expect(adapter.id).toBe('google_meet_recording');
    expect(adapter.label).toBe('Google Meet recording');
    expect(adapter.description).toContain('Drive');
    expect(adapter.icon).toBe('video_chat');
    expect(adapter.enabledFor({} as any)).toBe(true);
  });

  it('throws when fileId is missing', async () => {
    await expect(
      adapter.fetch(
        { fileId: '', name: 'x', createdTime: null, webViewLink: null, parentFolderId: 'p', text: 'hello' } as any,
        CTX,
      ),
    ).rejects.toThrow(/missing fileId or text/);
  });

  it('throws when text is empty', async () => {
    await expect(
      adapter.fetch(
        { fileId: 'f1', name: 'x', createdTime: null, webViewLink: null, parentFolderId: 'p', text: '' } as any,
        CTX,
      ),
    ).rejects.toThrow(/missing fileId or text/);
  });

  it('throws when input is null/undefined', async () => {
    await expect(adapter.fetch(null as any, CTX)).rejects.toThrow(/missing fileId or text/);
    await expect(adapter.fetch(undefined as any, CTX)).rejects.toThrow(/missing fileId or text/);
  });

  it('normalizes a complete input', async () => {
    const out = await adapter.fetch(
      {
        fileId: 'file-123',
        name: 'Standup notes',
        createdTime: '2026-04-29T10:00:00.000Z',
        webViewLink: 'https://docs.google.com/x',
        parentFolderId: 'folder-1',
        text: 'Speaker: hi\n',
      },
      CTX,
    );
    expect(out.transcript).toBe('Speaker: hi\n');
    expect(out.title).toBe('Standup notes');
    expect(out.meetingDate).toBeInstanceOf(Date);
    expect((out.meetingDate as Date).toISOString()).toBe('2026-04-29T10:00:00.000Z');
    expect(out.sourceRef).toBe('file-123');
    expect(out.sourceMetadata).toEqual({
      source: 'google_meet_recording',
      driveFileId: 'file-123',
      driveParentFolderId: 'folder-1',
      webViewLink: 'https://docs.google.com/x',
      createdTime: '2026-04-29T10:00:00.000Z',
    });
  });

  it('falls back to the Meet recording placeholder title when name is empty', async () => {
    const out = await adapter.fetch(
      {
        fileId: 'file-2',
        name: '',
        createdTime: null,
        webViewLink: null,
        parentFolderId: 'folder-x',
        text: 'body',
      },
      CTX,
    );
    expect(out.title).toBe('(Meet recording)');
    expect(out.meetingDate).toBeUndefined();
    expect(out.sourceMetadata).toMatchObject({ createdTime: null, webViewLink: null });
  });

  it('treats an unparseable createdTime as missing date', async () => {
    const out = await adapter.fetch(
      {
        fileId: 'file-3',
        name: 'X',
        createdTime: 'not-a-date',
        webViewLink: null,
        parentFolderId: 'f',
        text: 'body',
      },
      CTX,
    );
    expect(out.meetingDate).toBeUndefined();
  });

  it('treats null createdTime as missing date', async () => {
    const out = await adapter.fetch(
      {
        fileId: 'file-4',
        name: 'X',
        createdTime: null,
        webViewLink: null,
        parentFolderId: 'f',
        text: 'body',
      },
      CTX,
    );
    expect(out.meetingDate).toBeUndefined();
  });
});

describe('teamsTranscriptAdapter', () => {
  let adapter: typeof import('@/lib/brain/meeting-sources/teams-transcript').teamsTranscriptAdapter;

  beforeEach(async () => {
    ({ teamsTranscriptAdapter: adapter } = await import('@/lib/brain/meeting-sources/teams-transcript'));
  });

  const baseInput = () => ({
    meetingId: 'm-1',
    transcriptId: 't-1',
    transcript: 'Alice: hi\nBob: hello',
    vtt: 'WEBVTT\n\n00:00:00 --> 00:00:01\nAlice: hi',
    meetingSubject: 'Sync',
    meetingStart: new Date(Date.UTC(2026, 4, 1, 14, 0, 0)),
    meetingEnd: new Date(Date.UTC(2026, 4, 1, 14, 30, 0)),
    joinWebUrl: 'https://teams.microsoft.com/x',
    participants: [{ name: 'Alice', email: 'a@x.com' }],
    organizerOid: 'oid-1',
    organizerTenantId: 'tenant-1',
  });

  it('exposes the expected static metadata', () => {
    expect(adapter.id).toBe('teams_transcript');
    expect(adapter.label).toBe('Microsoft Teams transcript');
    expect(adapter.icon).toBe('video_chat');
    expect(adapter.description).toMatch(/Teams/i);
    expect(adapter.enabledFor({} as any)).toBe(true);
  });

  it('throws when meetingId is missing', async () => {
    const input = { ...baseInput(), meetingId: '' };
    await expect(adapter.fetch(input as any, CTX)).rejects.toThrow(/missing meetingId or transcriptId/);
  });

  it('throws when transcriptId is missing', async () => {
    const input = { ...baseInput(), transcriptId: '' };
    await expect(adapter.fetch(input as any, CTX)).rejects.toThrow(/missing meetingId or transcriptId/);
  });

  it('throws when input is null/undefined', async () => {
    await expect(adapter.fetch(null as any, CTX)).rejects.toThrow(/missing meetingId or transcriptId/);
    await expect(adapter.fetch(undefined as any, CTX)).rejects.toThrow(/missing meetingId or transcriptId/);
  });

  it('throws when transcript text is empty', async () => {
    const input = { ...baseInput(), transcript: '' };
    await expect(adapter.fetch(input as any, CTX)).rejects.toThrow(/empty transcript text/);
  });

  it('normalizes a complete input including ISO-string timestamps in metadata', async () => {
    const out = await adapter.fetch(baseInput() as any, CTX);
    expect(out.transcript).toBe('Alice: hi\nBob: hello');
    expect(out.title).toBe('Sync');
    expect(out.meetingDate?.toISOString()).toBe('2026-05-01T14:00:00.000Z');
    expect(out.participants).toEqual([{ name: 'Alice', email: 'a@x.com' }]);
    expect(out.sourceRef).toBe('teams:m-1:t-1');
    expect(out.sourceMetadata).toEqual({
      source: 'teams_transcript',
      meetingId: 'm-1',
      transcriptId: 't-1',
      organizerOid: 'oid-1',
      organizerTenantId: 'tenant-1',
      joinWebUrl: 'https://teams.microsoft.com/x',
      meetingStart: '2026-05-01T14:00:00.000Z',
      meetingEnd: '2026-05-01T14:30:00.000Z',
      vtt: 'WEBVTT\n\n00:00:00 --> 00:00:01\nAlice: hi',
    });
  });

  it('handles null meetingStart/meetingEnd by emitting null in metadata and undefined for meetingDate', async () => {
    const out = await adapter.fetch(
      { ...baseInput(), meetingStart: null, meetingEnd: null } as any,
      CTX,
    );
    expect(out.meetingDate).toBeUndefined();
    expect(out.sourceMetadata).toMatchObject({ meetingStart: null, meetingEnd: null });
  });
});

describe('uploadAdapter', () => {
  let adapter: typeof import('@/lib/brain/meeting-sources/upload').uploadAdapter;

  beforeEach(async () => {
    ({ uploadAdapter: adapter } = await import('@/lib/brain/meeting-sources/upload'));
  });

  it('exposes the expected static metadata', () => {
    expect(adapter.id).toBe('upload');
    expect(adapter.label).toBe('Upload file');
    expect(adapter.icon).toBe('upload_file');
    expect(adapter.description).toMatch(/\.txt/);
    expect(adapter.enabledFor({} as any)).toBe(true);
  });

  it('throws when transcript is empty after trim', async () => {
    await expect(
      adapter.fetch({ transcript: '   ', filename: 'a.txt' } as any, CTX),
    ).rejects.toThrow(/empty/);
    await expect(
      adapter.fetch({ transcript: '', filename: 'a.txt' } as any, CTX),
    ).rejects.toThrow(/empty/);
  });

  it('throws when transcript is missing entirely', async () => {
    await expect(
      adapter.fetch({ filename: 'a.txt' } as any, CTX),
    ).rejects.toThrow(/empty/);
  });

  it('throws when transcript exceeds 5MB after parsing', async () => {
    // 5MB + 1 byte of plain ASCII
    const big = 'a'.repeat(5 * 1024 * 1024 + 1);
    await expect(
      adapter.fetch({ transcript: big, filename: 'big.txt' } as any, CTX),
    ).rejects.toThrow(/5MB/);
  });

  it('throws when filename is missing or whitespace', async () => {
    await expect(
      adapter.fetch({ transcript: 'hi', filename: '' } as any, CTX),
    ).rejects.toThrow(/filename is required/);
    await expect(
      adapter.fetch({ transcript: 'hi', filename: '   ' } as any, CTX),
    ).rejects.toThrow(/filename is required/);
    await expect(
      adapter.fetch({ transcript: 'hi' } as any, CTX),
    ).rejects.toThrow(/filename is required/);
  });

  it('derives title from filename when no title provided (strips extension)', async () => {
    const out = await adapter.fetch(
      { transcript: 'body', filename: 'My Meeting.txt' } as any,
      CTX,
    );
    expect(out.title).toBe('My Meeting');
    expect(out.transcript).toBe('body');
    expect(out.sourceRef).toBe('upload:00000000-0000-0000-0000-000000000000');
    expect(out.sourceMetadata).toEqual({
      filename: 'My Meeting.txt',
      mimeType: 'text/plain',
      byteCount: 4,
    });
    expect(out.participants).toEqual([]);
    expect(out.meetingDate).toBeUndefined();
  });

  it('prefers explicit title over derived filename', async () => {
    const out = await adapter.fetch(
      { transcript: 'body', filename: 'a.txt', title: '  Real Title  ' } as any,
      CTX,
    );
    expect(out.title).toBe('Real Title');
  });

  it('falls back to undefined title when filename has no stem and no title set', async () => {
    const out = await adapter.fetch(
      { transcript: 'body', filename: '.txt' } as any,
      CTX,
    );
    expect(out.title).toBeUndefined();
  });

  it('parses meetingDate ISO string into a Date', async () => {
    const out = await adapter.fetch(
      {
        transcript: 'body',
        filename: 'a.txt',
        meetingDate: '2026-04-29T12:00:00.000Z',
      } as any,
      CTX,
    );
    expect(out.meetingDate).toBeInstanceOf(Date);
    expect(out.meetingDate?.toISOString()).toBe('2026-04-29T12:00:00.000Z');
  });

  it('uses provided mimeType and byteCount overrides in metadata', async () => {
    const out = await adapter.fetch(
      {
        transcript: 'hi',
        filename: 'a.vtt',
        mimeType: 'text/vtt',
        byteCount: 999,
      } as any,
      CTX,
    );
    expect(out.sourceMetadata).toEqual({
      filename: 'a.vtt',
      mimeType: 'text/vtt',
      byteCount: 999,
    });
  });

  it('filters out participants with empty names and trims surrounding ones', async () => {
    const out = await adapter.fetch(
      {
        transcript: 'hi',
        filename: 'a.txt',
        participants: [
          { name: '  Alice  ', email: '  a@x.com  ' },
          { name: '', email: 'noone@x.com' },
          { name: '   ', email: 'space@x.com' },
          { name: 'Bob' },
          { name: 'Carol', email: '' },
        ],
      } as any,
      CTX,
    );
    expect(out.participants).toEqual([
      { name: 'Alice', email: 'a@x.com' },
      { name: 'Bob', email: undefined },
      { name: 'Carol', email: undefined },
    ]);
  });

  it('defaults participants to empty array when not provided', async () => {
    const out = await adapter.fetch(
      { transcript: 'hi', filename: 'a.txt' } as any,
      CTX,
    );
    expect(out.participants).toEqual([]);
  });
});

describe('genericTemplate', () => {
  it('exposes the expected static identity', async () => {
    const { genericTemplate } = await import('@/lib/brain/industry-templates/generic');
    expect(genericTemplate.id).toBe('generic');
    expect(genericTemplate.label).toBe('Generic');
    expect(typeof genericTemplate.description).toBe('string');
    expect(genericTemplate.description.length).toBeGreaterThan(0);
  });

  it('lists the four canonical relationship types', async () => {
    const { genericTemplate } = await import('@/lib/brain/industry-templates/generic');
    expect(genericTemplate.relationshipTypes).toEqual([
      { id: 'company', label: 'Company' },
      { id: 'prospect', label: 'Prospect' },
      { id: 'partner', label: 'Partner' },
      { id: 'vendor', label: 'Vendor' },
    ]);
  });

  it('has empty service lines (generic catch-all)', async () => {
    const { genericTemplate } = await import('@/lib/brain/industry-templates/generic');
    expect(genericTemplate.serviceLines).toEqual([]);
  });

  it('exposes the three default views', async () => {
    const { genericTemplate } = await import('@/lib/brain/industry-templates/generic');
    expect(genericTemplate.defaultViews).toEqual(['Today', 'Needs Review', 'Overdue']);
  });

  it('defaults compliance to human-review-on, audit-on, no blocked fields', async () => {
    const { genericTemplate } = await import('@/lib/brain/industry-templates/generic');
    expect(genericTemplate.complianceDefaults).toEqual({
      requireHumanReviewForAi: true,
      auditAiChanges: true,
      blockedFields: [],
    });
  });
});
