// @vitest-environment jsdom
/**
 * Unit tests for `app/approve/[token]/ApprovalReviewer.tsx`
 *
 * Covers:
 *  - Renders sticky bar with entity type label, status badge, title
 *  - Approve / Reject buttons visible when status=pending, hidden otherwise
 *  - Reviewed-by attribution shown when status != pending
 *  - PreviewBody: each kind branch (missing, post, block_template,
 *    pitch_deck, email_campaign, pending_change, survey, booking_page)
 *  - DecisionModal: opens on Approve/Reject click, shows correct copy
 *  - Unauthenticated path: name/email inputs rendered
 *  - Authenticated path: name/email inputs hidden, authed copy shown
 *  - Validation: empty name triggers error
 *  - Submit success: status transitions to approved/rejected
 *  - Submit failure: API error shown in modal
 *  - Network error: caught and surfaced in modal
 *  - Cancel resets decision state
 *  - Submitting flag disables buttons
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must precede component import
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/approve/test-token',
}));

// Stub BlockRenderer so we don't need the entire block pipeline
vi.mock('@/components/blocks/render/BlockRenderer', () => ({
  BlockRenderer: ({ content }: { content: string }) =>
    React.createElement('div', { 'data-testid': 'block-renderer', 'data-content': content }),
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { ApprovalReviewer } from '@/app/approve/[token]/ApprovalReviewer';
import type { ApprovalEntityPreview } from '@/app/approve/[token]/ApprovalReviewer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Status = 'pending' | 'approved' | 'rejected' | 'expired';

interface BaseProps {
  token?: string;
  linkType?: 'entity' | 'pending_change';
  entityType?: string;
  status?: Status;
  summary?: string | null;
  reviewerName?: string | null;
  reviewedAt?: string | null;
  expiresAt?: string | null;
  preview?: ApprovalEntityPreview;
  currentUser?: { name: string; email: string } | null;
}

const defaultPreview: ApprovalEntityPreview = {
  kind: 'post',
  title: 'My Post',
  slug: 'my-post',
  published: false,
  content: '{"blocks":[],"version":"1.0"}',
  siteId: 1,
};

function buildProps(overrides: BaseProps = {}) {
  return {
    token: 'tok-abc',
    linkType: 'entity' as const,
    entityType: 'post',
    status: 'pending' as Status,
    summary: 'A draft review',
    reviewerName: null,
    reviewedAt: null,
    expiresAt: null,
    preview: defaultPreview,
    currentUser: null,
    ...overrides,
  };
}

type FetchResponder = (url: string, init?: RequestInit) => unknown;

function installFetchMock(responder: FetchResponder) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = responder(url, init);
    return {
      json: async () => body,
    } as unknown as Response;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchMock;
  return fetchMock;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApprovalReviewer', () => {
  beforeEach(() => {
    installFetchMock(() => ({ success: true, data: { status: 'approved' } }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Sticky bar rendering
  // -------------------------------------------------------------------------

  it('renders the entity type label and title in the sticky bar', () => {
    render(<ApprovalReviewer {...buildProps({ entityType: 'post', preview: { ...defaultPreview, title: 'Draft Post' } })} />);
    expect(screen.getByText(/Page — Draft review/i)).toBeTruthy();
    expect(screen.getByText('Draft Post')).toBeTruthy();
  });

  it('renders summary text when provided', () => {
    render(<ApprovalReviewer {...buildProps({ summary: 'Please review this change' })} />);
    expect(screen.getByText('Please review this change')).toBeTruthy();
  });

  it('shows PENDING status badge when status is pending', () => {
    render(<ApprovalReviewer {...buildProps({ status: 'pending' })} />);
    expect(screen.getByText('PENDING')).toBeTruthy();
  });

  it('shows APPROVED status badge when status is approved', () => {
    render(<ApprovalReviewer {...buildProps({ status: 'approved' })} />);
    expect(screen.getByText('APPROVED')).toBeTruthy();
  });

  it('shows REJECTED status badge when status is rejected', () => {
    render(<ApprovalReviewer {...buildProps({ status: 'rejected' })} />);
    expect(screen.getByText('REJECTED')).toBeTruthy();
  });

  it('shows EXPIRED status badge when status is expired', () => {
    render(<ApprovalReviewer {...buildProps({ status: 'expired' })} />);
    expect(screen.getByText('EXPIRED')).toBeTruthy();
  });

  it('shows Approve and Reject buttons when status is pending', () => {
    render(<ApprovalReviewer {...buildProps({ status: 'pending' })} />);
    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
  });

  it('hides Approve/Reject buttons when status is approved', () => {
    render(<ApprovalReviewer {...buildProps({ status: 'approved' })} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it('shows reviewer attribution when status is approved and reviewerName+reviewedAt are set', () => {
    render(<ApprovalReviewer {...buildProps({
      status: 'approved',
      reviewerName: 'Alice Smith',
      reviewedAt: '2026-05-01T10:00:00.000Z',
    })} />);
    expect(screen.getByText('Alice Smith')).toBeTruthy();
    expect(screen.getByText(/Approved/)).toBeTruthy();
  });

  it('shows "Rejected by" attribution when status is rejected', () => {
    render(<ApprovalReviewer {...buildProps({
      status: 'rejected',
      reviewerName: 'Bob Jones',
      reviewedAt: '2026-05-02T12:00:00.000Z',
    })} />);
    expect(screen.getByText('Bob Jones')).toBeTruthy();
    expect(screen.getByText(/Rejected/)).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // humanEntity label mapping
  // -------------------------------------------------------------------------

  it('maps pitch_deck entityType to "Pitch deck"', () => {
    render(<ApprovalReviewer {...buildProps({ entityType: 'pitch_deck' })} />);
    expect(screen.getByText(/Pitch deck — Draft review/)).toBeTruthy();
  });

  it('maps email_campaign entityType to "Email"', () => {
    render(<ApprovalReviewer {...buildProps({ entityType: 'email_campaign' })} />);
    expect(screen.getByText(/Email — Draft review/)).toBeTruthy();
  });

  it('maps survey entityType to "Survey"', () => {
    render(<ApprovalReviewer {...buildProps({ entityType: 'survey' })} />);
    expect(screen.getByText(/Survey — Draft review/)).toBeTruthy();
  });

  it('maps booking_page entityType to "Booking page"', () => {
    render(<ApprovalReviewer {...buildProps({ entityType: 'booking_page' })} />);
    expect(screen.getByText(/Booking page — Draft review/)).toBeTruthy();
  });

  it('falls back to underscored entityType for unknown kinds', () => {
    render(<ApprovalReviewer {...buildProps({ entityType: 'custom_type' })} />);
    expect(screen.getByText(/custom type — Draft review/)).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // PreviewBody branches
  // -------------------------------------------------------------------------

  it('renders missing kind with message', () => {
    const preview: ApprovalEntityPreview = { kind: 'missing', message: 'Entity not found' };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText('Entity not found')).toBeTruthy();
  });

  it('renders post kind with slug and BlockRenderer', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'post',
      title: 'Test Post',
      slug: 'test-post',
      published: true,
      content: '{"blocks":[],"version":"1.0"}',
      siteId: 42,
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText(/test-post/)).toBeTruthy();
    expect(screen.getByText(/Currently published/)).toBeTruthy();
    expect(screen.getByTestId('block-renderer')).toBeTruthy();
  });

  it('renders post kind with draft label when published=false', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'post',
      title: 'Draft Post',
      slug: 'draft-post',
      published: false,
      content: '{}',
      siteId: null,
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText(/Currently a draft/)).toBeTruthy();
  });

  it('renders post kind with custom JS warning when customJs is present', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'post',
      title: 'JS Post',
      slug: 'js-post',
      published: false,
      content: '{}',
      siteId: null,
      customJs: 'console.log("hi")',
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText(/Page has custom JS/)).toBeTruthy();
  });

  it('renders block_template kind with category and scope', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'block_template',
      title: 'Hero Template',
      slug: 'hero-template',
      category: 'marketing',
      scope: 'global',
      description: 'A hero block',
      content: '{"blocks":[]}',
      pendingDelete: false,
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText(/marketing/)).toBeTruthy();
    expect(screen.getByText(/global/)).toBeTruthy();
    expect(screen.getByText('A hero block')).toBeTruthy();
    expect(screen.getByTestId('block-renderer')).toBeTruthy();
  });

  it('renders block_template with PENDING DELETE badge and hides BlockRenderer', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'block_template',
      title: 'Old Template',
      slug: 'old-template',
      category: 'legacy',
      scope: 'client',
      description: null,
      content: '{"blocks":[]}',
      pendingDelete: true,
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText('PENDING DELETE')).toBeTruthy();
    expect(screen.queryByTestId('block-renderer')).toBeNull();
  });

  it('renders pitch_deck kind with slides', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'pitch_deck',
      title: 'Q1 Deck',
      slug: 'q1-deck',
      status: 'draft',
      slides: [
        { id: 'slide-1', label: 'Intro', blocks: [], pageSettings: {}, customCss: null },
        { id: 'slide-2', label: null, blocks: [], pageSettings: {} },
      ],
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText(/Slide 1/)).toBeTruthy();
    expect(screen.getByText(/Intro/)).toBeTruthy();
    expect(screen.getByText(/Slide 2/)).toBeTruthy();
  });

  it('renders pitch_deck with empty slides message', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'pitch_deck',
      title: 'Empty Deck',
      slug: 'empty-deck',
      status: 'draft',
      slides: [],
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText(/This deck has no slides yet/)).toBeTruthy();
  });

  it('renders pitch_deck slide with background image style from pageSettings', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'pitch_deck',
      title: 'Styled Deck',
      slug: 'styled-deck',
      status: 'draft',
      slides: [
        {
          id: 'slide-bg',
          label: 'BG Slide',
          blocks: [],
          pageSettings: { backgroundColor: '#ff0000', backgroundImage: 'https://example.com/img.jpg' },
        },
      ],
    };
    const { container } = render(<ApprovalReviewer {...buildProps({ preview })} />);
    const slideEl = container.querySelector('[data-slide-id="slide-bg"]');
    expect(slideEl).toBeTruthy();
    expect((slideEl as HTMLElement).style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('renders email_campaign kind with subject and from info', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'email_campaign',
      title: 'Welcome Email',
      subject: 'Welcome to us!',
      previewText: 'Check this out',
      fromName: 'Team SD',
      fromEmail: 'hello@simplerdevelopment.com',
      htmlContent: '<p>Hello</p>',
      status: 'draft',
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText(/Team SD/)).toBeTruthy();
    expect(screen.getByText(/Welcome to us!/)).toBeTruthy();
    expect(screen.getByText(/Check this out/)).toBeTruthy();
    expect(screen.getByTitle('Email preview')).toBeTruthy();
  });

  it('renders email_campaign without previewText when null', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'email_campaign',
      title: 'No Preview Email',
      subject: 'Sub',
      previewText: null,
      fromName: 'Sender',
      fromEmail: 'sender@test.com',
      htmlContent: '',
      status: 'draft',
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.queryByText(/Preview:/)).toBeNull();
  });

  it('renders pending_change kind with entityType, operation, and JSON payload', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'pending_change',
      title: 'Update site name',
      entityType: 'site_settings',
      operation: 'update',
      payloadJson: '{"name":"New Site"}',
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText(/site_settings/)).toBeTruthy();
    expect(screen.getByText(/update/)).toBeTruthy();
    expect(screen.getByText('{"name":"New Site"}')).toBeTruthy();
  });

  it('renders survey kind with fields', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'survey',
      title: 'Customer Survey',
      slug: 'customer-survey',
      description: 'Tell us how you feel',
      status: 'draft',
      publicUrl: 'https://example.com/surveys/customer-survey',
      fields: [
        { id: 'f1', type: 'text', label: 'Respondent name', required: true },
        {
          id: 'f2', type: 'select', label: 'Satisfaction rating',
          options: [{ label: 'Good feedback' }, { label: 'Bad feedback' }],
        },
      ],
      thankYouTitle: 'Thank you!',
      thankYouMessage: 'We appreciate your feedback.',
      requireEmail: true,
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText(/Respondent name/)).toBeTruthy();
    expect(screen.getByText(/Satisfaction rating/)).toBeTruthy();
    expect(screen.getByText('Good feedback')).toBeTruthy();
    expect(screen.getByText('Thank you!')).toBeTruthy();
    expect(screen.getByText(/email required/)).toBeTruthy();
  });

  it('renders survey with no fields message when fields is empty', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'survey',
      title: 'Empty Survey',
      slug: 'empty-survey',
      description: null,
      status: 'draft',
      publicUrl: 'https://example.com/surveys/empty',
      fields: [],
      thankYouTitle: null,
      thankYouMessage: null,
      requireEmail: false,
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText('No fields yet.')).toBeTruthy();
  });

  it('renders survey field with showIf conditional info', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'survey',
      title: 'Logic Survey',
      slug: 'logic-survey',
      description: null,
      status: 'draft',
      publicUrl: 'https://example.com/s/logic',
      fields: [
        {
          id: 'f1', type: 'text', label: 'Follow up question',
          showIf: { fieldId: 'f0', values: ['yes'] },
        },
      ],
      thankYouTitle: null,
      thankYouMessage: null,
      requireEmail: false,
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    // The conditional div renders "Conditional — <code>..." text
    expect(screen.getAllByText(/Conditional/).length).toBeGreaterThan(0);
  });

  it('renders booking_page kind with duration, price, and timezone', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'booking_page',
      title: 'Consult Call',
      slug: 'consult-call',
      active: true,
      publicUrl: 'https://example.com/book/consult-call',
      duration: 60,
      price: 15000,
      priceLabel: null,
      timezone: 'America/New_York',
      bookingType: 'one_on_one',
      assignmentMode: 'round_robin',
      description: 'A one-hour consultation.',
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText('60 min')).toBeTruthy();
    expect(screen.getByText('$150.00')).toBeTruthy();
    expect(screen.getByText('America/New_York')).toBeTruthy();
    expect(screen.getByText('A one-hour consultation.')).toBeTruthy();
  });

  it('renders booking_page with priceLabel when set', () => {
    const preview: ApprovalEntityPreview = {
      kind: 'booking_page',
      title: 'Free Call',
      slug: 'free-call',
      active: false,
      publicUrl: 'https://example.com/book/free-call',
      duration: 30,
      price: 0,
      priceLabel: 'Free',
      timezone: 'UTC',
      bookingType: 'group',
      assignmentMode: 'manual',
      description: null,
    };
    render(<ApprovalReviewer {...buildProps({ preview })} />);
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText(/Currently inactive/)).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // DecisionModal — open / close
  // -------------------------------------------------------------------------

  it('opens approve modal when Approve button is clicked', () => {
    render(<ApprovalReviewer {...buildProps()} />);
    fireEvent.click(screen.getByText('Approve'));
    expect(screen.getByText('Approve this draft?')).toBeTruthy();
  });

  it('opens reject modal when Reject button is clicked', () => {
    render(<ApprovalReviewer {...buildProps()} />);
    fireEvent.click(screen.getByText('Reject'));
    expect(screen.getByText('Reject this draft?')).toBeTruthy();
  });

  it('closes modal when Cancel is clicked', () => {
    render(<ApprovalReviewer {...buildProps()} />);
    fireEvent.click(screen.getByText('Approve'));
    expect(screen.getByText('Approve this draft?')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Approve this draft?')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Unauthenticated path: name + email inputs shown
  // -------------------------------------------------------------------------

  it('shows name and email inputs for unauthenticated users', () => {
    render(<ApprovalReviewer {...buildProps({ currentUser: null })} />);
    fireEvent.click(screen.getByText('Approve'));
    expect(screen.getByPlaceholderText('Full name')).toBeTruthy();
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
  });

  it('allows changing reviewer name and email in the modal', () => {
    render(<ApprovalReviewer {...buildProps({ currentUser: null })} />);
    fireEvent.click(screen.getByText('Approve'));
    const nameInput = screen.getByPlaceholderText('Full name');
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });
    expect((nameInput as HTMLInputElement).value).toBe('Jane Doe');
  });

  // -------------------------------------------------------------------------
  // Authenticated path: inputs hidden, authed copy shown
  // -------------------------------------------------------------------------

  it('hides name/email inputs for authenticated users', () => {
    render(<ApprovalReviewer {...buildProps({ currentUser: { name: 'Alice', email: 'alice@test.com' } })} />);
    fireEvent.click(screen.getByText('Approve'));
    expect(screen.queryByPlaceholderText('Full name')).toBeNull();
    expect(screen.queryByPlaceholderText('you@example.com')).toBeNull();
    expect(screen.getByText(/Recording this approval as Alice/)).toBeTruthy();
  });

  it('shows rejection copy for authenticated user on reject modal', () => {
    render(<ApprovalReviewer {...buildProps({ currentUser: { name: 'Bob', email: 'bob@test.com' } })} />);
    fireEvent.click(screen.getByText('Reject'));
    expect(screen.getByText(/Recording this rejection as Bob/)).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it('shows error when Approve is confirmed without entering a name', async () => {
    render(<ApprovalReviewer {...buildProps({ currentUser: null })} />);
    // Click the sticky bar Approve button — opens modal
    const [stickyApprove] = screen.getAllByText('Approve');
    fireEvent.click(stickyApprove);
    // Modal is now open; last "Approve" button is the modal confirm
    const allApprove = screen.getAllByText('Approve');
    const confirmBtn = allApprove[allApprove.length - 1];
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    expect(screen.getByText('Please enter your name.')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Submit — success path
  // -------------------------------------------------------------------------

  it('transitions status to approved after successful submit', async () => {
    installFetchMock(() => ({ success: true, data: { status: 'approved' } }));
    render(<ApprovalReviewer {...buildProps({ currentUser: { name: 'Alice', email: 'alice@test.com' } })} />);
    const [stickyApprove] = screen.getAllByText('Approve');
    fireEvent.click(stickyApprove);
    const allApprove = screen.getAllByText('Approve');
    const confirmBtn = allApprove[allApprove.length - 1];
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await flush();
    // Modal closed
    expect(screen.queryByText('Approve this draft?')).toBeNull();
    // Status badge updated
    expect(screen.getByText('APPROVED')).toBeTruthy();
  });

  it('transitions status to rejected after successful reject submit', async () => {
    installFetchMock(() => ({ success: true, data: { status: 'rejected' } }));
    render(<ApprovalReviewer {...buildProps({ currentUser: { name: 'Alice', email: 'alice@test.com' } })} />);
    const [stickyReject] = screen.getAllByText('Reject');
    fireEvent.click(stickyReject);
    const allReject = screen.getAllByText('Reject');
    const confirmBtn = allReject[allReject.length - 1];
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await flush();
    expect(screen.queryByText('Reject this draft?')).toBeNull();
    expect(screen.getByText('REJECTED')).toBeTruthy();
  });

  it('falls back to derived status when API response has no data.status', async () => {
    installFetchMock(() => ({ success: true }));
    render(<ApprovalReviewer {...buildProps({ currentUser: { name: 'Alice', email: 'alice@test.com' } })} />);
    const [stickyApprove] = screen.getAllByText('Approve');
    fireEvent.click(stickyApprove);
    const allApprove = screen.getAllByText('Approve');
    const confirmBtn = allApprove[allApprove.length - 1];
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await flush();
    expect(screen.getByText('APPROVED')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Submit — failure path
  // -------------------------------------------------------------------------

  it('shows API error message in modal when success=false', async () => {
    installFetchMock(() => ({ success: false, message: 'Not authorized to approve' }));
    render(<ApprovalReviewer {...buildProps({ currentUser: { name: 'Alice', email: 'alice@test.com' } })} />);
    const [stickyApprove] = screen.getAllByText('Approve');
    fireEvent.click(stickyApprove);
    const allApprove = screen.getAllByText('Approve');
    const confirmBtn = allApprove[allApprove.length - 1];
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await flush();
    expect(screen.getByText('Not authorized to approve')).toBeTruthy();
    // Modal stays open
    expect(screen.getByText('Approve this draft?')).toBeTruthy();
  });

  it('shows fallback error when success=false and no message', async () => {
    installFetchMock(() => ({ success: false }));
    render(<ApprovalReviewer {...buildProps({ currentUser: { name: 'Alice', email: 'alice@test.com' } })} />);
    const [stickyApprove] = screen.getAllByText('Approve');
    fireEvent.click(stickyApprove);
    const allApprove = screen.getAllByText('Approve');
    const confirmBtn = allApprove[allApprove.length - 1];
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await flush();
    expect(screen.getByText('Failed to record review')).toBeTruthy();
  });

  it('shows network error message when fetch throws', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('Network failure'));
    render(<ApprovalReviewer {...buildProps({ currentUser: { name: 'Alice', email: 'alice@test.com' } })} />);
    const [stickyApprove] = screen.getAllByText('Approve');
    fireEvent.click(stickyApprove);
    const allApprove = screen.getAllByText('Approve');
    const confirmBtn = allApprove[allApprove.length - 1];
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await flush();
    expect(screen.getByText('Network failure')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Fetch payload shape
  // -------------------------------------------------------------------------

  it('posts correct action and reviewer info to the token endpoint', async () => {
    const fetchMock = installFetchMock(() => ({ success: true, data: { status: 'approved' } }));
    render(<ApprovalReviewer {...buildProps({ token: 'tok-xyz', currentUser: { name: 'Alice', email: 'alice@test.com' } })} />);
    const [stickyApprove] = screen.getAllByText('Approve');
    fireEvent.click(stickyApprove);
    const noteArea = screen.getByPlaceholderText('Anything to tell the author?');
    fireEvent.change(noteArea, { target: { value: 'Looks great' } });
    const allApprove = screen.getAllByText('Approve');
    const confirmBtn = allApprove[allApprove.length - 1];
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledWith('/api/approve/tok-xyz', expect.objectContaining({
      method: 'POST',
    }));
    const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(callBody.action).toBe('approve');
    expect(callBody.reviewerName).toBe('Alice');
    expect(callBody.reviewNote).toBe('Looks great');
  });

  // -------------------------------------------------------------------------
  // Error is cleared when opening a new decision
  // -------------------------------------------------------------------------

  it('clears error when a new decision is opened after a failure', async () => {
    installFetchMock(() => ({ success: false, message: 'Error!' }));
    render(<ApprovalReviewer {...buildProps({ currentUser: { name: 'Alice', email: 'alice@test.com' } })} />);
    // Open approve, fail
    const [stickyApprove] = screen.getAllByText('Approve');
    fireEvent.click(stickyApprove);
    const allApprove = screen.getAllByText('Approve');
    const confirmApprove = allApprove[allApprove.length - 1];
    await act(async () => {
      fireEvent.click(confirmApprove);
    });
    await flush();
    expect(screen.getByText('Error!')).toBeTruthy();
    // Cancel and open reject — error should be cleared
    fireEvent.click(screen.getByText('Cancel'));
    // Reinstall mock to succeed so Reject opens fresh
    installFetchMock(() => ({ success: true }));
    const [stickyReject] = screen.getAllByText('Reject');
    fireEvent.click(stickyReject);
    expect(screen.queryByText('Error!')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Submitting state disables buttons
  // -------------------------------------------------------------------------

  it('disables confirm and cancel buttons while submitting', async () => {
    let resolvePromise: (v: unknown) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = vi.fn(() => new Promise((r) => { resolvePromise = r; }));
    render(<ApprovalReviewer {...buildProps({ currentUser: { name: 'Alice', email: 'alice@test.com' } })} />);
    const [stickyApprove] = screen.getAllByText('Approve');
    fireEvent.click(stickyApprove);
    const allApprove = screen.getAllByText('Approve');
    const confirmBtn = allApprove[allApprove.length - 1];
    act(() => {
      fireEvent.click(confirmBtn);
    });
    // Submitting state should kick in before the promise resolves
    await waitFor(() => {
      // "Approving…" button appears in the modal when submitting
      const approvingBtn = screen.queryByText('Approving…');
      expect(approvingBtn).toBeTruthy();
      expect(approvingBtn?.closest('button')?.disabled).toBe(true);
    });
    // Resolve to avoid dangling promise
    act(() => {
      resolvePromise!({ json: async () => ({ success: true, data: { status: 'approved' } }) });
    });
  });
});
