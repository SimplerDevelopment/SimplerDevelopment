/**
 * Adapter that ingests a Google Meet recording artifact (transcript Doc or
 * "Notes by Gemini" Doc) into a brain_meetings row.
 *
 * Caller (lib/google/drive-changes.ts) is responsible for finding the file,
 * fetching its plaintext export, and passing it in. This adapter handles
 * normalization only — no Drive API calls.
 *
 * sourceRef = Drive file id, so re-syncing the same Doc updates the existing
 * brain_meetings row instead of creating a duplicate.
 */

import type { MeetingSourceAdapter, NormalizedMeetingInput, AdapterContext } from './index';

export interface GoogleMeetRecordingInput {
  fileId: string;
  name: string;
  createdTime: string | null;
  webViewLink: string | null;
  parentFolderId: string;
  text: string;
}

export const googleMeetRecordingAdapter: MeetingSourceAdapter<GoogleMeetRecordingInput> = {
  id: 'google_meet_recording',
  label: 'Google Meet recording',
  description: 'Auto-ingest meeting transcripts and Gemini notes from Drive',
  icon: 'video_chat',
  enabledFor: () => true,
  async fetch(input: GoogleMeetRecordingInput, _ctx: AdapterContext): Promise<NormalizedMeetingInput> {
    if (!input?.fileId || !input?.text) {
      throw new Error('google_meet_recording adapter: missing fileId or text');
    }
    const meetingDate = input.createdTime ? new Date(input.createdTime) : undefined;
    return {
      transcript: input.text,
      title: input.name || '(Meet recording)',
      meetingDate: meetingDate && !Number.isNaN(meetingDate.getTime()) ? meetingDate : undefined,
      sourceRef: input.fileId,
      sourceMetadata: {
        source: 'google_meet_recording',
        driveFileId: input.fileId,
        driveParentFolderId: input.parentFolderId,
        webViewLink: input.webViewLink,
        createdTime: input.createdTime,
      },
    };
  },
};
