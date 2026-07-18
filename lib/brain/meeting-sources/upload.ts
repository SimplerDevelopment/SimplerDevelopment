import { randomUUID } from 'crypto';
import type { MeetingSourceAdapter, NormalizedMeetingInput } from './index';

export interface UploadAdapterInput {
  /** Already-parsed plain text. Caller (browser) reads + sanitizes the file. */
  transcript: string;
  filename: string;
  mimeType?: string;
  byteCount?: number;
  title?: string;
  meetingDate?: string; // ISO
  participants?: { name: string; email?: string }[];
}

const MAX_BYTES = 5 * 1024 * 1024; // 5MB hard cap on parsed text

export const uploadAdapter: MeetingSourceAdapter<UploadAdapterInput> = {
  id: 'upload',
  label: 'Upload file',
  description: 'Upload a transcript file: .txt, .md, .vtt, or .srt.',
  icon: 'upload_file',
  enabledFor() { return true; },
  async fetch(input): Promise<NormalizedMeetingInput> {
    const transcript = (input.transcript || '').trim();
    if (!transcript) throw new Error('Uploaded file is empty.');
    if (Buffer.byteLength(transcript, 'utf8') > MAX_BYTES) {
      throw new Error('Uploaded file is larger than 5MB after parsing.');
    }
    if (!input.filename?.trim()) {
      throw new Error('filename is required.');
    }

    const titleFromFile = input.filename.replace(/\.[^.]+$/, '').trim();
    return {
      transcript,
      title: input.title?.trim() || titleFromFile || undefined,
      meetingDate: input.meetingDate ? new Date(input.meetingDate) : undefined,
      participants: input.participants?.filter((p) => p.name?.trim()).map((p) => ({
        name: p.name.trim(),
        email: p.email?.trim() || undefined,
      })) || [],
      sourceRef: `upload:${randomUUID()}`,
      sourceMetadata: {
        filename: input.filename,
        mimeType: input.mimeType || 'text/plain',
        byteCount: input.byteCount ?? transcript.length,
      },
    };
  },
};
