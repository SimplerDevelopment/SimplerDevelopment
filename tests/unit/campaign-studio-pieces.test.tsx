// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('@/components/email/EmailPreviewPane', () => ({ EmailPreviewPane: ({ blocks }: { blocks: unknown[] }) => <div data-testid="preview-pane">{blocks.length} blocks</div> }));
vi.mock('@/lib/security/sanitize-html', () => ({ sanitizeRichHtml: (h: string) => h }));
import CampaignScheduleAction from '@/app/portal/email/campaigns/[id]/_components/CampaignScheduleAction';
import CampaignSettingsPreview from '@/app/portal/email/campaigns/[id]/_components/CampaignSettingsPreview';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PUX-175 campaign studio pieces', () => {
  it('Schedule: PATCHes scheduledAt and reports the status flip; Unschedule PATCHes null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const onScheduled = vi.fn();
    const { rerender } = render(<CampaignScheduleAction campaignId="7" scheduledAt={null} onScheduled={onScheduled} />);
    const btn = screen.getByRole('button', { name: /Schedule/ });
    expect(btn.className).toContain('bg-primary');
    expect(btn).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Send time'), { target: { value: '2026-09-04T09:00' } });
    fireEvent.click(btn);
    await waitFor(() => expect(onScheduled).toHaveBeenCalledWith(expect.objectContaining({ status: 'scheduled' })));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/portal/email/campaigns/7');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).scheduledAt).toMatch(/2026-09-04T/);
    rerender(<CampaignScheduleAction campaignId="7" scheduledAt="2026-09-04T09:00:00Z" onScheduled={onScheduled} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unschedule' }));
    await waitFor(() => expect(onScheduled).toHaveBeenCalledWith({ scheduledAt: null, status: 'draft' }));
  });

  it('SettingsPreview: block campaigns use the preview pane, html campaigns render sanitized, settings rows + Edit content for drafts', () => {
    const base = { subject: 'Fall trips are open', previewText: 'Early pricing ends soon', listName: 'All subscribers', htmlContent: '<p>Hi</p>', status: 'draft' };
    const onEdit = vi.fn();
    const { container, rerender } = render(<CampaignSettingsPreview campaign={base} blocks={[{} as never, {} as never]} sendTime={<span>Thu 09:00</span>} onEdit={onEdit} />);
    expect(screen.getByTestId('preview-pane').textContent).toBe('2 blocks');
    expect(container.textContent).toContain('Fall trips are open');
    expect(container.textContent).toContain('Thu 09:00');
    fireEvent.click(screen.getByRole('button', { name: /Edit content/ }));
    expect(onEdit).toHaveBeenCalled();
    rerender(<CampaignSettingsPreview campaign={{ ...base, status: 'sent' }} blocks={null} sendTime="Sent" />);
    expect(container.querySelector('[data-testid="preview-pane"]')).toBeNull();
    expect(container.innerHTML).toContain('<p>Hi</p>');
    expect(screen.queryByRole('button', { name: /Edit content/ })).toBeNull();
  });
});
