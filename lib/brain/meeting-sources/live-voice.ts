import { randomUUID } from 'crypto';
import type { MeetingSourceAdapter, NormalizedMeetingInput } from './index';

/**
 * Live-voice adapter — captures a transcript produced in-browser by the portal
 * voice assistant (WebRTC + OpenAI Realtime) and ingests it as a Brain meeting.
 *
 * Shape mirrors the paste adapter: the caller hands us a finished transcript;
 * we normalize it. Always available (no external integration required).
 */
export interface LiveVoiceAdapterInput {
  transcript: string;
  title?: string;
  meetingDate?: string; // ISO
  participants?: { name: string; email?: string }[];
  /** Optional duration of the captured session, in seconds (stored as metadata). */
  durationSeconds?: number;
}

export const liveVoiceAdapter: MeetingSourceAdapter<LiveVoiceAdapterInput> = {
  id: 'live_voice',
  label: 'Live voice capture',
  description: 'Save a spoken conversation captured by the portal voice assistant as a meeting.',
  icon: 'record_voice_over',
  enabledFor() {
    return true;
  },
  async fetch(input): Promise<NormalizedMeetingInput> {
    const transcript = (input.transcript || '').trim();
    if (!transcript) {
      throw new Error('Transcript is required.');
    }
    return {
      transcript,
      title: input.title?.trim() || undefined,
      meetingDate: input.meetingDate ? new Date(input.meetingDate) : new Date(),
      participants:
        input.participants?.filter((p) => p.name?.trim()).map((p) => ({
          name: p.name.trim(),
          email: p.email?.trim() || undefined,
        })) || [],
      sourceRef: `live_voice:${randomUUID()}`,
      sourceMetadata: {
        byteCount: transcript.length,
        durationSeconds:
          typeof input.durationSeconds === 'number' ? input.durationSeconds : undefined,
      },
    };
  },
};
