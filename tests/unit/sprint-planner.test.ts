import { describe, it, expect } from 'vitest';
import { computeSprintProposal, type BacklogCardInput } from '@/lib/portal/sprint-planner';

const C = (id: number, points: number | null, blockers: number[] = []): BacklogCardInput => ({
  id,
  number: id,
  title: `Card ${id}`,
  storyPoints: points,
  cardType: 'story',
  blockerCardIds: blockers,
});

describe('computeSprintProposal', () => {
  it('packs greedily up to targetPoints', () => {
    const r = computeSprintProposal([C(1, 5), C(2, 3), C(3, 8), C(4, 2)], { targetPoints: 10 });
    // 5 + 3 = 8 ≤ 10; 8 (third) skipped because 8+8>10; 2 fits 8+2=10.
    expect(r.recommended.map(c => c.id)).toEqual([1, 2, 4]);
    expect(r.skipped.map(c => c.id)).toEqual([3]);
    expect(r.totalPoints).toBe(10);
    expect(r.utilization).toBe(1);
  });

  it('routes unsized cards into the unsized bucket and warns', () => {
    const r = computeSprintProposal([C(1, null), C(2, 5)], { targetPoints: 10 });
    expect(r.unsized.map(c => c.id)).toEqual([1]);
    expect(r.recommended.map(c => c.id)).toEqual([2]);
    expect(r.warnings.some(w => w.includes('unsized'))).toBe(true);
  });

  it('routes blocked cards into the blocked bucket and warns', () => {
    const r = computeSprintProposal([C(1, 5, [99]), C(2, 3)], { targetPoints: 10 });
    expect(r.blocked.map(c => c.id)).toEqual([1]);
    expect(r.recommended.map(c => c.id)).toEqual([2]);
    expect(r.warnings.some(w => w.includes('blocked'))).toBe(true);
  });

  it('respects requireCardIds — pinned cards bypass capacity and blocker gates', () => {
    const r = computeSprintProposal(
      [C(1, 5, [99]), C(2, 8), C(3, 8)],
      { targetPoints: 10, requireCardIds: [1] },
    );
    expect(r.recommended.map(c => c.id)).toContain(1); // included despite blocker
    expect(r.totalPoints).toBeGreaterThanOrEqual(5);
  });

  it('defaults target to ceil(velocity × 1.1) when targetPoints not given', () => {
    const r = computeSprintProposal([C(1, 5), C(2, 5), C(3, 5)], { velocityBaseline: 12 });
    // ceil(12 * 1.1) = 14 → recommends 5 + 5 = 10, skips 3rd (would be 15)
    expect(r.targetPoints).toBe(14);
    expect(r.recommended.length).toBe(2);
  });

  it('warns when target is more than 1.5× recent velocity', () => {
    const r = computeSprintProposal([C(1, 30)], { targetPoints: 30, velocityBaseline: 10 });
    expect(r.warnings.some(w => w.includes('more than 1.5×'))).toBe(true);
  });

  it('warns when nothing fits', () => {
    const r = computeSprintProposal([C(1, 100)], { targetPoints: 5 });
    expect(r.recommended).toEqual([]);
    expect(r.warnings.some(w => w.includes('No cards fit'))).toBe(true);
  });

  it('returns 0% utilization when target is zero', () => {
    const r = computeSprintProposal([C(1, 5)], { targetPoints: 0 });
    expect(r.utilization).toBe(0);
    expect(r.totalPoints).toBe(0);
  });
});
