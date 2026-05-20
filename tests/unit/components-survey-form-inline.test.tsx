// @vitest-environment jsdom
/**
 * Unit tests for SurveyFormInline (components/blocks/render/SurveyFormInline.tsx).
 *
 * Drives the public `/s/<slug>` survey widget. The component:
 *   - Fetches survey definition from GET /api/surveys/<slug>
 *   - Renders branded multi-page form with conditional logic
 *   - Posts answers to POST /api/surveys/<slug>
 *   - Renders thank-you state (optionally with recommendation block)
 *
 * Strategy:
 *   - Stub fetch with URL-routing fake
 *   - Mock SurveyRecommendationRenderer to avoid pulling in deck deps
 *   - Walk loading, error, single-page submit, multi-page next/back,
 *     each field type, conditional showIf, branching goToPage,
 *     validation, branding/styling cascade, and submitted/redirect paths.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

// Mock recommendation renderer — keeps deck/pitch deps out of unit env.
vi.mock('@/components/pitch-deck/SurveyRecommendationRenderer', () => ({
  SurveyRecommendationRenderer: (props: any) => (
    <div data-testid="rec-mock" data-eyebrow={props.config?.eyebrow || ''} />
  ),
}));

import { SurveyFormInline } from '@/components/blocks/render/SurveyFormInline';

// ---------------------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------------------

type RouteHandler = (url: string, init?: RequestInit) => unknown;

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function makeFetch(routes: Record<string, RouteHandler>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const sorted = Object.keys(routes).sort((a, b) => b.length - a.length);
    for (const pattern of sorted) {
      if (url.includes(pattern)) return routes[pattern](url, init);
    }
    return jsonResponse({ success: true, data: [] });
  });
}

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeField(overrides: Partial<any> = {}): any {
  return {
    id: 'q1',
    type: 'text',
    label: 'Question 1',
    placeholder: '',
    helpText: '',
    required: false,
    options: [],
    order: 0,
    ...overrides,
  };
}

function makeSurvey(overrides: Partial<any> = {}): any {
  return {
    id: 1,
    title: 'Test Survey',
    description: 'A test survey',
    fields: [],
    color: '#2563eb',
    requireEmail: false,
    thankYouTitle: 'Thanks!',
    thankYouMessage: 'Got it.',
    redirectUrl: null,
    branding: null,
    styling: null,
    cssVars: null,
    recommendation: null,
    ...overrides,
  };
}

async function renderSurvey(
  surveyOverrides: Partial<any> = {},
  routeOverrides: Record<string, RouteHandler> = {},
  props: Partial<React.ComponentProps<typeof SurveyFormInline>> = {},
) {
  const survey = makeSurvey(surveyOverrides);
  const routes: Record<string, RouteHandler> = {
    '/api/surveys/test-slug': () => jsonResponse({ success: true, data: survey }),
    ...routeOverrides,
  };
  const fetchMock = makeFetch(routes);
  (global as any).fetch = fetchMock;

  let utils: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<SurveyFormInline slug="test-slug" {...props} />);
    await flushPromises();
  });
  return { ...utils!, fetchMock, survey };
}

// ---------------------------------------------------------------------------
// Tests — loading & error
// ---------------------------------------------------------------------------

describe('SurveyFormInline — loading and error', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('shows spinner while fetch is pending', () => {
    (global as any).fetch = vi.fn(() => new Promise(() => {}));
    const { container } = render(<SurveyFormInline slug="test-slug" />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows error state when fetch reports success:false', async () => {
    (global as any).fetch = vi.fn(async () =>
      jsonResponse({ success: false, message: 'Not available' }),
    );
    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<SurveyFormInline slug="test-slug" />);
      await flushPromises();
    });
    expect(utils!.container.textContent).toContain('Not available');
    expect(utils!.container.textContent).toContain('error_outline');
  });

  it('shows fallback error text when success:false and no message', async () => {
    (global as any).fetch = vi.fn(async () =>
      jsonResponse({ success: false }),
    );
    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<SurveyFormInline slug="test-slug" />);
      await flushPromises();
    });
    expect(utils!.container.textContent).toContain('Survey not available');
  });

  it('shows error when fetch rejects', async () => {
    (global as any).fetch = vi.fn(async () => {
      throw new Error('network');
    });
    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<SurveyFormInline slug="test-slug" />);
      await flushPromises();
    });
    expect(utils!.container.textContent).toContain('Failed to load survey');
  });
});

// ---------------------------------------------------------------------------
// Tests — initial render
// ---------------------------------------------------------------------------

describe('SurveyFormInline — initial render', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('renders title and description by default', async () => {
    const { container } = await renderSurvey({
      title: 'My Survey',
      description: 'Please answer',
    });
    expect(container.textContent).toContain('My Survey');
    expect(container.textContent).toContain('Please answer');
  });

  it('hides title when showPageTitle=false', async () => {
    const { container } = await renderSurvey(
      { title: 'Hidden Title' },
      {},
      { showPageTitle: false },
    );
    expect(container.querySelector('h1')).toBeFalsy();
  });

  it('hides description when showDescription=false', async () => {
    const { container } = await renderSurvey(
      { title: 'T', description: 'Desc here' },
      {},
      { showDescription: false },
    );
    expect(container.textContent).not.toContain('Desc here');
  });

  it('renders submit button by default (single page)', async () => {
    const { container } = await renderSurvey({
      fields: [makeField()],
    });
    const submit = container.querySelector('button[type="submit"]');
    expect(submit).toBeTruthy();
    expect(submit?.textContent).toContain('Submit');
  });

  it('renders email + name when requireEmail is true', async () => {
    const { container } = await renderSurvey({ requireEmail: true });
    expect(container.querySelector('input[type="email"]')).toBeTruthy();
    expect(container.textContent).toContain('Your Email');
    expect(container.textContent).toContain('Your Name');
  });
});

// ---------------------------------------------------------------------------
// Tests — field types
// ---------------------------------------------------------------------------

describe('SurveyFormInline — field renderers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('renders text input', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'text', label: 'Name' })],
    });
    expect(container.querySelector('input[type="text"]')).toBeTruthy();
  });

  it('renders email input', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'email', label: 'Email' })],
    });
    const inputs = container.querySelectorAll('input[type="email"]');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders tel input for phone type', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'phone', label: 'Phone' })],
    });
    expect(container.querySelector('input[type="tel"]')).toBeTruthy();
  });

  it('renders url input', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'url', label: 'URL' })],
    });
    expect(container.querySelector('input[type="url"]')).toBeTruthy();
  });

  it('renders textarea', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'textarea', label: 'Comments' })],
    });
    expect(container.querySelector('textarea')).toBeTruthy();
  });

  it('renders number input', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'number', label: 'Age', min: 0, max: 99 })],
    });
    const num = container.querySelector('input[type="number"]');
    expect(num).toBeTruthy();
    expect(num?.getAttribute('min')).toBe('0');
    expect(num?.getAttribute('max')).toBe('99');
  });

  it('renders date input', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'date', label: 'When' })],
    });
    expect(container.querySelector('input[type="date"]')).toBeTruthy();
  });

  it('renders select with options', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'select', label: 'Pick', options: ['A', 'B', 'C'] })],
    });
    const sel = container.querySelector('select');
    expect(sel).toBeTruthy();
    expect(sel?.querySelectorAll('option').length).toBe(4); // 3 + placeholder
  });

  it('renders radio options', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'radio', label: 'Pick', options: ['X', 'Y'] })],
    });
    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(2);
  });

  it('renders checkbox options', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'checkbox', label: 'Many', options: ['a', 'b', 'c'] })],
    });
    const cb = container.querySelectorAll('input[type="checkbox"]');
    expect(cb.length).toBe(3);
  });

  it('renders toggle button', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'toggle', label: 'On?' })],
    });
    // Default "No" state
    expect(container.textContent).toContain('No');
  });

  it('renders rating stars (5)', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'rating', label: 'Rate' })],
    });
    // 5 star buttons (excluding submit)
    const buttons = container.querySelectorAll('button[type="button"]');
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });

  it('renders slider with min/max', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'f', type: 'slider', label: 'Vol', min: 10, max: 200, step: 5 })],
    });
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(range).toBeTruthy();
    expect(range.min).toBe('10');
    expect(range.max).toBe('200');
    expect(range.step).toBe('5');
  });

  it('renders heading field (no input)', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'h1', type: 'heading', label: 'Section A' })],
    });
    const h3 = container.querySelector('h3');
    expect(h3?.textContent).toContain('Section A');
  });

  it('returns null for unknown field type', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'x', type: 'unknown-type', label: 'X' })],
    });
    // Label rendered, but no input
    expect(container.textContent).toContain('X');
    expect(container.querySelector('input,select,textarea')).toBeFalsy();
  });

  it('marks required field with asterisk', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'r', type: 'text', label: 'Need', required: true })],
    });
    expect(container.textContent).toContain('*');
  });

  it('renders help text when present', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'r', type: 'text', label: 'Q', helpText: 'tip text' })],
    });
    expect(container.textContent).toContain('tip text');
  });
});

// ---------------------------------------------------------------------------
// Tests — interactions
// ---------------------------------------------------------------------------

describe('SurveyFormInline — interactions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('updates text input answer on change', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'name', type: 'text', label: 'Name' })],
    });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
    });
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Alice');
  });

  it('toggles a checkbox option on/off', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'cb', type: 'checkbox', label: 'C', options: ['a', 'b'] })],
    });
    const cb = container.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement;
    await act(async () => {
      fireEvent.click(cb);
    });
    expect((container.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement).checked).toBe(true);
    await act(async () => {
      fireEvent.click(container.querySelectorAll('input[type="checkbox"]')[0]);
    });
    expect((container.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement).checked).toBe(false);
  });

  it('selects a radio option', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'r', type: 'radio', label: 'R', options: ['x', 'y'] })],
    });
    const radio = container.querySelectorAll('input[type="radio"]')[1] as HTMLInputElement;
    await act(async () => {
      fireEvent.click(radio);
    });
    expect((container.querySelectorAll('input[type="radio"]')[1] as HTMLInputElement).checked).toBe(true);
  });

  it('toggle button switches state', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 't', type: 'toggle', label: 'T' })],
    });
    expect(container.textContent).toContain('No');
    const btn = container.querySelectorAll('button[type="button"]')[0] as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(container.textContent).toContain('Yes');
  });

  it('rating button updates value', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'rt', type: 'rating', label: 'Rate' })],
    });
    const stars = container.querySelectorAll('button[type="button"]');
    await act(async () => {
      fireEvent.click(stars[2]); // 3rd star
    });
    // No exception, button still rendered
    expect(container.querySelectorAll('button[type="button"]').length).toBeGreaterThanOrEqual(5);
  });

  it('slider updates value', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 's', type: 'slider', label: 'S', min: 0, max: 10 })],
    });
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(range, { target: { value: '7' } });
    });
    expect((container.querySelector('input[type="range"]') as HTMLInputElement).value).toBe('7');
  });

  it('updates email and name inputs when requireEmail', async () => {
    const { container } = await renderSurvey({ requireEmail: true });
    const email = container.querySelector('input[type="email"]') as HTMLInputElement;
    const text = container.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(email, { target: { value: 'a@b.com' } });
      fireEvent.change(text, { target: { value: 'Bob' } });
    });
    expect((container.querySelector('input[type="email"]') as HTMLInputElement).value).toBe('a@b.com');
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Bob');
  });
});

// ---------------------------------------------------------------------------
// Tests — validation
// ---------------------------------------------------------------------------

describe('SurveyFormInline — validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('shows error on submit if required field empty', async () => {
    const { container } = await renderSurvey({
      fields: [makeField({ id: 'r', type: 'text', label: 'Required Q', required: true })],
    });
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(container.textContent).toContain('Required Q is required');
  });

  it('shows error if requireEmail but no email entered', async () => {
    const { container } = await renderSurvey({ requireEmail: true });
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(container.textContent).toContain('Email is required');
  });

  it('skips hidden (showIf failing) fields during validation', async () => {
    const { container } = await renderSurvey({
      fields: [
        makeField({ id: 'gate', type: 'select', label: 'Gate', options: ['yes', 'no'], order: 0 }),
        makeField({
          id: 'hidden',
          type: 'text',
          label: 'Hidden',
          required: true,
          order: 1,
          showIf: { fieldId: 'gate', values: ['yes'] },
        }),
      ],
    });
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
    // Hidden field shouldn't block submit (will hit API instead)
    expect(container.textContent).not.toContain('Hidden is required');
  });
});

// ---------------------------------------------------------------------------
// Tests — submit flow
// ---------------------------------------------------------------------------

describe('SurveyFormInline — submit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('submits successfully and shows thank-you', async () => {
    const survey = makeSurvey({
      fields: [makeField({ id: 'q', type: 'text', label: 'Q' })],
      thankYouTitle: 'All done',
      thankYouMessage: 'Bye',
    });
    const fetchMock = makeFetch({
      '/api/surveys/test-slug': (url, init) => {
        if (init?.method === 'POST') {
          return jsonResponse({
            success: true,
            data: {
              thankYouTitle: 'All done',
              thankYouMessage: 'Bye',
              redirectUrl: null,
            },
          });
        }
        return jsonResponse({ success: true, data: survey });
      },
    });
    (global as any).fetch = fetchMock;

    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<SurveyFormInline slug="test-slug" />);
      await flushPromises();
    });
    const form = utils!.container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
      await flushPromises();
    });
    expect(utils!.container.textContent).toContain('All done');
    expect(utils!.container.textContent).toContain('Bye');
  });

  it('shows error when submit returns success:false', async () => {
    const survey = makeSurvey({ fields: [makeField({ id: 'q' })] });
    const fetchMock = makeFetch({
      '/api/surveys/test-slug': (url, init) => {
        if (init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Server kaboom' });
        }
        return jsonResponse({ success: true, data: survey });
      },
    });
    (global as any).fetch = fetchMock;

    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<SurveyFormInline slug="test-slug" />);
      await flushPromises();
    });
    await act(async () => {
      fireEvent.submit(utils!.container.querySelector('form') as HTMLFormElement);
      await flushPromises();
    });
    expect(utils!.container.textContent).toContain('Server kaboom');
  });

  it('redirects when redirectUrl is present', async () => {
    const survey = makeSurvey({ fields: [makeField({ id: 'q' })] });
    // Mock window.location.href setter
    const originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = { href: '' };

    const fetchMock = makeFetch({
      '/api/surveys/test-slug': (url, init) => {
        if (init?.method === 'POST') {
          return jsonResponse({
            success: true,
            data: { redirectUrl: 'https://example.com/thanks' },
          });
        }
        return jsonResponse({ success: true, data: survey });
      },
    });
    (global as any).fetch = fetchMock;

    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<SurveyFormInline slug="test-slug" />);
      await flushPromises();
    });
    await act(async () => {
      fireEvent.submit(utils!.container.querySelector('form') as HTMLFormElement);
      await flushPromises();
    });
    expect(window.location.href).toBe('https://example.com/thanks');
    (window as any).location = originalLocation;
  });

  it('uses fallback thank-you when API omits fields', async () => {
    const survey = makeSurvey({ fields: [makeField({ id: 'q' })] });
    const fetchMock = makeFetch({
      '/api/surveys/test-slug': (url, init) => {
        if (init?.method === 'POST') {
          return jsonResponse({ success: true, data: {} });
        }
        return jsonResponse({ success: true, data: survey });
      },
    });
    (global as any).fetch = fetchMock;

    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<SurveyFormInline slug="test-slug" />);
      await flushPromises();
    });
    await act(async () => {
      fireEvent.submit(utils!.container.querySelector('form') as HTMLFormElement);
      await flushPromises();
    });
    expect(utils!.container.textContent).toContain('Thank you!');
  });
});

// ---------------------------------------------------------------------------
// Tests — multi-page (page_break)
// ---------------------------------------------------------------------------

describe('SurveyFormInline — multi-page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('shows Next button and progress bar with multiple pages', async () => {
    const { container } = await renderSurvey({
      fields: [
        makeField({ id: 'q1', type: 'text', label: 'P1', order: 0 }),
        makeField({ id: 'pb', type: 'page_break', label: '', order: 1 }),
        makeField({ id: 'q2', type: 'text', label: 'P2', order: 2 }),
      ],
    });
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some(b => b.textContent?.includes('Next'))).toBe(true);
    expect(container.textContent).toContain('Page 1 of 2');
    expect(container.textContent).toContain('50%');
  });

  it('advances to next page on Next click', async () => {
    const { container } = await renderSurvey({
      fields: [
        makeField({ id: 'q1', type: 'text', label: 'PageOneQ', order: 0 }),
        makeField({ id: 'pb', type: 'page_break', label: '', order: 1 }),
        makeField({ id: 'q2', type: 'text', label: 'PageTwoQ', order: 2 }),
      ],
    });
    const nextBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(nextBtn);
    });
    expect(container.textContent).toContain('PageTwoQ');
    expect(container.textContent).toContain('Page 2 of 2');
  });

  it('shows Back button on page > 0', async () => {
    const { container } = await renderSurvey({
      fields: [
        makeField({ id: 'q1', type: 'text', label: 'Q1', order: 0 }),
        makeField({ id: 'pb', type: 'page_break', label: '', order: 1 }),
        makeField({ id: 'q2', type: 'text', label: 'Q2', order: 2 }),
      ],
    });
    const nextBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(nextBtn);
    });
    const backBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Back'),
    );
    expect(backBtn).toBeTruthy();
  });

  it('Back returns to previous page', async () => {
    const { container } = await renderSurvey({
      fields: [
        makeField({ id: 'q1', type: 'text', label: 'PageOneQ', order: 0 }),
        makeField({ id: 'pb', type: 'page_break', label: '', order: 1 }),
        makeField({ id: 'q2', type: 'text', label: 'PageTwoQ', order: 2 }),
      ],
    });
    const next = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(next);
    });
    const back = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Back'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(back);
    });
    expect(container.textContent).toContain('PageOneQ');
    expect(container.textContent).toContain('Page 1 of 2');
  });

  it('blocks Next if required field empty on current page', async () => {
    const { container } = await renderSurvey({
      fields: [
        makeField({ id: 'r', type: 'text', label: 'Req', required: true, order: 0 }),
        makeField({ id: 'pb', type: 'page_break', label: '', order: 1 }),
        makeField({ id: 'q2', type: 'text', label: 'Q2', order: 2 }),
      ],
    });
    const next = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(next);
    });
    expect(container.textContent).toContain('Req is required');
  });

  it('shows Submit (not Next) on the last page', async () => {
    const { container } = await renderSurvey({
      fields: [
        makeField({ id: 'q1', type: 'text', label: 'Q1', order: 0 }),
        makeField({ id: 'pb', type: 'page_break', label: '', order: 1 }),
        makeField({ id: 'q2', type: 'text', label: 'Q2', order: 2 }),
      ],
    });
    const next = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(next);
    });
    const submit = container.querySelector('button[type="submit"]');
    expect(submit?.textContent).toContain('Submit');
  });
});

// ---------------------------------------------------------------------------
// Tests — branching (goToPage)
// ---------------------------------------------------------------------------

describe('SurveyFormInline — branching', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('jumps to mapped page when select value has goToPage', async () => {
    const { container } = await renderSurvey({
      fields: [
        makeField({
          id: 'route',
          type: 'select',
          label: 'Pick',
          options: ['skip', 'normal'],
          goToPage: { skip: 2 },
          order: 0,
        }),
        makeField({ id: 'pb1', type: 'page_break', label: '', order: 1 }),
        makeField({ id: 'q2', type: 'text', label: 'MiddlePage', order: 2 }),
        makeField({ id: 'pb2', type: 'page_break', label: '', order: 3 }),
        makeField({ id: 'q3', type: 'text', label: 'EndPage', order: 4 }),
      ],
    });
    const select = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'skip' } });
    });
    const next = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(next);
    });
    expect(container.textContent).toContain('EndPage');
  });
});

// ---------------------------------------------------------------------------
// Tests — branding / styling
// ---------------------------------------------------------------------------

describe('SurveyFormInline — branding and styling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('applies branding logoUrl', async () => {
    const { container } = await renderSurvey({
      branding: {
        primaryColor: '#ff0000',
        secondaryColor: '#00ff00',
        accentColor: '#0000ff',
        backgroundColor: '#ffffff',
        textColor: '#111111',
        headingFont: 'Inter',
        bodyFont: 'Roboto',
        logoUrl: 'https://example.com/logo.png',
      },
    });
    const img = container.querySelector('img[alt="Logo"]');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/logo.png');
  });

  it('hides logo when showLogo=false', async () => {
    const { container } = await renderSurvey(
      {
        branding: {
          primaryColor: '',
          secondaryColor: '',
          accentColor: '',
          backgroundColor: '',
          textColor: '',
          headingFont: '',
          bodyFont: '',
          logoUrl: 'https://example.com/logo.png',
        },
      },
      {},
      { showLogo: false },
    );
    expect(container.querySelector('img[alt="Logo"]')).toBeFalsy();
  });

  it('applies styleOverrides borderRadius / colors', async () => {
    const { container } = await renderSurvey({}, {}, {
      styleOverrides: {
        primaryColor: '#abcdef',
        backgroundColor: '#222222',
        textColor: '#eeeeee',
        formBg: '#333333',
        inputBg: '#444444',
        headingFont: 'Lato',
        bodyFont: 'Open Sans',
        buttonBg: '#555555',
        buttonText: '#ffffff',
        buttonBorderRadius: '12px',
      },
    });
    // styleOverrides cascade through — accept hex or rgb form (jsdom may normalize).
    const html = container.innerHTML;
    // buttonBg #555555 → rgb(85, 85, 85); buttonBorderRadius 12px should appear.
    expect(html).toContain('12px');
    expect(html.includes('#555555') || html.includes('rgb(85, 85, 85)')).toBe(true);
  });

  it('applies cssVars to wrapper style', async () => {
    const { container } = await renderSurvey({
      cssVars: { '--foo': 'bar' },
    });
    // Just confirm render survived with cssVars
    expect(container.querySelector('h1')).toBeTruthy();
  });

  it('renders progress bar percentage', async () => {
    const { container } = await renderSurvey({
      fields: [
        makeField({ id: 'q1', order: 0 }),
        makeField({ id: 'pb', type: 'page_break', label: '', order: 1 }),
        makeField({ id: 'q2', order: 2 }),
        makeField({ id: 'pb2', type: 'page_break', label: '', order: 3 }),
        makeField({ id: 'q3', order: 4 }),
      ],
    });
    expect(container.textContent).toContain('Page 1 of 3');
    expect(container.textContent).toContain('33%');
  });
});

// ---------------------------------------------------------------------------
// Tests — recommendation block on thank-you
// ---------------------------------------------------------------------------

describe('SurveyFormInline — recommendation on submit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('renders recommendation when survey.recommendation is configured', async () => {
    const survey = makeSurvey({
      fields: [makeField({ id: 'q', type: 'text', label: 'Q' })],
      recommendation: { eyebrow: 'Your result', tiers: [] } as any,
    });
    const fetchMock = makeFetch({
      '/api/surveys/test-slug': (url, init) => {
        if (init?.method === 'POST') {
          return jsonResponse({
            success: true,
            data: { thankYouTitle: 'Done', thankYouMessage: '' },
          });
        }
        return jsonResponse({ success: true, data: survey });
      },
    });
    (global as any).fetch = fetchMock;

    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<SurveyFormInline slug="test-slug" />);
      await flushPromises();
    });
    await act(async () => {
      fireEvent.submit(utils!.container.querySelector('form') as HTMLFormElement);
      await flushPromises();
    });
    expect(utils!.container.querySelector('[data-testid="rec-mock"]')).toBeTruthy();
    expect(utils!.container.textContent).toContain('Done');
  });
});
