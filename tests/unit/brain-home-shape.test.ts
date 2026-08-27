import { describe, it, expect } from 'vitest';
import { noteType } from '@/lib/brain/note-type';
import { brainActiveRun, brainHomeNotes, brainNeedsOwner, brainStatusRows } from '@/lib/brain/home-shape';

const now = new Date('2026-08-27T15:00:00Z');
const note = (o: Partial<Parameters<typeof noteType>[0]> = {}) => ({ source: 'manual', meetingId: null, sourceUrl: null, attachmentFilename: null, ...o });

describe('Brain home shape (PUX-158) + noteType (PUX-159)', () => {
  it('noteType: Meeting > Call > Web > Doc > Note', () => {
    expect(noteType(note({ meetingId: 4, source: 'teams_transcript' }))).toBe('Meeting');
    expect(noteType(note({ source: 'google_meet_recording' }))).toBe('Call');
    expect(noteType(note({ source: 'manual', sourceUrl: 'https://x' }))).toBe('Web');
    expect(noteType(note({ source: 'crawl' }))).toBe('Web');
    expect(noteType(note({ source: 'document_import' }))).toBe('Doc');
    expect(noteType(note({ attachmentFilename: 'roster.pdf' }))).toBe('Doc');
    expect(noteType(note())).toBe('Note');
  });

  it('status rows: only what is non-zero, in the order a person would act', () => {
    const rows = brainStatusRows({
      counts: { pendingReviewItems: 4, openTasks: 9, playbookRunsActive: 1, documentsRequiredReadsPending: 0, goalsAtRisk: 1 },
      overdueTasks: [{ title: 'Permit renewal' }], blockedTasks: [], upcomingTasks: [{ title: 'Guide roster' }, { title: 'Photo shoot brief' }],
    });
    expect(rows.map((r) => r.label)).toEqual(['4 items to review', '1 task overdue', '2 tasks due this week', '1 goal at risk']);
    expect(rows[2].detail).toBe('Guide roster · Photo shoot brief');
    expect(brainStatusRows(null)).toEqual([]);
  });

  it('notes / needs-owner / run view models', () => {
    const [n] = brainHomeNotes([{ id: 1, title: 'Retreat call', source: 'zoom', meetingId: null, sourceUrl: null, attachmentFilename: null, updatedAt: '2026-08-27T13:00:00Z', needsReview: true }], now);
    expect(n).toMatchObject({ type: 'Call', icon: 'call', when: '2 h ago', needsReview: true, href: '/portal/brain/knowledge/1' });
    const d = brainNeedsOwner([
      { id: 1, title: 'Owned', decisionMakerId: 7, createdAt: '2026-08-27T13:00:00Z' },
      { id: 2, title: 'Ownerless', decisionMakerId: null, createdAt: '2026-08-26T13:00:00Z' },
    ], now);
    expect(d.map((x) => x.title)).toEqual(['Ownerless', 'Owned']); // needs-an-owner first
    expect(d[0]).toMatchObject({ owned: false, href: '/portal/brain/decisions/2' });
    expect(brainActiveRun([{ id: 9, playbookName: 'Season opening', stepProgress: { completed: 3, total: 7 } }])).toEqual({ id: 9, name: 'Season opening', done: 3, total: 7, href: '/portal/brain/playbook-runs/9' });
    expect(brainActiveRun([])).toBeNull();
  });
});
