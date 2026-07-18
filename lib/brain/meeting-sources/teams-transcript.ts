/**
 * Adapter that ingests a Microsoft Teams meeting transcript into a
 * brain_meetings row.
 *
 * Caller (lib/microsoft/transcripts-sync.ts) is responsible for fetching the
 * VTT content + meeting metadata from Graph and passing it in. This adapter
 * handles normalization only — no Graph calls.
 *
 * sourceRef = `teams:{meetingId}:{transcriptId}`. Multiple transcripts on the
 * same meeting (rare but supported by Graph) become distinct brain_meetings
 * rows. Re-syncing the same transcript updates the existing row (idempotent
 * on (clientId, sourceRef) per createMeetingFromAdapter).
 */

import type { MeetingSourceAdapter, NormalizedMeetingInput, AdapterContext } from './index';

export interface TeamsTranscriptInput {
  meetingId: string;
  transcriptId: string;
  /** Plain-text "Speaker: line\n…" — already parsed from VTT by the caller. */
  transcript: string;
  /** Raw WebVTT preserved as-is for audit / re-parsing. */
  vtt: string;
  meetingSubject: string;
  meetingStart: Date | null;
  meetingEnd: Date | null;
  joinWebUrl: string | null;
  participants: { name: string; email?: string }[];
  organizerOid: string;
  organizerTenantId: string;
}

export const teamsTranscriptAdapter: MeetingSourceAdapter<TeamsTranscriptInput> = {
  id: 'teams_transcript',
  label: 'Microsoft Teams transcript',
  description: 'Auto-ingest meeting transcripts from Microsoft Teams (organizer-only)',
  icon: 'video_chat',
  enabledFor: () => true,
  async fetch(input: TeamsTranscriptInput, _ctx: AdapterContext): Promise<NormalizedMeetingInput> {
    if (!input?.meetingId || !input?.transcriptId) {
      throw new Error('teams_transcript adapter: missing meetingId or transcriptId');
    }
    if (!input.transcript) {
      throw new Error('teams_transcript adapter: empty transcript text');
    }
    return {
      transcript: input.transcript,
      title: input.meetingSubject,
      meetingDate: input.meetingStart ?? undefined,
      participants: input.participants,
      sourceRef: `teams:${input.meetingId}:${input.transcriptId}`,
      sourceMetadata: {
        source: 'teams_transcript',
        meetingId: input.meetingId,
        transcriptId: input.transcriptId,
        organizerOid: input.organizerOid,
        organizerTenantId: input.organizerTenantId,
        joinWebUrl: input.joinWebUrl,
        meetingStart: input.meetingStart?.toISOString() ?? null,
        meetingEnd: input.meetingEnd?.toISOString() ?? null,
        // The raw WebVTT is preserved so we can re-parse with a smarter
        // parser later (e.g. richer speaker diarization, timestamp
        // anchoring) without re-fetching from Graph.
        vtt: input.vtt,
      },
    };
  },
};
