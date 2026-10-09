// The Knowledge list, pure half (PUX-159, design doc screen 18). Rows come
// from /api/portal/brain/knowledge?withTopics=1; this derives the computed
// Type, the status pill and the client-side type/topic filters. No I/O.
import { noteType, type NoteType } from './note-type';
import { ago } from '@/lib/portal/needs-you-shape';

export interface KnowledgeApiRow {
  id: number; title: string; source: string; sourceUrl: string | null; attachmentFilename: string | null;
  meetingId: number | null; needsReview: boolean; updatedAt: string | Date; topics?: { id: number; name: string }[];
}
export interface KnowledgeRow {
  id: number; title: string; type: NoteType; source: string; topics: { id: number; name: string }[];
  when: string; status: 'Needs review' | 'Reviewed';
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Written here', teams_transcript: 'Teams call', google_meet_recording: 'Google Meet', zoom: 'Zoom', live_voice: 'Live voice',
  document_import: 'Imported doc', crawl: 'Imported page', ai_review: 'From the Brain', ai_suggestion: 'From the Brain', mcp: 'Connected app', platform: 'Platform',
};

export function shapeKnowledgeRows(items: KnowledgeApiRow[], now = new Date()): KnowledgeRow[] {
  return items.map((n) => ({
    id: n.id,
    title: n.title || 'Untitled',
    type: noteType(n),
    source: n.attachmentFilename ?? SOURCE_LABEL[n.source] ?? n.source,
    topics: n.topics ?? [],
    when: ago(new Date(n.updatedAt), now),
    status: n.needsReview ? 'Needs review' : 'Reviewed',
  }));
}

export function typeCounts(rows: KnowledgeRow[]): Partial<Record<NoteType, number>> {
  const out: Partial<Record<NoteType, number>> = {};
  for (const r of rows) out[r.type] = (out[r.type] ?? 0) + 1;
  return out;
}

export function filterRows(rows: KnowledgeRow[], f: { type?: NoteType | null; topicId?: number | null }): KnowledgeRow[] {
  return rows.filter((r) => (!f.type || r.type === f.type) && (!f.topicId || r.topics.some((t) => t.id === f.topicId)));
}
