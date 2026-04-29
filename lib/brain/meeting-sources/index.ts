import type { BrainProfile } from '@/lib/brain/profiles';

export type MeetingSourceId =
  | 'paste'
  | 'upload'
  | 'google_doc'
  | 'google_drive_watch'
  | 'google_meet_recording'
  | 'zoom';

export interface NormalizedMeetingInput {
  transcript: string;
  title?: string;
  meetingDate?: Date;
  participants?: { name: string; email?: string; contactId?: number; roleInMeeting?: string }[];
  sourceRef: string;
  sourceMetadata?: Record<string, unknown>;
}

export interface AdapterContext {
  clientId: number;
  userId: number;
  profile: BrainProfile;
}

export interface MeetingSourceAdapter<Input = unknown> {
  id: MeetingSourceId;
  label: string;
  description: string;
  icon: string;
  enabledFor(profile: BrainProfile): boolean | Promise<boolean>;
  fetch(input: Input, ctx: AdapterContext): Promise<NormalizedMeetingInput>;
}

import { pasteAdapter } from './paste';
import { uploadAdapter } from './upload';
import { googleMeetRecordingAdapter } from './google-meet-recording';

const ADAPTERS: Record<MeetingSourceId, MeetingSourceAdapter | null> = {
  paste: pasteAdapter as MeetingSourceAdapter,
  upload: uploadAdapter as MeetingSourceAdapter,
  google_doc: null,             // Phase 2c
  google_drive_watch: null,     // Phase 5.5 — superseded by google_meet_recording
  google_meet_recording: googleMeetRecordingAdapter as MeetingSourceAdapter,
  zoom: null,                   // backlog
};

export function getMeetingAdapter(id: string): MeetingSourceAdapter | null {
  return ADAPTERS[id as MeetingSourceId] ?? null;
}

export async function listEnabledAdapters(profile: BrainProfile): Promise<MeetingSourceAdapter[]> {
  const out: MeetingSourceAdapter[] = [];
  for (const adapter of Object.values(ADAPTERS)) {
    if (!adapter) continue;
    const ok = await adapter.enabledFor(profile);
    if (ok) out.push(adapter);
  }
  return out;
}
