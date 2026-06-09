// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for EmailAbConfig component.
 *
 * Covers:
 *  - Collapsed panel renders header correctly
 *  - Expand/collapse toggle button
 *  - Status badge: "Enabled", "Testing", "Promoted" variants
 *  - Draft mode: enable/disable checkbox triggers PATCH
 *  - Draft + enabled: Subject B input renders and blurs trigger PATCH
 *  - Draft + enabled: winner metric buttons (open/click) trigger PATCH
 *  - Draft + enabled: test size slider renders and mouseUp triggers PATCH
 *  - Draft + enabled: test size description updates with pct value
 *  - Not-draft + enabled: shows "in progress" / "promoted" text with subject lines
 *  - Status panel shown when !isDraft + enabled + status loaded (fetch)
 *  - promoteWinner: confirm → POST to promote-winner endpoint → calls onChange
 *  - promoteWinner: cancel confirm → no fetch
 *  - Force-promote button (visible when !status.ready)
 *  - Decided state shows winner subject
 *  - Error state shown after PATCH failure
 *  - saving disables checkbox
 *  - disabled promote button when !status.ready
 *  - onChange callback called with correct patch on successful PATCH
 *  - useEffect re-syncs local state when campaign props change
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';

// ─── Global fetch mock ────────────────────────────────────────────────────────

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

// ─── window.confirm mock ──────────────────────────────────────────────────────

const confirmMock = vi.fn(() => true);
global.confirm = confirmMock;

// ─── Import component under test AFTER mocks ─────────────────────────────────

import { EmailAbConfig } from '@/app/portal/email/campaigns/[id]/_components/EmailAbConfig';

// ─── Types (mirror what the component expects) ────────────────────────────────

interface CampaignAbView {
  id: number;
  status: string;
  subject: string;
  abEnabled?: boolean;
  abSubjectB?: string | null;
  abWinnerMetric?: 'open' | 'click' | null;
  abTestSizePct?: number | null;
  abWinnerSubject?: string | null;
  abDecidedAt?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCampaign(overrides: Partial<CampaignAbView> = {}): CampaignAbView {
  return {
    id: 99,
    status: 'draft',
    subject: 'Subject A',
    abEnabled: false,
    abSubjectB: null,
    abWinnerMetric: null,
    abTestSizePct: null,
    abWinnerSubject: null,
    abDecidedAt: null,
    ...overrides,
  };
}

function successFetch(data: Record<string, unknown> = {}) {
  return Promise.resolve({
    json: () => Promise.resolve({ success: true, data, ...data }),
  } as Response);
}

function failFetch(message = 'Save failed') {
  return Promise.resolve({
    json: () => Promise.resolve({ success: false, message }),
  } as Response);
}

function renderAb(campaign: CampaignAbView, onChange = vi.fn()) {
  return { onChange, ...render(<EmailAbConfig campaign={campaign} onChange={onChange} />) };
}

beforeEach(() => {
  vi.clearAllMocks();
  confirmMock.mockReturnValue(true);
  // Default: GET promote-winner returns empty (component ignores error gracefully)
  fetchMock.mockResolvedValue({
    json: () => Promise.resolve({ success: false }),
  } as Response);
});

afterEach(() => {
  cleanup();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EmailAbConfig — header rendering', () => {
  it('renders header label', () => {
    renderAb(makeCampaign());
    expect(screen.getByText('A/B test subject lines')).toBeTruthy();
  });

  it('does not show status badge when ab is not enabled', () => {
    renderAb(makeCampaign({ abEnabled: false }));
    expect(screen.queryByText('Enabled')).toBeNull();
    expect(screen.queryByText('Testing')).toBeNull();
    expect(screen.queryByText('Promoted')).toBeNull();
  });

  it('shows "Enabled" badge when abEnabled and not testing or decided', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'draft', abDecidedAt: null }));
    expect(screen.getByText('Enabled')).toBeTruthy();
  });

  it('shows "Testing" badge when status is ab_testing', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'ab_testing', abDecidedAt: null }));
    expect(screen.getByText('Testing')).toBeTruthy();
  });

  it('shows "Promoted" badge when abDecidedAt is set', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'sent', abDecidedAt: '2024-06-01T12:00:00Z' }));
    expect(screen.getByText('Promoted')).toBeTruthy();
  });
});

describe('EmailAbConfig — expand/collapse', () => {
  it('panel is initially closed when abEnabled is false', () => {
    renderAb(makeCampaign({ abEnabled: false }));
    // The draft toggle checkbox should NOT be visible (panel closed)
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('panel is initially open when abEnabled is true', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'draft' }));
    // The draft toggle checkbox IS visible
    expect(screen.getByRole('checkbox')).toBeTruthy();
  });

  it('clicking header button toggles panel open', () => {
    renderAb(makeCampaign({ abEnabled: false }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByText('A/B test subject lines').closest('button')!);
    expect(screen.getByRole('checkbox')).toBeTruthy();
  });

  it('clicking header button again closes panel', () => {
    renderAb(makeCampaign({ abEnabled: false }));
    const btn = screen.getByText('A/B test subject lines').closest('button')!;
    fireEvent.click(btn);
    expect(screen.getByRole('checkbox')).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('EmailAbConfig — draft mode: enable/disable checkbox', () => {
  it('checkbox is unchecked when abEnabled=false', () => {
    renderAb(makeCampaign({ abEnabled: false }));
    fireEvent.click(screen.getByText('A/B test subject lines').closest('button')!);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('checkbox is checked when abEnabled=true', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'draft' }));
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('checking the checkbox sends PATCH with abEnabled:true and calls onChange', async () => {
    fetchMock.mockResolvedValueOnce(successFetch());
    const { onChange } = renderAb(makeCampaign({ abEnabled: false }));
    fireEvent.click(screen.getByText('A/B test subject lines').closest('button')!);
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox'));
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/portal/email/campaigns/99',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ abEnabled: true }));
  });

  it('unchecking the checkbox sends PATCH with abEnabled:false', async () => {
    fetchMock.mockResolvedValueOnce(successFetch());
    const { onChange } = renderAb(makeCampaign({ abEnabled: true, status: 'draft' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox'));
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ abEnabled: false }));
    });
  });

  it('shows error when PATCH returns failure', async () => {
    fetchMock.mockResolvedValueOnce(failFetch('Server error'));
    renderAb(makeCampaign({ abEnabled: false }));
    fireEvent.click(screen.getByText('A/B test subject lines').closest('button')!);
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox'));
    });
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeTruthy();
    });
  });

  it('shows generic error when PATCH returns no message', async () => {
    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false }),
    } as Response);
    renderAb(makeCampaign({ abEnabled: false }));
    fireEvent.click(screen.getByText('A/B test subject lines').closest('button')!);
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox'));
    });
    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeTruthy();
    });
  });

  it('shows error on network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));
    renderAb(makeCampaign({ abEnabled: false }));
    fireEvent.click(screen.getByText('A/B test subject lines').closest('button')!);
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox'));
    });
    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeTruthy();
    });
  });
});

describe('EmailAbConfig — draft + enabled: Subject B input', () => {
  function renderDraftEnabled(abSubjectB = '') {
    return renderAb(makeCampaign({ abEnabled: true, status: 'draft', abSubjectB }));
  }

  it('renders Subject B input', () => {
    renderDraftEnabled();
    expect(screen.getByPlaceholderText('Alternate subject line to test')).toBeTruthy();
  });

  it('shows existing Subject B value', () => {
    renderDraftEnabled('Variant B subject');
    const input = screen.getByPlaceholderText('Alternate subject line to test') as HTMLInputElement;
    expect(input.value).toBe('Variant B subject');
  });

  it('typing updates local state but does not call fetch mid-type', () => {
    renderDraftEnabled();
    const input = screen.getByPlaceholderText('Alternate subject line to test');
    fireEvent.change(input, { target: { value: 'New subject B' } });
    // fetch should NOT have been called during typing (only on blur)
    // Note: fetch may have been called for the status GET on mount — check PATCH only
    const patchCalls = fetchMock.mock.calls.filter(
      c => c[1]?.method === 'PATCH',
    );
    expect(patchCalls).toHaveLength(0);
  });

  it('blurring with changed value sends PATCH with abSubjectB', async () => {
    fetchMock.mockResolvedValue(successFetch());
    const { onChange } = renderDraftEnabled('Original');
    const input = screen.getByPlaceholderText('Alternate subject line to test');
    fireEvent.change(input, { target: { value: 'Changed Subject B' } });
    await act(async () => {
      fireEvent.blur(input);
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ abSubjectB: 'Changed Subject B' });
    });
  });

  it('blurring without change does NOT send PATCH', async () => {
    renderDraftEnabled('Same subject');
    const input = screen.getByPlaceholderText('Alternate subject line to test');
    // Don't change value — just blur
    await act(async () => {
      fireEvent.blur(input);
    });
    const patchCalls = fetchMock.mock.calls.filter(c => c[1]?.method === 'PATCH');
    expect(patchCalls).toHaveLength(0);
  });

  it('shows Subject A info text from campaign.subject', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'draft', subject: 'My Subject A' }));
    const { container } = render(
      <EmailAbConfig campaign={makeCampaign({ abEnabled: true, status: 'draft', subject: 'My Subject A' })} onChange={vi.fn()} />,
    );
    expect(container.textContent).toContain('My Subject A');
  });
});

describe('EmailAbConfig — draft + enabled: winner metric', () => {
  it('renders Open rate and Click rate buttons', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'draft' }));
    expect(screen.getByText('Open rate')).toBeTruthy();
    expect(screen.getByText('Click rate')).toBeTruthy();
  });

  it('defaults to "open" metric', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'draft', abWinnerMetric: null }));
    // "Open rate" should have the primary styling (active)
    const openBtn = screen.getByText('Open rate');
    expect(openBtn.className).toContain('bg-primary');
  });

  it('clicking Click rate updates metric and sends PATCH', async () => {
    fetchMock.mockResolvedValue(successFetch());
    const { onChange } = renderAb(makeCampaign({ abEnabled: true, status: 'draft', abWinnerMetric: 'open' }));
    await act(async () => {
      fireEvent.click(screen.getByText('Click rate'));
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ abWinnerMetric: 'click' });
    });
  });

  it('clicking Open rate when metric is click updates and PATCHes', async () => {
    fetchMock.mockResolvedValue(successFetch());
    const { onChange } = renderAb(makeCampaign({ abEnabled: true, status: 'draft', abWinnerMetric: 'click' }));
    await act(async () => {
      fireEvent.click(screen.getByText('Open rate'));
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ abWinnerMetric: 'open' });
    });
  });
});

describe('EmailAbConfig — draft + enabled: test size slider', () => {
  it('renders test size slider', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'draft' }));
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(slider.min).toBe('5');
    expect(slider.max).toBe('50');
  });

  it('defaults to 10% when abTestSizePct is null', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'draft', abTestSizePct: null }));
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('10');
  });

  it('shows existing abTestSizePct value', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'draft', abTestSizePct: 30 }));
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('30');
  });

  it('renders test size description in label', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'draft', abTestSizePct: 20 }));
    expect(screen.getByText(/Test size: 20% of list/)).toBeTruthy();
  });

  it('mouseUp sends PATCH when value changed', async () => {
    fetchMock.mockResolvedValue(successFetch());
    const { onChange } = renderAb(makeCampaign({ abEnabled: true, status: 'draft', abTestSizePct: 10 }));
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '25' } });
    await act(async () => {
      fireEvent.mouseUp(slider);
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ abTestSizePct: 25 });
    });
  });

  it('mouseUp does NOT send PATCH when value unchanged', async () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'draft', abTestSizePct: 10 }));
    const slider = screen.getByRole('slider');
    // Do NOT change the slider value before mouseup
    await act(async () => {
      fireEvent.mouseUp(slider);
    });
    const patchCalls = fetchMock.mock.calls.filter(c => c[1]?.method === 'PATCH');
    expect(patchCalls).toHaveLength(0);
  });

  it('shows description with 4-hour winner info', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'draft', abTestSizePct: 20 }));
    const { container } = render(
      <EmailAbConfig campaign={makeCampaign({ abEnabled: true, status: 'draft', abTestSizePct: 20 })} onChange={vi.fn()} />,
    );
    expect(container.textContent).toContain('4-hour wait');
  });
});

describe('EmailAbConfig — not-draft + enabled', () => {
  it('shows "in progress" text when no abDecidedAt', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'ab_testing', abDecidedAt: null, abSubjectB: 'B Subject' }));
    const { container } = render(
      <EmailAbConfig campaign={makeCampaign({ abEnabled: true, status: 'ab_testing', abDecidedAt: null, subject: 'A Subject', abSubjectB: 'B Subject' })} onChange={vi.fn()} />,
    );
    expect(container.textContent).toContain('in progress');
    expect(container.textContent).toContain('A Subject');
    expect(container.textContent).toContain('B Subject');
  });

  it('shows "promoted" text when abDecidedAt is set', () => {
    const { container } = render(
      <EmailAbConfig
        campaign={makeCampaign({ abEnabled: true, status: 'sent', abDecidedAt: '2024-06-01T12:00:00Z', subject: 'A Subject', abSubjectB: 'B Subject' })}
        onChange={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('promoted');
  });

  it('does NOT show the edit fields (Subject B input) when not draft', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'ab_testing' }));
    expect(screen.queryByPlaceholderText('Alternate subject line to test')).toBeNull();
  });

  it('does NOT show the enable checkbox when not draft', () => {
    renderAb(makeCampaign({ abEnabled: true, status: 'ab_testing' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('EmailAbConfig — informational text (draft + disabled)', () => {
  it('shows hint text about how A/B testing works', () => {
    const { container } = renderAb(makeCampaign({ abEnabled: false }));
    fireEvent.click(screen.getByText('A/B test subject lines').closest('button')!);
    // The panel is now open and shows explanatory text
    expect(container.textContent).toContain('4 hours');
  });
});

describe('EmailAbConfig — status panel (non-draft, enabled, status loaded)', () => {
  const abStatus = {
    ready: true,
    decided: false,
    decidedAt: null,
    winnerSubject: null,
    counts: [
      { variant: 'a', sent: 50, opened: 20, clicked: 5 },
      { variant: 'b', sent: 50, opened: 25, clicked: 8 },
    ],
    projectedWinner: 'b',
    projectedReason: 'Higher open rate',
    metric: 'open',
  };

  it('renders test status table when status is loaded', async () => {
    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: abStatus }),
    } as Response);
    render(
      <EmailAbConfig
        campaign={makeCampaign({ abEnabled: true, status: 'ab_testing' })}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Test status')).toBeTruthy();
    });
    expect(screen.getByText('Variant')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByText('Opened')).toBeTruthy();
    expect(screen.getByText('Clicked')).toBeTruthy();
  });

  it('shows projected winner when not decided', async () => {
    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: abStatus }),
    } as Response);
    render(
      <EmailAbConfig
        campaign={makeCampaign({ abEnabled: true, status: 'ab_testing' })}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Projected winner/)).toBeTruthy();
    });
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText(/Higher open rate/)).toBeTruthy();
  });

  it('shows "Promote winner" button when status.ready=true', async () => {
    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: abStatus }),
    } as Response);
    render(
      <EmailAbConfig
        campaign={makeCampaign({ abEnabled: true, status: 'ab_testing' })}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Promote winner')).toBeTruthy();
    });
  });

  it('shows "Force-promote now" button when status.ready=false', async () => {
    const notReadyStatus = { ...abStatus, ready: false };
    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: notReadyStatus }),
    } as Response);
    render(
      <EmailAbConfig
        campaign={makeCampaign({ abEnabled: true, status: 'ab_testing' })}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Force-promote now')).toBeTruthy();
    });
  });

  it('does NOT show "Force-promote now" when status.ready=true', async () => {
    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: abStatus }),
    } as Response);
    render(
      <EmailAbConfig
        campaign={makeCampaign({ abEnabled: true, status: 'ab_testing' })}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Promote winner')).toBeTruthy();
    });
    expect(screen.queryByText('Force-promote now')).toBeNull();
  });

  it('shows decided state with winner subject', async () => {
    const decidedStatus = {
      ...abStatus,
      decided: true,
      decidedAt: '2024-06-01T14:00:00Z',
      winnerSubject: 'Winning Subject B',
    };
    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: decidedStatus }),
    } as Response);
    render(
      <EmailAbConfig
        campaign={makeCampaign({ abEnabled: true, status: 'sent', abDecidedAt: '2024-06-01T14:00:00Z' })}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Winning Subject B')).toBeTruthy();
    });
  });
});

describe('EmailAbConfig — promoteWinner', () => {
  const abStatus = {
    ready: true,
    decided: false,
    decidedAt: null,
    winnerSubject: null,
    counts: [
      { variant: 'a', sent: 50, opened: 20, clicked: 5 },
      { variant: 'b', sent: 50, opened: 25, clicked: 8 },
    ],
    projectedWinner: 'b' as const,
    projectedReason: 'Higher open rate',
    metric: 'open' as const,
  };

  it('calls POST to promote-winner on confirm', async () => {
    fetchMock
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: abStatus }) } as Response) // GET status
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { winnerSubject: 'B wins' } }) } as Response); // POST promote

    const onChange = vi.fn();
    render(
      <EmailAbConfig campaign={makeCampaign({ abEnabled: true, status: 'ab_testing' })} onChange={onChange} />,
    );
    await waitFor(() => screen.getByText('Promote winner'));
    await act(async () => {
      fireEvent.click(screen.getByText('Promote winner'));
    });
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(c => c[1]?.method === 'POST');
      expect(postCalls).toHaveLength(1);
      expect(postCalls[0][0]).toContain('promote-winner');
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', abWinnerSubject: 'B wins' }),
    );
  });

  it('does NOT POST when user cancels confirm', async () => {
    confirmMock.mockReturnValueOnce(false);
    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: abStatus }),
    } as Response);
    render(
      <EmailAbConfig campaign={makeCampaign({ abEnabled: true, status: 'ab_testing' })} onChange={vi.fn()} />,
    );
    await waitFor(() => screen.getByText('Promote winner'));
    await act(async () => {
      fireEvent.click(screen.getByText('Promote winner'));
    });
    const postCalls = fetchMock.mock.calls.filter(c => c[1]?.method === 'POST');
    expect(postCalls).toHaveLength(0);
  });

  it('shows error when POST to promote-winner fails', async () => {
    fetchMock
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: abStatus }) } as Response)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: false, message: 'Promotion failed' }) } as Response);

    render(
      <EmailAbConfig campaign={makeCampaign({ abEnabled: true, status: 'ab_testing' })} onChange={vi.fn()} />,
    );
    await waitFor(() => screen.getByText('Promote winner'));
    await act(async () => {
      fireEvent.click(screen.getByText('Promote winner'));
    });
    await waitFor(() => {
      expect(screen.getByText('Promotion failed')).toBeTruthy();
    });
  });

  it('POST force-promote uses ?force=1 query param', async () => {
    const notReadyStatus = { ...abStatus, ready: false };
    fetchMock
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: notReadyStatus }) } as Response)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { winnerSubject: 'Forced winner' } }) } as Response);

    render(
      <EmailAbConfig campaign={makeCampaign({ abEnabled: true, status: 'ab_testing' })} onChange={vi.fn()} />,
    );
    await waitFor(() => screen.getByText('Force-promote now'));
    await act(async () => {
      fireEvent.click(screen.getByText('Force-promote now'));
    });
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(c => c[1]?.method === 'POST');
      expect(postCalls).toHaveLength(1);
      expect(postCalls[0][0]).toContain('force=1');
    });
  });
});

describe('EmailAbConfig — prop sync via useEffect', () => {
  it('re-renders with updated abSubjectB when campaign prop changes', () => {
    const { rerender } = render(
      <EmailAbConfig
        campaign={makeCampaign({ abEnabled: true, status: 'draft', abSubjectB: 'Original B' })}
        onChange={vi.fn()}
      />,
    );
    let input = screen.getByPlaceholderText('Alternate subject line to test') as HTMLInputElement;
    expect(input.value).toBe('Original B');

    rerender(
      <EmailAbConfig
        campaign={makeCampaign({ abEnabled: true, status: 'draft', abSubjectB: 'Updated B' })}
        onChange={vi.fn()}
      />,
    );
    input = screen.getByPlaceholderText('Alternate subject line to test') as HTMLInputElement;
    expect(input.value).toBe('Updated B');
  });

  it('re-renders with updated metric when campaign prop changes', () => {
    const { rerender } = render(
      <EmailAbConfig
        campaign={makeCampaign({ abEnabled: true, status: 'draft', abWinnerMetric: 'open' })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Open rate').className).toContain('bg-primary');

    rerender(
      <EmailAbConfig
        campaign={makeCampaign({ abEnabled: true, status: 'draft', abWinnerMetric: 'click' })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Click rate').className).toContain('bg-primary');
  });
});
