// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for ResponseAnalytics component.
 *
 * Covers:
 *  - Empty state (no responses)
 *  - Summary stats cards (total, completed, completion rate, identified)
 *  - AI summary panel gating (shown only when text fields + non-empty answers)
 *  - Per-question analytics: rating field (avg, star distribution)
 *  - Per-question analytics: slider field (avg, range info)
 *  - Per-question analytics: radio/select/checkbox bar chart
 *  - Per-question analytics: toggle yes/no split
 *  - Per-question analytics: text/textarea/email/phone/url/number/date (recent responses)
 *  - Text field shows "+ N more" when >10 answers
 *  - heading/page_break fields are filtered out
 *  - Response timeline section rendered
 *  - Response sources section rendered
 *  - Timeline groups by date and renders bars
 *  - Source breakdown color assignment
 *  - Completion rate rounds correctly (0 when total=0)
 *  - Checkbox multi-value counting
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// ─── Mock AiSummaryPanel (stateful child with fetch) ─────────────────────────

vi.mock(
  '@/app/portal/surveys/[id]/_components/AiSummaryPanel',
  () => ({
    default: function AiSummaryPanelStub({ surveyId }: { surveyId: number }) {
      return React.createElement(
        'div',
        { 'data-testid': 'ai-summary-panel', 'data-survey-id': String(surveyId) },
        'AI Summary Panel',
      );
    },
  }),
);

// ─── Mock heavy lib that might get pulled via api.ts transitive imports ───────

vi.mock('@/lib/db/schema', () => ({
  surveys: {},
  surveyResponses: {},
}));

vi.mock('@/components/admin/SurveyBuilder', () => ({
  default: function SurveyBuilderStub() {
    return React.createElement('div', null, 'SurveyBuilder');
  },
}));

// ─── Import component under test AFTER mocks ─────────────────────────────────

import ResponseAnalytics from '@/app/portal/surveys/[id]/_components/ResponseAnalytics';
import type { Survey, SurveyResponse, SurveyResponseStats } from '@/app/portal/surveys/[id]/_lib/api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSurvey(overrides: Partial<Survey> = {}): Survey {
  return {
    id: 1,
    title: 'Test Survey',
    slug: 'test-survey',
    description: null,
    fields: [],
    status: 'published',
    color: '#2563eb',
    brandingProfileId: null,
    styling: null,
    thankYouTitle: 'Thank you!',
    thankYouMessage: 'We got your response.',
    redirectUrl: null,
    requireEmail: false,
    allowMultiple: false,
    publishResults: false,
    certificateEnabled: false,
    consentField: null,
    notifyOnResponse: false,
    notifyDigest: 'none',
    closesAt: null,
    maxResponses: null,
    linkedType: null,
    linkedId: null,
    recommendation: null,
    scoringConfig: null,
    responseCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeResponse(overrides: Partial<SurveyResponse> = {}): SurveyResponse {
  return {
    id: 1,
    formName: 'Test Survey',
    answers: {},
    respondentEmail: null,
    respondentName: null,
    source: 'link',
    completedAt: '2024-06-01T10:00:00Z',
    createdAt: '2024-06-01T10:00:00Z',
    ...overrides,
  };
}

function makeStats(overrides: Partial<SurveyResponseStats> = {}): SurveyResponseStats {
  return {
    total: 10,
    completed: 8,
    withEmail: 3,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ResponseAnalytics — empty state', () => {
  it('renders empty state when no responses', () => {
    const { container } = render(
      <ResponseAnalytics survey={makeSurvey()} responses={[]} stats={makeStats()} />,
    );
    expect(container.textContent).toContain('No responses to analyze yet');
  });

  it('does not render summary cards in empty state', () => {
    render(<ResponseAnalytics survey={makeSurvey()} responses={[]} stats={makeStats()} />);
    expect(screen.queryByText('Total Responses')).toBeNull();
  });
});

describe('ResponseAnalytics — summary cards', () => {
  it('displays total, completed, withEmail from stats', () => {
    const stats = makeStats({ total: 20, completed: 15, withEmail: 7 });
    render(
      <ResponseAnalytics survey={makeSurvey()} responses={[makeResponse()]} stats={stats} />,
    );
    expect(screen.getByText('20')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('Total Responses')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('Identified')).toBeTruthy();
  });

  it('shows completion rate as percentage', () => {
    const stats = makeStats({ total: 4, completed: 3, withEmail: 1 });
    render(
      <ResponseAnalytics survey={makeSurvey()} responses={[makeResponse()]} stats={stats} />,
    );
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('Completion Rate')).toBeTruthy();
  });

  it('shows 0% completion rate when total is 0 (edge case guard)', () => {
    const stats = makeStats({ total: 0, completed: 0, withEmail: 0 });
    // Need at least one response to get past the empty-state check
    const resp = makeResponse();
    render(<ResponseAnalytics survey={makeSurvey()} responses={[resp]} stats={stats} />);
    expect(screen.getByText('0%')).toBeTruthy();
  });
});

describe('ResponseAnalytics — AI summary panel gating', () => {
  it('shows AiSummaryPanel when text field has non-empty answer', () => {
    const survey = makeSurvey({
      fields: [{ id: 'q1', type: 'text', label: 'Feedback', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const response = makeResponse({ answers: { q1: 'Great survey!' } });
    render(<ResponseAnalytics survey={survey} responses={[response]} stats={makeStats()} />);
    expect(screen.getByTestId('ai-summary-panel')).toBeTruthy();
  });

  it('shows AiSummaryPanel when textarea field has non-empty answer', () => {
    const survey = makeSurvey({
      fields: [{ id: 'q2', type: 'textarea', label: 'Comments', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const response = makeResponse({ answers: { q2: 'Very detailed feedback here.' } });
    render(<ResponseAnalytics survey={survey} responses={[response]} stats={makeStats()} />);
    expect(screen.getByTestId('ai-summary-panel')).toBeTruthy();
  });

  it('does NOT show AiSummaryPanel when text answer is only whitespace', () => {
    const survey = makeSurvey({
      fields: [{ id: 'q1', type: 'text', label: 'Feedback', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const response = makeResponse({ answers: { q1: '   ' } });
    render(<ResponseAnalytics survey={survey} responses={[response]} stats={makeStats()} />);
    expect(screen.queryByTestId('ai-summary-panel')).toBeNull();
  });

  it('does NOT show AiSummaryPanel when there are no text-type fields', () => {
    const survey = makeSurvey({
      fields: [{ id: 'q1', type: 'rating', label: 'Rate us', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const response = makeResponse({ answers: { q1: 5 } });
    render(<ResponseAnalytics survey={survey} responses={[response]} stats={makeStats()} />);
    expect(screen.queryByTestId('ai-summary-panel')).toBeNull();
  });

  it('does NOT show AiSummaryPanel when text fields have no answers', () => {
    const survey = makeSurvey({
      fields: [{ id: 'q1', type: 'text', label: 'Feedback', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const response = makeResponse({ answers: {} });
    render(<ResponseAnalytics survey={survey} responses={[response]} stats={makeStats()} />);
    expect(screen.queryByTestId('ai-summary-panel')).toBeNull();
  });

  it('passes correct surveyId to AiSummaryPanel', () => {
    const survey = makeSurvey({
      id: 42,
      fields: [{ id: 'q1', type: 'text', label: 'Feedback', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const response = makeResponse({ answers: { q1: 'Hello' } });
    render(<ResponseAnalytics survey={survey} responses={[response]} stats={makeStats()} />);
    const panel = screen.getByTestId('ai-summary-panel');
    expect(panel.getAttribute('data-survey-id')).toBe('42');
  });
});

describe('ResponseAnalytics — field filtering', () => {
  it('filters out heading fields from per-question analytics', () => {
    const survey = makeSurvey({
      fields: [
        { id: 'h1', type: 'heading', label: 'Section Header', placeholder: '', helpText: '', required: false, options: [], order: 0 },
        { id: 'q1', type: 'text', label: 'Your Name', placeholder: '', helpText: '', required: false, options: [], order: 1 },
      ] as any,
    });
    const response = makeResponse({ answers: { q1: 'Alice' } });
    render(<ResponseAnalytics survey={survey} responses={[response]} stats={makeStats()} />);
    expect(screen.queryByText('Section Header')).toBeNull();
    expect(screen.getByText('Your Name')).toBeTruthy();
  });

  it('filters out page_break fields', () => {
    const survey = makeSurvey({
      fields: [
        { id: 'pb1', type: 'page_break', label: 'Page Break', placeholder: '', helpText: '', required: false, options: [], order: 0 },
        { id: 'q1', type: 'email', label: 'Email', placeholder: '', helpText: '', required: false, options: [], order: 1 },
      ] as any,
    });
    const response = makeResponse({ answers: { q1: 'test@example.com' } });
    render(<ResponseAnalytics survey={survey} responses={[response]} stats={makeStats()} />);
    expect(screen.queryByText('Page Break')).toBeNull();
    expect(screen.getByText('Email')).toBeTruthy();
  });
});

describe('ResponseAnalytics — rating field', () => {
  it('renders average rating and star distribution', () => {
    const survey = makeSurvey({
      fields: [{ id: 'r1', type: 'rating', label: 'Overall Rating', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const responses = [
      makeResponse({ id: 1, answers: { r1: 5 } }),
      makeResponse({ id: 2, answers: { r1: 4 } }),
      makeResponse({ id: 3, answers: { r1: 3 } }),
    ];
    render(<ResponseAnalytics survey={survey} responses={responses} stats={makeStats({ total: 3, completed: 3, withEmail: 0 })} />);
    expect(screen.getByText('Overall Rating')).toBeTruthy();
    // avg = (5+4+3)/3 = 4.0
    expect(screen.getByText('4.0')).toBeTruthy();
    // shows "(3 ratings)"
    expect(screen.getByText('(3 ratings)')).toBeTruthy();
  });

  it('shows answered count vs total', () => {
    const survey = makeSurvey({
      fields: [{ id: 'r1', type: 'rating', label: 'Rating', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const responses = [
      makeResponse({ id: 1, answers: { r1: 5 } }),
      makeResponse({ id: 2, answers: {} }),
    ];
    const { container } = render(
      <ResponseAnalytics survey={survey} responses={responses} stats={makeStats({ total: 2, completed: 1, withEmail: 0 })} />,
    );
    expect(container.textContent).toContain('1 of 2 answered');
  });
});

describe('ResponseAnalytics — slider field', () => {
  it('renders slider average and range info', () => {
    const survey = makeSurvey({
      fields: [{ id: 's1', type: 'slider', label: 'Budget', placeholder: '', helpText: '', required: false, options: [], min: 0, max: 100, order: 0 }] as any,
    });
    const responses = [
      makeResponse({ id: 1, answers: { s1: 40 } }),
      makeResponse({ id: 2, answers: { s1: 60 } }),
    ];
    const { container } = render(
      <ResponseAnalytics survey={survey} responses={responses} stats={makeStats()} />,
    );
    // avg = 50.0
    expect(container.textContent).toContain('50.0');
    expect(container.textContent).toContain('avg');
    expect(container.textContent).toContain('Range:');
  });
});

describe('ResponseAnalytics — radio/select/checkbox field', () => {
  it('renders bar chart with option counts for radio', () => {
    const survey = makeSurvey({
      fields: [{ id: 'c1', type: 'radio', label: 'Favorite Color', placeholder: '', helpText: '', required: false, options: ['Red', 'Blue', 'Green'], order: 0 }] as any,
    });
    const responses = [
      makeResponse({ id: 1, answers: { c1: 'Red' } }),
      makeResponse({ id: 2, answers: { c1: 'Blue' } }),
      makeResponse({ id: 3, answers: { c1: 'Red' } }),
    ];
    render(<ResponseAnalytics survey={survey} responses={responses} stats={makeStats()} />);
    expect(screen.getByText('Red')).toBeTruthy();
    expect(screen.getByText('Blue')).toBeTruthy();
    expect(screen.getByText('Green')).toBeTruthy();
    expect(screen.getByText('Favorite Color')).toBeTruthy();
  });

  it('renders bar chart for select type', () => {
    const survey = makeSurvey({
      fields: [{ id: 's1', type: 'select', label: 'Region', placeholder: '', helpText: '', required: false, options: ['North', 'South'], order: 0 }] as any,
    });
    const responses = [
      makeResponse({ id: 1, answers: { s1: 'North' } }),
    ];
    render(<ResponseAnalytics survey={survey} responses={responses} stats={makeStats()} />);
    expect(screen.getByText('Region')).toBeTruthy();
    expect(screen.getByText('North')).toBeTruthy();
    expect(screen.getByText('South')).toBeTruthy();
  });

  it('counts checkbox multi-value arrays correctly', () => {
    const survey = makeSurvey({
      fields: [{ id: 'cb1', type: 'checkbox', label: 'Interests', placeholder: '', helpText: '', required: false, options: ['Music', 'Sports', 'Art'], order: 0 }] as any,
    });
    const responses = [
      makeResponse({ id: 1, answers: { cb1: ['Music', 'Sports'] } }),
      makeResponse({ id: 2, answers: { cb1: ['Music', 'Art'] } }),
    ];
    const { container } = render(
      <ResponseAnalytics survey={survey} responses={responses} stats={makeStats()} />,
    );
    expect(container.textContent).toContain('Music');
    expect(container.textContent).toContain('Sports');
    expect(container.textContent).toContain('Art');
  });
});

describe('ResponseAnalytics — toggle field', () => {
  it('renders yes/no counts for toggle', () => {
    const survey = makeSurvey({
      fields: [{ id: 't1', type: 'toggle', label: 'Agree?', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const responses = [
      makeResponse({ id: 1, answers: { t1: true } }),
      makeResponse({ id: 2, answers: { t1: false } }),
      makeResponse({ id: 3, answers: { t1: 'true' } }),
    ];
    const { container } = render(
      <ResponseAnalytics survey={survey} responses={responses} stats={makeStats()} />,
    );
    expect(container.textContent).toContain('Yes: 2');
    expect(container.textContent).toContain('No: 1');
  });

  it('shows 0 yes/no when no toggle answers', () => {
    const survey = makeSurvey({
      fields: [{ id: 't1', type: 'toggle', label: 'Agree?', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    // Has one response but no toggle answer — allVals is empty
    const responses = [makeResponse({ id: 1, answers: {} })];
    const { container } = render(
      <ResponseAnalytics survey={survey} responses={responses} stats={makeStats()} />,
    );
    expect(container.textContent).toContain('Yes: 0');
    expect(container.textContent).toContain('No: 0');
  });
});

describe('ResponseAnalytics — text/textarea/email/phone/url/number/date fields', () => {
  const textTypes = ['text', 'textarea', 'email', 'phone', 'url', 'number', 'date'] as const;

  it.each(textTypes)('renders recent responses list for %s field', (fieldType) => {
    const survey = makeSurvey({
      fields: [{ id: 'f1', type: fieldType, label: `Field ${fieldType}`, placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const responses = [
      makeResponse({ id: 1, answers: { f1: 'response-value' } }),
    ];
    render(<ResponseAnalytics survey={survey} responses={responses} stats={makeStats()} />);
    expect(screen.getByText('response-value')).toBeTruthy();
  });

  it('shows only first 10 responses and a "+ N more" message', () => {
    const survey = makeSurvey({
      fields: [{ id: 'f1', type: 'text', label: 'Open Text', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const responses = Array.from({ length: 13 }, (_, i) =>
      makeResponse({ id: i + 1, answers: { f1: `answer-${i + 1}` }, createdAt: `2024-06-0${Math.min(i + 1, 9)}T10:00:00Z` }),
    );
    const { container } = render(
      <ResponseAnalytics survey={survey} responses={responses} stats={makeStats()} />,
    );
    // Should show first 10
    expect(screen.getByText('answer-1')).toBeTruthy();
    expect(screen.getByText('answer-10')).toBeTruthy();
    // Should NOT show 11th
    expect(screen.queryByText('answer-11')).toBeNull();
    // Should show "+ 3 more responses"
    expect(container.textContent).toContain('+ 3 more responses');
  });

  it('does not show "+ more" when exactly 10 responses', () => {
    const survey = makeSurvey({
      fields: [{ id: 'f1', type: 'text', label: 'Open Text', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const responses = Array.from({ length: 10 }, (_, i) =>
      makeResponse({ id: i + 1, answers: { f1: `answer-${i + 1}` } }),
    );
    const { container } = render(
      <ResponseAnalytics survey={survey} responses={responses} stats={makeStats()} />,
    );
    expect(container.textContent).not.toContain('more responses');
  });
});

describe('ResponseAnalytics — response timeline', () => {
  it('renders Response Timeline section heading', () => {
    const responses = [makeResponse({ id: 1, createdAt: '2024-06-01T10:00:00Z' })];
    render(<ResponseAnalytics survey={makeSurvey()} responses={responses} stats={makeStats()} />);
    expect(screen.getByText('Response Timeline')).toBeTruthy();
  });

  it('groups responses by date and renders a bar per date', () => {
    const responses = [
      makeResponse({ id: 1, createdAt: '2024-06-01T10:00:00Z' }),
      makeResponse({ id: 2, createdAt: '2024-06-01T12:00:00Z' }),
      makeResponse({ id: 3, createdAt: '2024-06-02T09:00:00Z' }),
    ];
    const { container } = render(
      <ResponseAnalytics survey={makeSurvey()} responses={responses} stats={makeStats()} />,
    );
    // Two distinct dates → two count labels (2 and 1)
    const twos = container.querySelectorAll('span');
    const countTexts = Array.from(twos).map(s => s.textContent);
    expect(countTexts).toContain('2');
    expect(countTexts).toContain('1');
  });
});

describe('ResponseAnalytics — response sources', () => {
  it('renders Response Sources section heading', () => {
    const responses = [makeResponse({ id: 1, source: 'link' })];
    render(<ResponseAnalytics survey={makeSurvey()} responses={responses} stats={makeStats()} />);
    expect(screen.getByText('Response Sources')).toBeTruthy();
  });

  it('shows each source with its count', () => {
    const responses = [
      makeResponse({ id: 1, source: 'link' }),
      makeResponse({ id: 2, source: 'email' }),
      makeResponse({ id: 3, source: 'link' }),
    ];
    const { container } = render(
      <ResponseAnalytics survey={makeSurvey()} responses={responses} stats={makeStats()} />,
    );
    expect(container.textContent).toContain('link: 2');
    expect(container.textContent).toContain('email: 1');
  });

  it('uses fallback color for unknown sources', () => {
    const responses = [makeResponse({ id: 1, source: 'custom-source' })];
    const { container } = render(
      <ResponseAnalytics survey={makeSurvey()} responses={responses} stats={makeStats()} />,
    );
    // Should still render the source label without crashing
    expect(container.textContent).toContain('custom-source: 1');
  });
});

describe('ResponseAnalytics — survey color', () => {
  it('uses survey color for star fill (applied via style attribute)', () => {
    const survey = makeSurvey({
      color: '#ff0000',
      fields: [{ id: 'r1', type: 'rating', label: 'Rating', placeholder: '', helpText: '', required: false, options: [], order: 0 }] as any,
    });
    const responses = [makeResponse({ id: 1, answers: { r1: 5 } })];
    const { container } = render(
      <ResponseAnalytics survey={survey} responses={responses} stats={makeStats()} />,
    );
    // React renders #ff0000 as "rgb(255, 0, 0)" in jsdom inline styles.
    // Select all elements that carry an inline style referencing a color.
    const styledEls = container.querySelectorAll('[style]');
    const hasRedColor = Array.from(styledEls).some(
      (el) =>
        (el as HTMLElement).style.color?.includes('255') ||
        (el as HTMLElement).style.backgroundColor?.includes('255'),
    );
    expect(hasRedColor).toBe(true);
  });
});

describe('ResponseAnalytics — multiple fields rendered together', () => {
  it('renders all non-heading question cards', () => {
    const survey = makeSurvey({
      fields: [
        { id: 'h1', type: 'heading', label: 'Intro', placeholder: '', helpText: '', required: false, options: [], order: 0 },
        { id: 'q1', type: 'text', label: 'Name', placeholder: '', helpText: '', required: false, options: [], order: 1 },
        { id: 'q2', type: 'rating', label: 'Score', placeholder: '', helpText: '', required: false, options: [], order: 2 },
        { id: 'q3', type: 'toggle', label: 'Agree', placeholder: '', helpText: '', required: false, options: [], order: 3 },
      ] as any,
    });
    const responses = [
      makeResponse({ id: 1, answers: { q1: 'Alice', q2: 4, q3: true } }),
    ];
    render(<ResponseAnalytics survey={survey} responses={responses} stats={makeStats()} />);
    // heading filtered; others shown
    expect(screen.queryByText('Intro')).toBeNull();
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Score')).toBeTruthy();
    expect(screen.getByText('Agree')).toBeTruthy();
  });
});
