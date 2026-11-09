// What kind of thing a note IS (PUX-158/159, design doc screens 17–18):
// "Type is computed, not stored. brain_notes has no type column; infer
// Call / Doc / Meeting / Web from source, meetingId and sourceUrl."
// Source values come from the importers (lib/brain/*): teams_transcript,
// google_meet_recording, zoom, live_voice, document_import, crawl, manual…
export type NoteType = 'Meeting' | 'Call' | 'Web' | 'Doc' | 'Note';

const CALL_SOURCES = new Set(['teams_transcript', 'google_meet_recording', 'zoom', 'live_voice']);

export function noteType(n: { source: string; meetingId: number | null; sourceUrl: string | null; attachmentFilename: string | null }): NoteType {
  if (n.meetingId != null) return 'Meeting';
  if (CALL_SOURCES.has(n.source)) return 'Call';
  if (n.sourceUrl || n.source === 'crawl') return 'Web';
  if (n.source === 'document_import' || n.attachmentFilename) return 'Doc';
  return 'Note';
}

export const NOTE_TYPE_ICON: Record<NoteType, string> = {
  Meeting: 'event', Call: 'call', Web: 'language', Doc: 'description', Note: 'sticky_note_2',
};
