import { describe, it, expect } from 'vitest';
import { cardChannel, cardTitle, channelChip } from '@/lib/publishing/channel-chip';

describe('PUX-176 channel chip', () => {
  it('maps artifact types to icon + label, with a readable fallback', () => {
    expect(channelChip('email_campaign')).toEqual({ icon: 'mail', label: 'Email' });
    expect(channelChip('website')).toEqual({ icon: 'description', label: 'Page' });
    expect(channelChip('some_new_kind')).toEqual({ icon: 'attachment', label: 'some new kind' });
  });
  it('one artifact → its channel, several → a count, none → null', () => {
    expect(cardChannel([{ artifactType: 'post' }])?.label).toBe('Post');
    expect(cardChannel([{ artifactType: 'post' }, { artifactType: 'email_campaign' }])).toEqual({ icon: 'layers', label: '2 artifacts' });
    expect(cardChannel([])).toBeNull();
  });
  it('legacy title splice is byte-identical to the old inline code', () => {
    expect(cardTitle('Fall trips', [{ artifactType: 'email_campaign' }], 'Fall trips are open')).toBe('{Fall trips are open} [email campaign] Fall trips');
    expect(cardTitle('Recap', [{ artifactType: 'post' }, { artifactType: 'website' }], null)).toBe('[2 artifacts] Recap');
    expect(cardTitle('Idea', [], null)).toBe('Idea');
  });
});
