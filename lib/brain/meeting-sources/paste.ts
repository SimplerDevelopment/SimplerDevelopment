import { randomUUID } from 'crypto';
import type { MeetingSourceAdapter, NormalizedMeetingInput } from './index';

export interface PasteAdapterInput {
  transcript: string;
  title?: string;
  meetingDate?: string; // ISO
  participants?: { name: string; email?: string }[];
}

export const pasteAdapter: MeetingSourceAdapter<PasteAdapterInput> = {
  id: 'paste',
  label: 'Paste transcript',
  description: 'Paste meeting notes or a transcript directly. Always available.',
  icon: 'content_paste',
  enabledFor() { return true; },
  async fetch(input): Promise<NormalizedMeetingInput> {
    const transcript = (input.transcript || '').trim();
    if (!transcript) {
      throw new Error('Transcript is required.');
    }
    return {
      transcript,
      title: input.title?.trim() || undefined,
      meetingDate: input.meetingDate ? new Date(input.meetingDate) : undefined,
      participants: input.participants?.filter((p) => p.name?.trim()).map((p) => ({
        name: p.name.trim(),
        email: p.email?.trim() || undefined,
      })) || [],
      sourceRef: `paste:${randomUUID()}`,
      sourceMetadata: { byteCount: transcript.length },
    };
  },
};
