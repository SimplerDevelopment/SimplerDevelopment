// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/brain/decisions/[id]/page.tsx`
 *
 * 'use client' page — rendered directly with @testing-library/react.
 * Params are read via useParams() from next/navigation (mocked below).
 *
 * Covers:
 *  - Loading state (spinner, progress_activity icon)
 *  - Error state (API !ok, success=false, network throw, invalid id)
 *  - Error state back-link present
 *  - Loaded state: title, status chip, reversibility chip, date, decision maker
 *  - Status chip variants: accepted, proposed, superseded, rejected
 *  - Reversibility variants: one_way, two_way
 *  - Confidentiality level chip: standard (hidden), restricted, confidential
 *  - Context section: absent when null, present when provided, collapsible
 *  - Decision section rendered
 *  - Rationale section rendered
 *  - Alternatives considered: absent when null, present when provided
 *  - Topics chips: absent when empty, rendered when present
 *  - Anchors row: meeting, note, company, deal links
 *  - Action buttons: Edit, Supersede (accepted only), Reject (non-rejected only)
 *  - Reject confirm dialog: open, cancel, confirm text, error, navigate on success
 *  - Reject confirm: no-op when cancelled
 *  - Edit mode: shows DecisionForm stub, cancel discards
 *  - Edit submit: PATCH called, topics diff, reload after success
 *  - Edit submit error: error banner shown
 *  - Decision maker name: from team list, email fallback, User#N fallback, unspecified
 *  - Team fetch: called on mount, silently ignored on failure
 *  - Topics soft-fail: page loads even when topics API fails
 *  - Supersede button navigates to new decision page with supersedes param
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ──────────────────────────────────────

const pushMock = vi.fn();
let mockParamsId = '42';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({ id: mockParamsId }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Capture onSubmit from DecisionForm so tests can invoke it
let capturedDecisionFormSubmit: ((payload: any) => Promise<void>) | null = null;

vi.mock('@/components/brain/DecisionForm', () => ({
  default: (props: {
    mode: string;
    initial?: any;
    onSubmit: (payload: any) => Promise<void>;
    submitting?: boolean;
    submitError?: string | null;
    cancelHref?: string;
    submitLabel?: string;
  }) => {
    capturedDecisionFormSubmit = props.onSubmit;
    return React.createElement(
      'div',
      { 'data-testid': 'decision-form', 'data-mode': props.mode },
      props.submitError
        ? React.createElement('span', { 'data-testid': 'form-submit-error' }, props.submitError)
        : null,
      'DecisionForm',
    );
  },
}));

vi.mock('@/components/brain/DecisionSupersedeChain', () => ({
  default: ({ ancestors, descendants, current }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'supersede-chain', 'data-current': current?.id },
      `ancestors:${ancestors?.length ?? 0} descendants:${descendants?.length ?? 0}`,
    ),
}));

vi.mock('@/components/brain/TopicPicker', () => ({
  default: ({ selectedTopicIds, onChange, allowCreate, placeholder }: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'topic-picker',
        'data-selected': JSON.stringify(selectedTopicIds),
        'data-allow-create': String(allowCreate ?? false),
      },
      React.createElement('button', {
        type: 'button',
        'data-testid': 'topic-picker-add',
        onClick: () => onChange([...(selectedTopicIds ?? []), 99]),
      }, 'AddTopic'),
      placeholder,
    ),
}));

vi.mock('@/components/brain/DecisionCard', () => ({
  relativeDate: (dateStr: string) => `~${dateStr}`,
}));

// ─── Fetch mock helpers ────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status?: number; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

function makeRes(body: any, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

// ─── Data factories ────────────────────────────────────────────────────────

function makeDecision(extra: Record<string, any> = {}): any {
  return {
    id: 42,
    title: 'Use PostgreSQL as primary database',
    context: null,
    decision: 'We will use PostgreSQL for all data storage.',
    rationale: 'Proven reliability and rich ecosystem.',
    alternativesConsidered: null,
    reversibility: 'two_way' as const,
    status: 'accepted' as const,
    decisionMakerId: null,
    decidedAt: '2025-01-15T00:00:00Z',
    supersededByDecisionId: null,
    meetingId: null,
    noteId: null,
    companyId: null,
    dealId: null,
    confidentialityLevel: 'standard' as const,
    source: 'manual',
    ...extra,
  };
}

function makeDetailResponse(extra: Record<string, any> = {}): any {
  return {
    success: true,
    data: {
      decision: makeDecision(extra),
      ancestors: [],
      descendants: [],
    },
  };
}

function makeTopicsResponse(topicIds: number[] = [], topics: any[] = []): any {
  return {
    success: true,
    data: { topicIds, topics },
  };
}

// ─── Default fetch handler ─────────────────────────────────────────────────

function defaultFetch(url: string, init?: any): FetchResp {
  const method = init?.method;
  if (url.includes('/api/portal/team')) {
    return makeRes({ success: true, data: [] });
  }
  if (url.includes('/api/portal/brain/topics/for-entity')) {
    return makeRes(makeTopicsResponse());
  }
  if (/\/api\/portal\/brain\/decisions\/\d+$/.test(url) && !method) {
    return makeRes(makeDetailResponse());
  }
  if (/\/api\/portal\/brain\/decisions\/\d+$/.test(url) && method === 'PATCH') {
    return makeRes({ success: true });
  }
  if (/\/api\/portal\/brain\/decisions\/\d+$/.test(url) && method === 'DELETE') {
    return makeRes({ success: true });
  }
  return makeRes({ success: true });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  mockParamsId = '42';
  capturedDecisionFormSubmit = null;
  pushMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: any) => defaultFetch(url, init));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────

import DecisionDetailPage from '@/app/portal/brain/decisions/[id]/page';

function renderPage(id = '42') {
  mockParamsId = id;
  return render(React.createElement(DecisionDetailPage));
}

// ─── Loading state ────────────────────────────────────────────────────────

describe('DecisionDetailPage — loading', () => {
  it('shows loading text while fetch is pending', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });

  it('shows progress_activity icon in loading state', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('progress_activity');
  });
});

// ─── Error state ──────────────────────────────────────────────────────────

describe('DecisionDetailPage — error state', () => {
  it('shows error when API returns !ok with message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes({ success: false, message: 'Decision not found' }, false, 404);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Decision not found');
    });
  });

  it('shows HTTP status fallback when no message in response', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes({ success: false }, false, 500);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('HTTP 500');
    });
  });

  it('shows error when success=false even though ok=true', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes({ success: false, message: 'DB error' }, true);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('DB error');
    });
  });

  it('shows network error message when fetch throws an Error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      throw new Error('Connection refused');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connection refused');
    });
  });

  it('shows "Network error" for non-Error throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      throw 'plain string error';
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('shows "Invalid decision id" for non-numeric id', async () => {
    const { container } = renderPage('notanid');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid decision id');
    });
  });

  it('renders "Back to decisions" link in error state', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes({ success: false, message: 'gone' }, false);
    });
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/decisions"]');
      expect(link).toBeTruthy();
    });
  });

  it('shows error_outline icon in error state', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes({ success: false, message: 'oops' }, false);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('error_outline');
    });
  });
});

// ─── Loaded state — decision fields ──────────────────────────────────────

describe('DecisionDetailPage — loaded state (decision fields)', () => {
  it('renders the decision title', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Use PostgreSQL as primary database');
    });
  });

  it('renders the decision text', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('We will use PostgreSQL for all data storage.');
    });
  });

  it('renders the rationale text', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Proven reliability and rich ecosystem.');
    });
  });

  it('renders the back "Decisions" breadcrumb link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/decisions"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders gavel icon in the title', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('gavel');
    });
  });

  it('renders the supersede chain component', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="supersede-chain"]')).toBeTruthy();
    });
  });
});

// ─── Status chip variants ─────────────────────────────────────────────────

describe('DecisionDetailPage — status chip variants', () => {
  const statusVariants: Array<[string, string]> = [
    ['accepted', 'Accepted'],
    ['proposed', 'Proposed'],
    ['superseded', 'Superseded'],
    ['rejected', 'Rejected'],
  ];

  statusVariants.forEach(([status, label]) => {
    it(`renders "${label}" status chip for status="${status}"`, async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
        if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
        return makeRes(makeDetailResponse({ status }));
      });
      const { container } = renderPage();
      await waitFor(() => {
        expect(container.textContent).toContain(label);
      });
    });
  });
});

// ─── Reversibility chip ───────────────────────────────────────────────────

describe('DecisionDetailPage — reversibility chip', () => {
  it('renders "One-way door" for one_way reversibility', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ reversibility: 'one_way' }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('One-way door');
    });
  });

  it('renders "Two-way door" for two_way reversibility', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Two-way door');
    });
  });

  it('renders arrow_forward icon for one_way', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ reversibility: 'one_way' }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('arrow_forward');
    });
  });

  it('renders sync_alt icon for two_way', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('sync_alt');
    });
  });
});

// ─── Confidentiality chip ─────────────────────────────────────────────────

describe('DecisionDetailPage — confidentiality chip', () => {
  it('does NOT render confidentiality chip for "standard"', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    expect(container.textContent).not.toContain('confidential');
    expect(container.textContent).not.toContain('restricted');
  });

  it('renders confidentiality chip for "restricted"', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ confidentialityLevel: 'restricted' }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('restricted');
    });
  });

  it('renders confidentiality chip for "confidential"', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ confidentialityLevel: 'confidential' }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('confidential');
    });
  });
});

// ─── Context section ──────────────────────────────────────────────────────

describe('DecisionDetailPage — context section', () => {
  it('does NOT render context section when context is null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    // The "Context" label inside the Section header should not appear
    // (rationale is always shown; context is conditional)
    const contextSection = Array.from(container.querySelectorAll('section')).find(
      (s) => s.textContent?.includes('Context') && !s.textContent?.includes('Decision'),
    );
    expect(contextSection).toBeFalsy();
  });

  it('renders context section when context is present', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ context: 'We need a stable DB solution.' }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('We need a stable DB solution.');
    });
  });

  it('renders collapsible show/hide toggle for long context', async () => {
    const longContext = 'X'.repeat(500);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ context: longContext }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const showBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Show'),
      );
      expect(showBtn).toBeTruthy();
    });
  });

  it('expands collapsed context when Show toggle is clicked', async () => {
    const longContext = 'Y'.repeat(500);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ context: longContext }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Show'),
      )).toBe(true);
    });
    const showBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Show'),
    ) as HTMLButtonElement;
    fireEvent.click(showBtn);
    await waitFor(() => {
      expect(container.textContent).toContain(longContext);
    });
  });
});

// ─── Alternatives considered section ─────────────────────────────────────

describe('DecisionDetailPage — alternatives considered', () => {
  it('does NOT render alternatives section when null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    expect(container.textContent).not.toContain('Alternatives considered');
  });

  it('renders alternatives section when provided', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ alternativesConsidered: 'MySQL, SQLite, MongoDB' }));
    });
    const { container } = renderPage();
    // Section header is always shown; content is collapsed by default when alternatives are present.
    await waitFor(() => {
      expect(container.textContent).toContain('Alternatives considered');
    });
    // Expand the section to reveal the content.
    const showBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Show'),
    ) as HTMLButtonElement;
    if (showBtn) fireEvent.click(showBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('MySQL, SQLite, MongoDB');
    });
  });
});

// ─── Topics chips ─────────────────────────────────────────────────────────

describe('DecisionDetailPage — topics chips', () => {
  it('does NOT render topics chips when topics list is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    // No topic chip icons (sell) in the main detail view when no topics
    const topicsSection = Array.from(container.querySelectorAll('[title]')).find(
      (el) => el.getAttribute('title')?.includes('/'),
    );
    expect(topicsSection).toBeFalsy();
  });

  it('renders topic chips when topics are returned', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) {
        return makeRes(makeTopicsResponse(
          [1, 2],
          [
            { id: 1, name: 'Architecture', path: 'Tech/Architecture', icon: 'layers', color: null },
            { id: 2, name: 'Backend', path: 'Tech/Backend', icon: null, color: '#ff5500' },
          ],
        ));
      }
      return makeRes(makeDetailResponse());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Architecture');
      expect(container.textContent).toContain('Backend');
    });
  });

  it('shows topics "sell" label before chips', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) {
        return makeRes(makeTopicsResponse(
          [1],
          [{ id: 1, name: 'MyTopic', path: 'MyTopic', icon: 'label', color: null }],
        ));
      }
      return makeRes(makeDetailResponse());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Topics:');
    });
  });
});

// ─── Anchors row ──────────────────────────────────────────────────────────

describe('DecisionDetailPage — anchors row', () => {
  it('does NOT render anchors section when all anchor IDs are null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    expect(container.textContent).not.toContain('Anchors');
  });

  it('renders meeting anchor (no link)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ meetingId: 10 }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Meeting #10');
    });
  });

  it('renders note anchor with correct link', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ noteId: 7 }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/knowledge?id=7"]');
      expect(link).toBeTruthy();
      expect(container.textContent).toContain('Note #7');
    });
  });

  it('renders company anchor with correct link', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ companyId: 3 }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/crm/companies/3"]');
      expect(link).toBeTruthy();
      expect(container.textContent).toContain('Company #3');
    });
  });

  it('renders deal anchor with correct link', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ dealId: 5 }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/crm/deals/5"]');
      expect(link).toBeTruthy();
      expect(container.textContent).toContain('Deal #5');
    });
  });
});

// ─── Action buttons ───────────────────────────────────────────────────────

describe('DecisionDetailPage — action buttons', () => {
  it('renders Edit button in loaded state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Edit'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('renders Supersede button when status is "accepted"', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Supersede'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('does NOT render Supersede button when status is not "accepted"', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ status: 'proposed' }));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Supersede'),
    );
    expect(btn).toBeFalsy();
  });

  it('renders Reject button when status is not "rejected"', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Reject'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('does NOT render Reject button when status is "rejected"', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ status: 'rejected' }));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rejected'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Reject'),
    );
    expect(btn).toBeFalsy();
  });

  it('Supersede button navigates to new decision with supersedes param', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Supersede'),
      );
      expect(btn).toBeTruthy();
    });
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Supersede'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/decisions/new?supersedes=42');
  });
});

// ─── Reject confirm dialog ────────────────────────────────────────────────

describe('DecisionDetailPage — reject confirm dialog', () => {
  async function openRejectDialog(container: HTMLElement) {
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Reject'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('Reject this decision?');
    });
  }

  it('opens reject dialog when Reject is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    await openRejectDialog(container);
    expect(container.textContent).toContain('Reject this decision?');
  });

  it('closes reject dialog when Cancel is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    await openRejectDialog(container);
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Reject this decision?');
    });
  });

  it('renders reason input in reject dialog', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    await openRejectDialog(container);
    const input = container.querySelector('input[placeholder="Reason (optional)"]');
    expect(input).toBeTruthy();
  });

  it('calls DELETE and navigates to list on confirm reject', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    await openRejectDialog(container);
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Confirm reject'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(confirmBtn); });
    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(
        (c) => (c[1] as any)?.method === 'DELETE',
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
      expect(pushMock).toHaveBeenCalledWith('/portal/brain/decisions');
    });
  });

  it('sends reason in DELETE body when reason is typed', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    await openRejectDialog(container);
    const input = container.querySelector('input[placeholder="Reason (optional)"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'No longer needed' } });
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Confirm reject'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(confirmBtn); });
    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        (c) => (c[1] as any)?.method === 'DELETE',
      );
      expect(deleteCall).toBeTruthy();
      const body = JSON.parse((deleteCall![1] as any).body);
      expect(body.reason).toBe('No longer needed');
    });
  });

  it('shows error banner when DELETE returns failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      if (init?.method === 'DELETE') {
        return makeRes({ success: false, message: 'Cannot reject' }, false);
      }
      return makeRes(makeDetailResponse());
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    await openRejectDialog(container);
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Confirm reject'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(confirmBtn); });
    await waitFor(() => {
      expect(container.textContent).toContain('Cannot reject');
    });
  });

  it('shows network error when DELETE throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      if (init?.method === 'DELETE') throw new Error('network down');
      return makeRes(makeDetailResponse());
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    await openRejectDialog(container);
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Confirm reject'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(confirmBtn); });
    await waitFor(() => {
      expect(container.textContent).toContain('network down');
    });
  });
});

// ─── Edit mode ────────────────────────────────────────────────────────────

describe('DecisionDetailPage — edit mode', () => {
  it('shows DecisionForm when Edit is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Edit'),
    ) as HTMLButtonElement;
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-form"]')).toBeTruthy();
    });
  });

  it('shows "Edit decision" heading in edit mode', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Edit'),
    ) as HTMLButtonElement;
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Edit decision');
    });
  });

  it('shows TopicPicker in edit mode', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Edit'),
    ) as HTMLButtonElement;
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="topic-picker"]')).toBeTruthy();
    });
  });

  it('exits edit mode and hides form when "Cancel edit" is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Edit'),
    ) as HTMLButtonElement;
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-form"]')).toBeTruthy();
    });
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel edit'),
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-form"]')).toBeNull();
      expect(container.textContent).toContain('Use PostgreSQL');
    });
  });

  it('supersede link in edit mode navigates correctly', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Edit'),
    ) as HTMLButtonElement;
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('supersede this decision');
    });
    const supersedeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('supersede this decision'),
    ) as HTMLButtonElement;
    fireEvent.click(supersedeBtn);
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/decisions/new?supersedes=42');
  });
});

// ─── Edit submit ──────────────────────────────────────────────────────────

describe('DecisionDetailPage — edit submit', () => {
  async function openEditMode(container: HTMLElement) {
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Edit') && !b.textContent?.includes('Edit decision'),
    ) as HTMLButtonElement;
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-form"]')).toBeTruthy();
    });
  }

  const samplePayload = {
    title: 'Updated title',
    context: 'New context',
    decisionMakerId: null,
    anchors: {},
    confidentialityLevel: 'standard',
    alternativesConsidered: null,
    decision: 'Same decision',
    rationale: 'Same rationale',
    reversibility: 'two_way',
    decidedAt: '2025-01-15',
  };

  it('calls PATCH endpoint when edit form is submitted', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    await openEditMode(container);
    await act(async () => { await capturedDecisionFormSubmit!(samplePayload); });
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) => /\/decisions\/42$/.test(String(c[0])) && (c[1] as any)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('reloads data after successful PATCH', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    await openEditMode(container);
    const getsBefore = fetchMock.mock.calls.filter(
      (c) => /\/decisions\/42$/.test(String(c[0])) && !(c[1] as any)?.method,
    ).length;
    await act(async () => { await capturedDecisionFormSubmit!(samplePayload); });
    await waitFor(() => {
      const getsAfter = fetchMock.mock.calls.filter(
        (c) => /\/decisions\/42$/.test(String(c[0])) && !(c[1] as any)?.method,
      ).length;
      expect(getsAfter).toBeGreaterThan(getsBefore);
    });
  });

  it('exits edit mode after successful PATCH', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    await openEditMode(container);
    await act(async () => { await capturedDecisionFormSubmit!(samplePayload); });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-form"]')).toBeNull();
    });
  });

  it('shows error when PATCH returns failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      if (init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'Save failed' }, false);
      }
      return makeRes(makeDetailResponse());
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    await openEditMode(container);
    await act(async () => { await capturedDecisionFormSubmit!(samplePayload); });
    await waitFor(() => {
      expect(container.textContent).toContain('Save failed');
    });
  });

  it('attaches new topics via POST when topicIdsDraft has additions', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse([1], [
        { id: 1, name: 'Existing', path: 'Existing', icon: null, color: null },
      ]));
      if (url.includes('/topics/attach') && init?.method === 'POST') return makeRes({ success: true });
      if (url.includes('/topics/attach') && init?.method === 'DELETE') return makeRes({ success: true });
      if (init?.method === 'PATCH') return makeRes({ success: true });
      return makeRes(makeDetailResponse());
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    await openEditMode(container);
    // Click the topic picker add button to add topic id=99
    const addTopicBtn = container.querySelector('[data-testid="topic-picker-add"]') as HTMLButtonElement;
    fireEvent.click(addTopicBtn);
    await act(async () => { await capturedDecisionFormSubmit!(samplePayload); });
    await waitFor(() => {
      const attachCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/topics/attach') && (c[1] as any)?.method === 'POST',
      );
      expect(attachCalls.length).toBeGreaterThan(0);
    });
  });
});

// ─── Decision maker display ───────────────────────────────────────────────

describe('DecisionDetailPage — decision maker display', () => {
  it('shows "Unspecified" when decisionMakerId is null', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Unspecified');
    });
  });

  it('shows team member name when decisionMakerId matches', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [{ userId: 5, name: 'Alice Smith', email: 'alice@example.com' }],
        });
      }
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ decisionMakerId: 5 }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice Smith');
    });
  });

  it('shows email fallback when team member name is null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [{ userId: 5, name: null, email: 'alice@example.com' }],
        });
      }
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ decisionMakerId: 5 }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('alice@example.com');
    });
  });

  it('shows "User #N" when decisionMakerId not found in team', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes(makeTopicsResponse());
      return makeRes(makeDetailResponse({ decisionMakerId: 99 }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('User #99');
    });
  });
});

// ─── Team fetch ───────────────────────────────────────────────────────────

describe('DecisionDetailPage — team fetch', () => {
  it('fetches /api/portal/team on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/team'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('silently ignores team fetch failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) throw new Error('team down');
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Use PostgreSQL');
    });
  });

  it('filters out team members without a positive userId', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [
            { userId: 1, name: 'Bob', email: 'bob@example.com' },
            { name: 'No ID', email: 'noid@example.com' },
          ],
        });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Use PostgreSQL');
    });
  });
});

// ─── Topics soft-fail ─────────────────────────────────────────────────────

describe('DecisionDetailPage — topics soft-fail', () => {
  it('page loads successfully even when topics API returns !ok', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) return makeRes({ success: false }, false);
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Use PostgreSQL');
    });
  });

  it('page loads successfully even when topics API throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/for-entity')) {
        // Simulate json() throwing
        return { ok: true, status: 200, json: async () => { throw new Error('bad json'); } };
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Use PostgreSQL');
    });
  });
});
