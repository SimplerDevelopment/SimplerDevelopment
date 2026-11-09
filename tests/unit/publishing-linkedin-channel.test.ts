import { describe, expect, it } from 'vitest';
import { LINKEDIN_ARTIFACT_TYPE, LINKEDIN_STAGE_TO_POST_STATUS } from '@/lib/publishing/channels/linkedin';

describe('linkedin channel adapter', () => {
  it('usa el artifact type reservado linkedin_draft', () => {
    expect(LINKEDIN_ARTIFACT_TYPE).toBe('linkedin_draft');
  });

  it('mapea stages a draft/scheduled y deja published/archived hands-off', () => {
    expect(LINKEDIN_STAGE_TO_POST_STATUS.idea).toBe('draft');
    expect(LINKEDIN_STAGE_TO_POST_STATUS.draft).toBe('draft');
    expect(LINKEDIN_STAGE_TO_POST_STATUS.in_review).toBe('draft');
    expect(LINKEDIN_STAGE_TO_POST_STATUS.scheduled).toBe('scheduled');
    expect(LINKEDIN_STAGE_TO_POST_STATUS.published).toBeUndefined();
    expect(LINKEDIN_STAGE_TO_POST_STATUS.archived).toBeUndefined();
  });
});
