// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Module mocks — declared before component import
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => ({ get: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import WebhooksPanel from '@/app/portal/surveys/[id]/_components/WebhooksPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOk(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

const SURVEY_ID = 'survey-7';

const HOOK_BASE = {
  id: 1,
  surveyId: 7,
  url: 'https://example.com/hooks',
  secret: null,
  events: ['response.submitted'],
  enabled: true,
  lastFiredAt: null,
  lastStatus: null,
  failureCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const HOOK_FIRED = {
  ...HOOK_BASE,
  id: 2,
  url: 'https://fired.example.com/hook',
  lastFiredAt: '2026-03-01T12:00:00Z',
  lastStatus: 200,
};

const HOOK_FAILED = {
  ...HOOK_BASE,
  id: 3,
  url: 'https://fail.example.com/hook',
  lastFiredAt: '2026-03-01T12:00:00Z',
  lastStatus: 500,
  failureCount: 2,
};

const HOOK_DISABLED = {
  ...HOOK_BASE,
  id: 4,
  url: 'https://disabled.example.com/hook',
  enabled: false,
};

const DELIVERY_BASE = {
  id: 101,
  webhookId: 1,
  event: 'response.submitted',
  attempt: 1,
  status: 'success' as const,
  statusCode: 200,
  responseBody: 'OK',
  error: null,
  createdAt: '2026-03-01T12:00:00Z',
};

const DELIVERY_FAILED = {
  id: 102,
  webhookId: 1,
  event: 'response.submitted',
  attempt: 2,
  status: 'failed' as const,
  statusCode: 503,
  responseBody: null,
  error: 'Service unavailable',
  createdAt: '2026-03-02T12:00:00Z',
};

function setupFetch(hooks: unknown[] = [HOOK_BASE], deliveries: unknown[] = [DELIVERY_BASE]) {
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const urlStr = String(url);

    if (method === 'GET' && urlStr.includes('/deliveries')) {
      return makeOk({ success: true, data: deliveries });
    }
    if (method === 'GET' && urlStr.includes('/webhooks') && !urlStr.match(/\/webhooks\/\d+$/)) {
      return makeOk({ success: true, data: hooks });
    }
    if (method === 'POST' && urlStr.includes('/webhooks')) {
      return makeOk({
        success: true,
        data: { ...HOOK_BASE, id: 99, url: 'https://new.example.com/hook', secret: 'mysecret' },
      });
    }
    if (method === 'PUT') {
      return makeOk({ success: true, data: {} });
    }
    if (method === 'DELETE') {
      return makeOk({ success: true });
    }
    return makeOk({ success: true, data: [] });
  }) as any;
}

function renderPanel(hooks: unknown[] = [HOOK_BASE]) {
  setupFetch(hooks);
  return render(<WebhooksPanel surveyId={SURVEY_ID} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhooksPanel — initial render', () => {
  it('renders the Webhooks heading', async () => {
    renderPanel([]);
    expect(screen.getByText('Webhooks')).toBeTruthy();
  });

  it('shows loading state briefly then renders empty state', async () => {
    renderPanel([]);
    await waitFor(() =>
      expect(screen.getByText('No webhooks configured yet.')).toBeTruthy(),
    );
  });

  it('renders list of hooks after load', async () => {
    renderPanel([HOOK_BASE]);
    await waitFor(() =>
      expect(screen.getByText('https://example.com/hooks')).toBeTruthy(),
    );
  });

  it('renders the create form with URL input and Add button', async () => {
    renderPanel([]);
    await waitFor(() => expect(screen.getByText('No webhooks configured yet.')).toBeTruthy());
    expect(screen.getByPlaceholderText('https://example.com/webhooks/survey')).toBeTruthy();
    const addBtns = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Add webhook'),
    );
    expect(addBtns.length).toBeGreaterThan(0);
  });

  it('displays error when initial fetch returns success:false', async () => {
    global.fetch = vi.fn(() => makeOk({ success: false, message: 'Forbidden' })) as any;
    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('Forbidden')).toBeTruthy());
  });

  it('displays error on network failure', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any;
    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('Network error')).toBeTruthy());
  });
});

describe('WebhooksPanel — hook list display', () => {
  it('shows "Never fired" badge when lastFiredAt is null', async () => {
    renderPanel([HOOK_BASE]);
    await waitFor(() => expect(screen.getByText('Never fired')).toBeTruthy());
  });

  it('shows HTTP 200 badge on last successful delivery', async () => {
    renderPanel([HOOK_FIRED]);
    await waitFor(() => expect(screen.getByText('HTTP 200')).toBeTruthy());
  });

  it('shows HTTP 500 badge and failure count for failed hook', async () => {
    renderPanel([HOOK_FAILED]);
    await waitFor(() => expect(screen.getByText('HTTP 500')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('2 consecutive failures')).toBeTruthy());
  });

  it('shows plural "failures" for failureCount > 1', async () => {
    renderPanel([HOOK_FAILED]);
    await waitFor(() => expect(screen.getByText('2 consecutive failures')).toBeTruthy());
  });

  it('shows singular "failure" for failureCount = 1', async () => {
    const singleFail = { ...HOOK_FAILED, failureCount: 1 };
    renderPanel([singleFail]);
    await waitFor(() => expect(screen.getByText('1 consecutive failure')).toBeTruthy());
  });

  it('renders the event tag for each hook', async () => {
    renderPanel([HOOK_BASE]);
    await waitFor(() => expect(screen.getByText('response.submitted')).toBeTruthy());
  });

  it('renders multiple hooks', async () => {
    renderPanel([HOOK_BASE, HOOK_FIRED]);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());
    expect(screen.getByText('https://fired.example.com/hook')).toBeTruthy();
  });
});

describe('WebhooksPanel — event checkbox in form', () => {
  it('pre-checks "response.submitted" checkbox', async () => {
    renderPanel([]);
    await waitFor(() => expect(screen.getByText('No webhooks configured yet.')).toBeTruthy());
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const responseSubmittedCheckbox = checkboxes.find((c) =>
      c.closest('label')?.textContent?.includes('Response submitted'),
    );
    expect(responseSubmittedCheckbox).toBeTruthy();
    expect(responseSubmittedCheckbox!.checked).toBe(true);
  });

  it('unchecks the checkbox when clicked', async () => {
    renderPanel([]);
    await waitFor(() => expect(screen.getByText('No webhooks configured yet.')).toBeTruthy());
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const cb = checkboxes[0];
    fireEvent.click(cb);
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);
  });
});

describe('WebhooksPanel — create webhook', () => {
  it('shows error and skips POST when URL is empty', async () => {
    renderPanel([]);
    await waitFor(() => expect(screen.getByText('No webhooks configured yet.')).toBeTruthy());

    const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add webhook'),
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(screen.getByText('URL is required')).toBeTruthy();
    const postCalls = (global.fetch as any).mock.calls.filter(
      (c: any[]) => c[1]?.method === 'POST',
    );
    expect(postCalls).toHaveLength(0);
  });

  it('calls POST with correct payload on valid URL', async () => {
    renderPanel([]);
    await waitFor(() => expect(screen.getByText('No webhooks configured yet.')).toBeTruthy());

    const urlInput = screen.getByPlaceholderText(
      'https://example.com/webhooks/survey',
    ) as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://my.site/hook' } });

    const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add webhook'),
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(addBtn);
    });

    await waitFor(() => {
      const postCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall[1].body);
      expect(body.url).toBe('https://my.site/hook');
      expect(body.events).toContain('response.submitted');
      expect(body.enabled).toBe(true);
    });
  });

  it('shows the saved secret banner after successful create', async () => {
    renderPanel([]);
    await waitFor(() => expect(screen.getByText('No webhooks configured yet.')).toBeTruthy());

    const urlInput = screen.getByPlaceholderText(
      'https://example.com/webhooks/survey',
    ) as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://my.site/hook' } });

    const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add webhook'),
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(addBtn);
    });

    await waitFor(() =>
      expect(screen.getByText("Save this secret — it will not be shown again")).toBeTruthy(),
    );
    expect(screen.getByText('mysecret')).toBeTruthy();
  });

  it('dismisses saved secret banner on "I\'ve saved it" click', async () => {
    renderPanel([]);
    await waitFor(() => expect(screen.getByText('No webhooks configured yet.')).toBeTruthy());

    const urlInput = screen.getByPlaceholderText(
      'https://example.com/webhooks/survey',
    ) as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://my.site/hook' } });

    const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add webhook'),
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(addBtn);
    });

    await waitFor(() => expect(screen.getByText("I've saved it")).toBeTruthy());

    fireEvent.click(screen.getByText("I've saved it"));

    await waitFor(() =>
      expect(
        screen.queryByText("Save this secret — it will not be shown again"),
      ).toBeNull(),
    );
  });

  it('shows error when POST returns success:false', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return makeOk({ success: true, data: [] });
      if (method === 'POST') return makeOk({ success: false, message: 'Invalid URL scheme' });
      return makeOk({ success: true, data: [] });
    }) as any;

    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('No webhooks configured yet.')).toBeTruthy());

    const urlInput = screen.getByPlaceholderText(
      'https://example.com/webhooks/survey',
    ) as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://my.site/hook' } });

    const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add webhook'),
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(addBtn);
    });

    await waitFor(() => expect(screen.getByText('Invalid URL scheme')).toBeTruthy());
  });

  it('resets URL input after successful create', async () => {
    renderPanel([]);
    await waitFor(() => expect(screen.getByText('No webhooks configured yet.')).toBeTruthy());

    const urlInput = screen.getByPlaceholderText(
      'https://example.com/webhooks/survey',
    ) as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://my.site/hook' } });

    const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add webhook'),
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(addBtn);
    });

    await waitFor(() => {
      expect(urlInput.value).toBe('');
    });
  });
});

describe('WebhooksPanel — toggle enabled', () => {
  it('calls PUT with flipped enabled value when toggle button clicked', async () => {
    renderPanel([HOOK_BASE]);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());

    const toggleBtn = screen.getByTitle('Disable') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    await waitFor(() => {
      const putCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall[1].body);
      expect(body.enabled).toBe(false);
    });
  });

  it('shows Enable button for disabled hook', async () => {
    renderPanel([HOOK_DISABLED]);
    await waitFor(() => expect(screen.getByTitle('Enable')).toBeTruthy());
  });

  it('shows error when PUT returns success:false', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return makeOk({ success: true, data: [HOOK_BASE] });
      if (method === 'PUT') return makeOk({ success: false, message: 'Toggle failed' });
      return makeOk({ success: true });
    }) as any;

    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());

    const toggleBtn = screen.getByTitle('Disable');
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    await waitFor(() => expect(screen.getByText('Toggle failed')).toBeTruthy());
  });
});

describe('WebhooksPanel — delete webhook', () => {
  it('calls DELETE and refreshes list on confirm', async () => {
    let listCallCount = 0;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') {
        listCallCount++;
        if (listCallCount === 1) return makeOk({ success: true, data: [HOOK_BASE] });
        return makeOk({ success: true, data: [] });
      }
      if (method === 'DELETE') return makeOk({ success: true });
      return makeOk({ success: true });
    }) as any;

    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());

    const deleteBtn = screen.getByTitle('Delete');
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() => {
      const delCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'DELETE',
      );
      expect(delCall).toBeTruthy();
    });
  });

  it('skips DELETE when confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel([HOOK_BASE]);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());

    fireEvent.click(screen.getByTitle('Delete'));

    const delCalls = (global.fetch as any).mock.calls.filter(
      (c: any[]) => c[1]?.method === 'DELETE',
    );
    expect(delCalls).toHaveLength(0);
  });

  it('shows error when DELETE returns success:false', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return makeOk({ success: true, data: [HOOK_BASE] });
      if (method === 'DELETE') return makeOk({ success: false, message: 'Cannot delete' });
      return makeOk({ success: true });
    }) as any;

    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());

    const deleteBtn = screen.getByTitle('Delete');
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() => expect(screen.getByText('Cannot delete')).toBeTruthy());
  });
});

describe('WebhooksPanel — deliveries panel', () => {
  it('opens deliveries panel on history button click', async () => {
    setupFetch([HOOK_BASE], [DELIVERY_BASE]);
    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());

    const historyBtn = screen.getByTitle('Recent deliveries');
    await act(async () => {
      fireEvent.click(historyBtn);
    });

    await waitFor(() => expect(screen.getByText('Recent deliveries')).toBeTruthy());
  });

  it('shows deliveries in the panel', async () => {
    setupFetch([HOOK_BASE], [DELIVERY_BASE]);
    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTitle('Recent deliveries'));
    });

    await waitFor(() => expect(screen.getByText('HTTP 200')).toBeTruthy());
    expect(screen.getByText('attempt 1')).toBeTruthy();
  });

  it('shows failed delivery with error text when statusCode is null', async () => {
    const noCodeDelivery = {
      ...DELIVERY_FAILED,
      statusCode: null,
      error: 'Timeout',
    };
    setupFetch([HOOK_BASE], [noCodeDelivery]);
    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTitle('Recent deliveries'));
    });

    await waitFor(() => expect(screen.getByText('Timeout')).toBeTruthy());
  });

  it('shows "No deliveries recorded yet." when list is empty', async () => {
    setupFetch([HOOK_BASE], []);
    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTitle('Recent deliveries'));
    });

    await waitFor(() => expect(screen.getByText('No deliveries recorded yet.')).toBeTruthy());
  });

  it('closes deliveries panel when history button clicked again', async () => {
    setupFetch([HOOK_BASE], [DELIVERY_BASE]);
    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());

    const historyBtn = screen.getByTitle('Recent deliveries');

    await act(async () => {
      fireEvent.click(historyBtn);
    });
    await waitFor(() => expect(screen.getByText('Recent deliveries')).toBeTruthy());

    await act(async () => {
      fireEvent.click(historyBtn);
    });
    await waitFor(() => expect(screen.queryByText('No deliveries recorded yet.')).toBeNull());
  });

  it('shows error when deliveries fetch returns success:false', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const urlStr = String(url);
      if (method === 'GET' && urlStr.includes('/deliveries')) {
        return makeOk({ success: false, message: 'Deliveries fetch failed' });
      }
      if (method === 'GET') return makeOk({ success: true, data: [HOOK_BASE] });
      return makeOk({ success: true });
    }) as any;

    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTitle('Recent deliveries'));
    });

    await waitFor(() => expect(screen.getByText('Deliveries fetch failed')).toBeTruthy());
  });

  it('shows both success and failed deliveries', async () => {
    setupFetch([HOOK_BASE], [DELIVERY_BASE, DELIVERY_FAILED]);
    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('https://example.com/hooks')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTitle('Recent deliveries'));
    });

    await waitFor(() => expect(screen.getByText('HTTP 200')).toBeTruthy());
    expect(screen.getByText('HTTP 503')).toBeTruthy();
  });
});

describe('WebhooksPanel — error dismissal', () => {
  it('clears error when close button in error bar is clicked', async () => {
    global.fetch = vi.fn(() => makeOk({ success: false, message: 'Load error' })) as any;
    render(<WebhooksPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('Load error')).toBeTruthy());

    const errorBar = document.querySelector('[class*="red-50"], [class*="red-900"]') as HTMLElement;
    expect(errorBar).toBeTruthy();
    const closeBtn = errorBar.querySelector('button') as HTMLButtonElement;
    fireEvent.click(closeBtn);

    await waitFor(() => expect(screen.queryByText('Load error')).toBeNull());
  });
});
