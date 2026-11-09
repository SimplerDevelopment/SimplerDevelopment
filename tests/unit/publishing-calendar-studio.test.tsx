// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

import PublishingCalendar from '@/components/portal/publishing/PublishingCalendar';

describe('publishing calendar under the flag (PUX-206)', () => {
  it('draws the Tags filter as a disabled promise beside the two real filters', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) })) as any;
    render(<PublishingCalendar projectId={1} clientId={104} />);
    expect(await screen.findByLabelText('Channel filter')).toBeTruthy();
    const tags = screen.getByLabelText('Tags filter') as HTMLSelectElement;
    expect(tags.disabled).toBe(true);
    expect(tags.title).toContain('PUB-7');
    expect(screen.getByLabelText('Stage filter')).toBeTruthy();
  });
});
