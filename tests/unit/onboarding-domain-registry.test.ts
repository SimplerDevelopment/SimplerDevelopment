import { describe, it, expect, vi } from 'vitest';

// detections.ts touches @/lib/db at import; the registry-shape assertions only
// need the DETECTIONS key set, so stub the db client out.
vi.mock('@/lib/db', () => ({ db: {} }));

import { RICH_SEGMENTS, getSegmentForDomain, countableActions } from '@/lib/onboarding/module-segments';
import { DETECTIONS } from '@/lib/onboarding/detections';

describe('per-domain onboarding registry', () => {
  it('every rich segment starts with a pre-credited step (never renders 0%)', () => {
    for (const [key, segment] of Object.entries(RICH_SEGMENTS)) {
      expect(segment.actions.length, key).toBeGreaterThan(0);
      expect(segment.actions[0].preCredited, `${key} first action must be preCredited`).toBe(true);
    }
  });

  it('the generic fallback segment also starts pre-credited', () => {
    const fallback = getSegmentForDomain('some-future-domain', {
      name: 'Future',
      tagline: 'Later',
      navHrefs: ['/portal/dashboard'],
    });
    expect(fallback.actions[0].preCredited).toBe(true);
  });

  it('every detect key referenced by a segment has a detection implementation', () => {
    for (const segment of Object.values(RICH_SEGMENTS)) {
      for (const action of segment.actions) {
        if (action.detect) {
          expect(DETECTIONS[action.detect], `missing detection ${action.detect}`).toBeTypeOf('function');
        }
      }
    }
  });

  it('countableActions excludes pointer rows but keeps pre-credited + detected steps', () => {
    const projects = RICH_SEGMENTS.projects;
    const counted = countableActions(projects);
    expect(counted.map((a) => a.key)).toEqual(['enabled', 'create-project']);
    // Progress can never be 0/N: the pre-credited step is always done.
    expect(counted[0].preCredited).toBe(true);
  });
});
