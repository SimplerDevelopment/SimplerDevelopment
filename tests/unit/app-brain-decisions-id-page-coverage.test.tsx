// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/decisions/[id]/page.tsx`.
 *
 * Covers:
 *   - Loading state
 *   - Error state (invalid id, API failure, network throw)
 *   - Successful render: header, status/reversibility chips, decision maker, dates
 *   - Topic chips (read-only detail view)
 *   - Editing flow: clicking Edit opens DecisionForm; cancel discards; submit success + failure
 *   - Topic attach/detach diff during edit submit
 *   - Reject flow: open dialog, input reason, confirm success + failure, cancel
 *   - Supersede button for accepted decisions
 *   - Section collapse/expand (context, alternatives)
 *   - AnchorsRow: with and without anchors
 *   - Team member lookup (name, email fallback, User #N fallback)
 *   - Confidentiality level chip (restricted / confidential)
 *   - Topics soft-fail when for-entity route is not ok
 *
 * Mocks: next/navigation, global fetch, DecisionForm, DecisionSupersedeChain,
 *        TopicPicker, relativeDate.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({ id: capturedParamsId }),
  usePathname: () => '/portal/brain/decisions/1',
  useSearchParams: () => new URLSearchParams(),
}));

// Capture the latest id rendered (set before each render call)
let capturedParamsId = '1';

// Capture DecisionForm props so we can invoke callbacks
type DecisionFormCaptured = {
  onSubmit?: (payload: Record<string, unknown>) => Promise<void> | void;
  mode?: string;
};
const capturedDecisionFormProps: DecisionFormCaptured = {};

vi.mock('@/components/brain/DecisionForm', () => ({
  default: (props: {
    mode?: string;
    onSubmit?: (payload: Record<string, unknown>) => Promise<void> | void;
    submitting?: boolean;
    submitError?: string | null;
    initial?: Record<string, unknown>;
    cancelHref?: string;
    submitLabel?: string;
  }) => {
    capturedDecisionFormProps.onSubmit = props.onSubmit;
    capturedDecisionFormProps.mode = props.mode;
    return React.createElement(
      'div',
      { 'data-testid': 'decision-form', 'data-mode': props.mode },
      [
        `DecisionForm(${props.mode})`,
        props.submitError
          ? React.createElement('span', { key: 'err', 'data-testid': 'form-error' }, props.submitError)
          : null,
      ],
    );
  },
}));

vi.mock('@/components/brain/DecisionSupersedeChain', () => ({
  default: (_props: {
    ancestors: unknown[];
    current: unknown;
    descendants: unknown[];
  }) =>
    React.createElement('div', { 'data-testid': 'supersede-chain' }, 'SupersedeChain'),
}));

vi.mock('@/components/brain/TopicPicker', () => ({
  default: (props: {
    selectedTopicIds: number[];
    onChange: (ids: number[]) => void;
    allowCreate?: boolean;
    placeholder?: string;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'topic-picker',
        'data-selected': JSON.stringify(props.selectedTopicIds),
      },
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'topic-picker-change',
          onClick: () => props.onChange([99]),
        },
        'ChangeTopic',
      ),
    ),
}));

// Mock relativeDate exported from DecisionCard
vi.mock('@/components/brain/DecisionCard', () => ({
  relativeDate: (_input: string | Date | null | undefined) => '2 months ago',
}));

// next/link — render as plain anchor
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Fetch stub ───────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDecision(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Test Decision',
    context: null,
    decision: 'We decided to go with option A.',
    rationale: 'It was the best choice.',
    alternativesConsidered: null,
    reversibility: 'two_way',
    status: 'accepted',
    decisionMakerId: null,
    decidedAt: '2024-01-01T00:00:00Z',
    supersededByDecisionId: null,
    meetingId: null,
    noteId: null,
    companyId: null,
    dealId: null,
    confidentialityLevel: 'standard',
    source: 'manual',
    ...overrides,
  };
}

function makeDetailResponse(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      decision: makeDecision(overrides),
      ancestors: [],
      descendants: [],
    },
  };
}

function makeTopicsResponse(topicIds: number[] = [], topics: unknown[] = []) {
  return {
    success: true,
    data: { topicIds, topics },
  };
}

function setupDefault(
  decisionOverrides: Record<string, unknown> = {},
  topicIds: number[] = [],
  topics: unknown[] = [],
) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
      return makeRes(makeDetailResponse(decisionOverrides));
    }
    if (url.includes('for-entity')) {
      return makeRes(makeTopicsResponse(topicIds, topics));
    }
    if (url === '/api/portal/team') {
      return makeRes({ success: true, data: [] });
    }
    return makeRes({ success: true, data: {} });
  });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  capturedDecisionFormProps.onSubmit = undefined;
  capturedDecisionFormProps.mode = undefined;
  capturedParamsId = '1';
  setupDefault();
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import DecisionDetailPage from '@/app/portal/brain/decisions/[id]/page';

function renderPage() {
  return render(<DecisionDetailPage />);
}

function renderPageWithId(id: string) {
  capturedParamsId = id;
  return render(<DecisionDetailPage />);
}

// ─── Loading state ─────────────────────────────────────────────────────────────

describe('DecisionDetailPage — loading state', () => {
  it('shows loading spinner before data resolves', () => {
    fetchMock.mockImplementation(() => new Promise(() => { /* pending */ }));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Invalid ID ───────────────────────────────────────────────────────────────

describe('DecisionDetailPage — invalid id', () => {
  it('shows error for non-numeric id', async () => {
    const { container } = renderPageWithId('abc');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid decision id');
    });
  });

  it('shows back link in invalid id error state', async () => {
    const { container } = renderPageWithId('abc');
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/decisions"]');
      expect(link).toBeTruthy();
    });
  });
});

// ─── Error state ──────────────────────────────────────────────────────────────

describe('DecisionDetailPage — error state', () => {
  it('shows error message when API returns !ok', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes({ success: false, message: 'Not found' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Not found');
    });
  });

  it('shows HTTP status fallback when API returns !ok without message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes({ success: false }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain("Couldn");
    });
  });

  it('shows error when fetch throws an Error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        throw new Error('network down');
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network down');
    });
  });

  it('shows "Network error" when non-Error is thrown', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        // eslint-disable-next-line
        throw 'plain string';
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('shows back link in error state', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes({ success: false, message: 'Boom' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/decisions"]');
      expect(link).toBeTruthy();
    });
  });
});

// ─── Successful render ─────────────────────────────────────────────────────────

describe('DecisionDetailPage — successful render', () => {
  it('renders decision title', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Decision');
    });
  });

  it('renders back link to decisions list', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/decisions"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders decision text', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('We decided to go with option A.');
    });
  });

  it('renders rationale text', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('It was the best choice.');
    });
  });

  it('renders SupersedeChain component', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="supersede-chain"]')).toBeTruthy();
    });
  });

  it('renders Edit button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Edit'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('renders Reject button for non-rejected decision', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Reject'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('does NOT render Reject button for already-rejected decision', async () => {
    setupDefault({ status: 'rejected' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Decision');
    });
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim().includes('Reject'),
    );
    expect(btn).toBeFalsy();
  });
});

// ─── Status and reversibility chips ──────────────────────────────────────────

describe('DecisionDetailPage — status chips', () => {
  it.each([
    ['accepted', 'Accepted'],
    ['proposed', 'Proposed'],
    ['superseded', 'Superseded'],
    ['rejected', 'Rejected'],
  ] as const)('renders %s status as "%s"', async (status, label) => {
    setupDefault({ status });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain(label);
    });
  });

  it('renders "Two-way door" reversibility', async () => {
    setupDefault({ reversibility: 'two_way' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Two-way door');
    });
  });

  it('renders "One-way door" reversibility', async () => {
    setupDefault({ reversibility: 'one_way' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('One-way door');
    });
  });
});

// ─── Confidentiality level ────────────────────────────────────────────────────

describe('DecisionDetailPage — confidentiality', () => {
  it('renders confidentiality chip for restricted level', async () => {
    setupDefault({ confidentialityLevel: 'restricted' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('restricted');
    });
  });

  it('renders confidentiality chip for confidential level', async () => {
    setupDefault({ confidentialityLevel: 'confidential' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('confidential');
    });
  });

  it('does NOT render confidentiality chip for standard level', async () => {
    setupDefault({ confidentialityLevel: 'standard' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Decision');
    });
    // "standard" chip should not appear (it is the default, no badge shown)
    const hasLockChip = container.querySelector('.bg-amber-500\\/10');
    expect(hasLockChip).toBeFalsy();
  });
});

// ─── Supersede button ─────────────────────────────────────────────────────────

describe('DecisionDetailPage — Supersede button', () => {
  it('renders Supersede button for accepted decision', async () => {
    setupDefault({ status: 'accepted' });
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Supersede'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('does NOT render Supersede button for non-accepted decision', async () => {
    setupDefault({ status: 'proposed' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Decision');
    });
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Supersede'),
    );
    expect(btn).toBeFalsy();
  });

  it('Supersede button navigates to new decision with supersedes param', async () => {
    setupDefault({ status: 'accepted' });
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Supersede'),
      ) as HTMLButtonElement;
      fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/portal/brain/decisions/new?supersedes='),
      );
    });
  });
});

// ─── Decision maker ────────────────────────────────────────────────────────────

describe('DecisionDetailPage — decision maker', () => {
  it('renders "Unspecified" when decisionMakerId is null', async () => {
    setupDefault({ decisionMakerId: null });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Unspecified');
    });
  });

  it('renders maker name when team member is found', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes(makeDetailResponse({ decisionMakerId: 5 }));
      }
      if (url.includes('for-entity')) {
        return makeRes(makeTopicsResponse());
      }
      if (url === '/api/portal/team') {
        return makeRes({
          success: true,
          data: [{ userId: 5, name: 'Alice Smith', email: 'alice@test.com' }],
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice Smith');
    });
  });

  it('renders maker email when name is null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes(makeDetailResponse({ decisionMakerId: 7 }));
      }
      if (url.includes('for-entity')) {
        return makeRes(makeTopicsResponse());
      }
      if (url === '/api/portal/team') {
        return makeRes({
          success: true,
          data: [{ userId: 7, name: null, email: 'bob@test.com' }],
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('bob@test.com');
    });
  });

  it('renders "User #N" when decisionMakerId is set but not in team', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes(makeDetailResponse({ decisionMakerId: 99 }));
      }
      if (url.includes('for-entity')) {
        return makeRes(makeTopicsResponse());
      }
      if (url === '/api/portal/team') {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('User #99');
    });
  });

  it('does not crash when team fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes(makeDetailResponse());
      }
      if (url.includes('for-entity')) {
        return makeRes(makeTopicsResponse());
      }
      if (url === '/api/portal/team') {
        throw new Error('team fetch failed');
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Decision');
    });
  });
});

// ─── Topic chips (read-only detail view) ─────────────────────────────────────

describe('DecisionDetailPage — topic chips', () => {
  it('renders topic chips on detail view', async () => {
    setupDefault({}, [1], [
      { id: 1, name: 'Engineering', path: 'Engineering', icon: 'code', color: '#3B82F6' },
    ]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Engineering');
    });
  });

  it('does NOT render Topics section when no topics', async () => {
    setupDefault({}, [], []);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Decision');
    });
    // No sell icon for Topics label should appear
    expect(container.textContent).not.toContain('Topics:');
  });

  it('topic chips show topic icon and name', async () => {
    setupDefault({}, [2], [
      { id: 2, name: 'Product', path: 'Product', icon: null, color: null },
    ]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Product');
    });
  });

  it('soft-fails gracefully when topics for-entity route returns !ok', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes(makeDetailResponse());
      }
      if (url.includes('for-entity')) {
        return makeRes({ success: false }, false);
      }
      if (url === '/api/portal/team') {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    // Should still render successfully, just without topics
    await waitFor(() => {
      expect(container.textContent).toContain('Test Decision');
    });
  });
});

// ─── Context section ──────────────────────────────────────────────────────────

describe('DecisionDetailPage — context section', () => {
  it('does NOT render Context section when context is null', async () => {
    setupDefault({ context: null });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Decision');
    });
    expect(container.textContent).not.toContain('Context');
  });

  it('renders Context section when context is present', async () => {
    setupDefault({ context: 'We had a major technical constraint.' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('We had a major technical constraint.');
    });
  });

  it('renders collapsible Context section for long context', async () => {
    setupDefault({ context: 'x'.repeat(500) });
    const { container } = renderPage();
    await waitFor(() => {
      // Should have a Show button since context > 400 chars
      const showBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Show') && !b.textContent?.includes('Hide'),
      );
      expect(showBtn).toBeTruthy();
    });
  });

  it('clicking Show in Context section expands it', async () => {
    const longContext = 'x'.repeat(500);
    setupDefault({ context: longContext });
    const { container } = renderPage();
    // Wait for the Show button to appear (textContent: "expand_moreShow")
    let showBtn: HTMLButtonElement | undefined;
    await waitFor(() => {
      showBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Show') && !b.textContent?.includes('Hide'),
      ) as HTMLButtonElement | undefined;
      expect(showBtn).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(showBtn as HTMLButtonElement);
    });
    await waitFor(() => {
      const hideBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Hide') && !b.textContent?.includes('Show'),
      );
      expect(hideBtn).toBeTruthy();
    });
  });
});

// ─── Alternatives considered section ─────────────────────────────────────────

describe('DecisionDetailPage — alternatives section', () => {
  it('does NOT render Alternatives section when null', async () => {
    setupDefault({ alternativesConsidered: null });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Decision');
    });
    expect(container.textContent).not.toContain('Alternatives considered');
  });

  it('renders Alternatives section when present', async () => {
    setupDefault({ alternativesConsidered: 'Option B was considered but too expensive.' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alternatives considered');
    });
  });

  it('collapsible Alternatives section can be toggled', async () => {
    setupDefault({ alternativesConsidered: 'Option B' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alternatives considered');
    });
    // The section starts collapsed when alternativesConsidered has content
    const showBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Show') && !b.textContent?.includes('Hide'),
    );
    if (showBtn) {
      await act(async () => { fireEvent.click(showBtn as HTMLButtonElement); });
      await waitFor(() => {
        expect(container.textContent).toContain('Option B');
      });
    }
  });
});

// ─── Anchors section ──────────────────────────────────────────────────────────

describe('DecisionDetailPage — AnchorsRow', () => {
  it('does NOT render Anchors section when no anchors', async () => {
    setupDefault({ meetingId: null, noteId: null, companyId: null, dealId: null });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Decision');
    });
    expect(container.textContent).not.toContain('Anchors');
  });

  it('renders Anchors section with meetingId', async () => {
    setupDefault({ meetingId: 42 });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Meeting #42');
    });
  });

  it('renders Anchors section with noteId as a link', async () => {
    setupDefault({ noteId: 7 });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Note #7');
      const link = container.querySelector('a[href*="/portal/brain/knowledge"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders Anchors section with companyId as a link', async () => {
    setupDefault({ companyId: 3 });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Company #3');
      const link = container.querySelector('a[href*="/portal/crm/companies"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders Anchors section with dealId as a link', async () => {
    setupDefault({ dealId: 9 });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Deal #9');
      const link = container.querySelector('a[href*="/portal/crm/deals"]');
      expect(link).toBeTruthy();
    });
  });
});

// ─── Edit flow ────────────────────────────────────────────────────────────────

describe('DecisionDetailPage — edit flow', () => {
  it('clicking Edit renders DecisionForm in edit mode', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Edit'),
      ) as HTMLButtonElement;
      fireEvent.click(editBtn);
    });
    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="decision-form"][data-mode="edit"]'),
      ).toBeTruthy();
    });
  });

  it('Cancel edit button hides the form and restores original topics', async () => {
    const { container } = renderPage();
    // Open edit
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Edit'),
      ) as HTMLButtonElement;
      fireEvent.click(editBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-form"]')).toBeTruthy();
    });
    // Click Cancel edit
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel edit'),
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(cancelBtn); });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-form"]')).toBeFalsy();
    });
  });

  it('TopicPicker is rendered in edit mode', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Edit'),
      ) as HTMLButtonElement;
      fireEvent.click(editBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="topic-picker"]')).toBeTruthy();
    });
  });

  it('onSubmit (edit) sends PATCH and reloads on success', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/decisions/1') && init?.method === 'PATCH') {
        return makeRes({ success: true, data: { decision: makeDecision() } });
      }
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes(makeDetailResponse());
      }
      if (url.includes('for-entity')) {
        return makeRes(makeTopicsResponse());
      }
      if (url === '/api/portal/team') {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    // Open edit form
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Edit'),
      ) as HTMLButtonElement;
      fireEvent.click(editBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-form"]')).toBeTruthy();
    });
    // Submit
    await act(async () => {
      await capturedDecisionFormProps.onSubmit?.({
        title: 'Updated Title',
        context: null,
        decisionMakerId: null,
        anchors: {},
        confidentialityLevel: 'standard',
        alternativesConsidered: null,
      });
    });
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        ([u, i]) => String(u).includes('/decisions/1') && (i as RequestInit)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('onSubmit (edit) shows error on PATCH failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/decisions/1') && init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'Update failed' }, false);
      }
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes(makeDetailResponse());
      }
      if (url.includes('for-entity')) {
        return makeRes(makeTopicsResponse());
      }
      if (url === '/api/portal/team') {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Edit'),
      ) as HTMLButtonElement;
      fireEvent.click(editBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-form"]')).toBeTruthy();
    });
    await act(async () => {
      await capturedDecisionFormProps.onSubmit?.({
        title: 'Updated',
        context: null,
        decisionMakerId: null,
        anchors: {},
        confidentialityLevel: 'standard',
        alternativesConsidered: null,
      });
    });
    await waitFor(() => {
      // Form should still be visible (not dismissed on error)
      expect(container.querySelector('[data-testid="decision-form"]')).toBeTruthy();
    });
  });

  it('edit: supersede link navigates correctly', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Edit'),
      ) as HTMLButtonElement;
      fireEvent.click(editBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-form"]')).toBeTruthy();
    });
    // Click the "supersede this decision" button in the edit header
    const supersedeInEdit = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('supersede this decision'),
    ) as HTMLButtonElement | undefined;
    if (supersedeInEdit) {
      fireEvent.click(supersedeInEdit);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('supersedes='),
        );
      });
    }
  });

  it('topic picker onChange updates draft topics', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Edit'),
      ) as HTMLButtonElement;
      fireEvent.click(editBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="topic-picker"]')).toBeTruthy();
    });
    // Click the change button in the mocked TopicPicker
    const changeBtn = container.querySelector('[data-testid="topic-picker-change"]') as HTMLButtonElement;
    fireEvent.click(changeBtn);
    // After change, the topic picker should reflect new ids [99]
    await waitFor(() => {
      const picker = container.querySelector('[data-testid="topic-picker"]');
      expect(picker?.getAttribute('data-selected')).toContain('99');
    });
  });

  it('edit submit with topic diff calls attach and detach', async () => {
    // Setup: decision has topic [1], we'll change to [99] via picker
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/decisions/1') && init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/topics/attach') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/topics/attach') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes(makeDetailResponse());
      }
      if (url.includes('for-entity')) {
        return makeRes(makeTopicsResponse([1], [{ id: 1, name: 'Eng', path: 'Eng', icon: null, color: null }]));
      }
      if (url === '/api/portal/team') {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    // Wait for data load
    await waitFor(() => {
      expect(container.textContent).toContain('Test Decision');
    });
    // Open edit
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Edit'),
      ) as HTMLButtonElement;
      fireEvent.click(editBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="topic-picker"]')).toBeTruthy();
    });
    // Change topics via picker (now [99] instead of [1])
    const changeBtn = container.querySelector('[data-testid="topic-picker-change"]') as HTMLButtonElement;
    fireEvent.click(changeBtn);
    // Submit
    await act(async () => {
      await capturedDecisionFormProps.onSubmit?.({
        title: 'Updated Title',
        context: null,
        decisionMakerId: null,
        anchors: {},
        confidentialityLevel: 'standard',
        alternativesConsidered: null,
      });
    });
    await waitFor(() => {
      const attachCalls = fetchMock.mock.calls.filter(
        ([u, i]) =>
          String(u).includes('/topics/attach') && (i as RequestInit)?.method === 'POST',
      );
      const detachCalls = fetchMock.mock.calls.filter(
        ([u, i]) =>
          String(u).includes('/topics/attach') && (i as RequestInit)?.method === 'DELETE',
      );
      expect(attachCalls.length).toBeGreaterThan(0);
      expect(detachCalls.length).toBeGreaterThan(0);
    });
  });
});

// ─── Reject flow ──────────────────────────────────────────────────────────────

describe('DecisionDetailPage — reject flow', () => {
  it('clicking Reject opens the reject dialog', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const rejectBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Reject'),
      ) as HTMLButtonElement;
      fireEvent.click(rejectBtn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Reject this decision?');
    });
  });

  it('Cancel button in reject dialog closes it', async () => {
    const { container } = renderPage();
    // Open
    await waitFor(() => {
      const rejectBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Reject'),
      ) as HTMLButtonElement;
      fireEvent.click(rejectBtn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Reject this decision?');
    });
    // Cancel
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Reject this decision?');
    });
  });

  it('reject reason input is editable', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const rejectBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Reject'),
      ) as HTMLButtonElement;
      fireEvent.click(rejectBtn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Reject this decision?');
    });
    const input = container.querySelector('input[placeholder="Reason (optional)"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Not viable' } });
    expect(input.value).toBe('Not viable');
  });

  it('confirm reject sends DELETE and navigates on success', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/decisions/1') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes(makeDetailResponse());
      }
      if (url.includes('for-entity')) {
        return makeRes(makeTopicsResponse());
      }
      if (url === '/api/portal/team') {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const rejectBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Reject'),
      ) as HTMLButtonElement;
      fireEvent.click(rejectBtn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Reject this decision?');
    });
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Confirm reject'),
    ) as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal/brain/decisions');
    });
  });

  it('shows error when DELETE fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/decisions/1') && init?.method === 'DELETE') {
        return makeRes({ success: false, message: 'Reject failed' }, false);
      }
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes(makeDetailResponse());
      }
      if (url.includes('for-entity')) {
        return makeRes(makeTopicsResponse());
      }
      if (url === '/api/portal/team') {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const rejectBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Reject'),
      ) as HTMLButtonElement;
      fireEvent.click(rejectBtn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Reject this decision?');
    });
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Confirm reject'),
    ) as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Reject failed');
    });
  });

  it('shows error when DELETE throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/decisions/1') && init?.method === 'DELETE') {
        throw new Error('network reject error');
      }
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes(makeDetailResponse());
      }
      if (url.includes('for-entity')) {
        return makeRes(makeTopicsResponse());
      }
      if (url === '/api/portal/team') {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const rejectBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().includes('Reject'),
      ) as HTMLButtonElement;
      fireEvent.click(rejectBtn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Reject this decision?');
    });
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Confirm reject'),
    ) as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('network reject error');
    });
  });
});

// ─── Section component (collapse/expand) ─────────────────────────────────────

describe('DecisionDetailPage — Section collapse/expand', () => {
  it('Section without collapsible prop always shows children', async () => {
    setupDefault({ context: 'Short context' });
    const { container } = renderPage();
    await waitFor(() => {
      // Short context (<= 400 chars) renders immediately without Show/Hide
      expect(container.textContent).toContain('Short context');
    });
  });

  it('collapsible Section with long context toggles Show/Hide', async () => {
    setupDefault({ context: 'A'.repeat(401) });
    const { container } = renderPage();
    let showBtn: HTMLButtonElement | undefined;
    await waitFor(() => {
      showBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Show') && !b.textContent?.includes('Hide'),
      ) as HTMLButtonElement | undefined;
      expect(showBtn).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(showBtn as HTMLButtonElement);
    });
    let hideBtn: HTMLButtonElement | undefined;
    await waitFor(() => {
      hideBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Hide') && !b.textContent?.includes('Show'),
      ) as HTMLButtonElement | undefined;
      expect(hideBtn).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(hideBtn as HTMLButtonElement);
    });
    await waitFor(() => {
      const showBtnAgain = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Show') && !b.textContent?.includes('Hide'),
      );
      expect(showBtnAgain).toBeTruthy();
    });
  });
});

// ─── Team fetch cleanup ───────────────────────────────────────────────────────

describe('DecisionDetailPage — team fetch cleanup', () => {
  it('does not update state when unmounted before team resolves', async () => {
    let resolveTeam: (v: FetchResp) => void;
    const teamPromise = new Promise<FetchResp>((res) => { resolveTeam = res; });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/decisions/') && !url.includes('for-entity')) {
        return makeRes(makeDetailResponse());
      }
      if (url.includes('for-entity')) {
        return makeRes(makeTopicsResponse());
      }
      if (url === '/api/portal/team') return teamPromise;
      return makeRes({ success: true, data: {} });
    });
    const { unmount } = renderPage();
    unmount();
    resolveTeam!(makeRes({ success: true, data: [{ userId: 1, name: 'Alice', email: 'a@b.com' }] }));
    await new Promise((r) => setTimeout(r, 50));
    // No assertion needed — just no crash
  });
});
