import { describe, it, expect } from 'vitest';
import { filterRows, shapeKnowledgeRows, typeCounts } from '@/lib/brain/knowledge-list-shape';

const now = new Date('2026-08-27T15:00:00Z');
const rows = shapeKnowledgeRows([
  { id: 1, title: 'Summit Bank — retreat logistics', source: 'zoom', sourceUrl: null, attachmentFilename: null, meetingId: 4, needsReview: true, updatedAt: '2026-08-27T13:00:00Z', topics: [{ id: 10, name: 'Bookings & trips' }] },
  { id: 2, title: '', source: 'document_import', sourceUrl: null, attachmentFilename: 'roster.pdf', meetingId: null, needsReview: false, updatedAt: '2026-08-26T13:00:00Z' },
  { id: 3, title: 'Competitor pricing scan', source: 'crawl', sourceUrl: 'https://x', attachmentFilename: null, meetingId: null, needsReview: false, updatedAt: '2026-08-25T13:00:00Z', topics: [{ id: 11, name: 'Store & gear' }] },
], now);

describe('knowledge list shape (PUX-159)', () => {
  it('derives type, source label, status and time', () => {
    expect(rows[0]).toMatchObject({ type: 'Meeting', source: 'Zoom', status: 'Needs review', when: '2 h ago' });
    expect(rows[1]).toMatchObject({ title: 'Untitled', type: 'Doc', source: 'roster.pdf', status: 'Reviewed', topics: [] });
    expect(rows[2]).toMatchObject({ type: 'Web', source: 'Imported page' });
  });
  it('type counts + filters by type and topic', () => {
    expect(typeCounts(rows)).toEqual({ Meeting: 1, Doc: 1, Web: 1 });
    expect(filterRows(rows, { type: 'Web' }).map((r) => r.id)).toEqual([3]);
    expect(filterRows(rows, { topicId: 10 }).map((r) => r.id)).toEqual([1]);
    expect(filterRows(rows, {}).length).toBe(3);
  });
});
