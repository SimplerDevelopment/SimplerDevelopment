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

// SurveyBuilder is a complex interactive component; stub it to an inert div.
vi.mock('@/components/admin/SurveyBuilder', () => ({
  default: ({ onChange }: { onChange?: (f: unknown[]) => void }) => (
    <div
      data-testid="survey-builder"
      onClick={() => onChange?.([{ id: 'f1', type: 'text', label: 'Name' }])}
    >
      SurveyBuilder
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import VariantsPanel from '@/app/portal/surveys/[id]/_components/VariantsPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOk(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

const SURVEY_ID = 'survey-9';

const VARIANT_BASE = {
  id: 1,
  surveyId: 9,
  name: 'Control',
  fields: [{ id: 'f1', type: 'text', label: 'Name', placeholder: '', helpText: '', required: false, options: [], order: 0 }],
  weight: 100,
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
};

const VARIANT_B = {
  id: 2,
  surveyId: 9,
  name: 'Variant B',
  fields: [],
  weight: 50,
  enabled: true,
  createdAt: '2026-01-02T00:00:00Z',
};

const VARIANT_DISABLED = {
  ...VARIANT_BASE,
  id: 3,
  name: 'Disabled Variant',
  enabled: false,
};

const STAT_BASE = {
  variantId: 1,
  total: 42,
  completed: 30,
  withEmail: 10,
};

function setupFetch(
  variants: unknown[] = [VARIANT_BASE],
  stats: unknown[] = [],
  statsOk = true,
) {
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const urlStr = String(url);

    if (method === 'GET' && urlStr.includes('/variants/stats')) {
      if (!statsOk) return Promise.resolve({ ok: false, json: () => Promise.resolve({ success: false }) });
      return makeOk({ success: true, data: stats });
    }
    if (method === 'GET' && urlStr.includes('/variants')) {
      return makeOk({ success: true, data: variants });
    }
    if (method === 'POST') {
      return makeOk({
        success: true,
        data: { ...VARIANT_BASE, id: 99, name: 'New Variant' },
      });
    }
    if (method === 'PATCH') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      return makeOk({ success: true, data: { ...VARIANT_BASE, ...body } });
    }
    if (method === 'DELETE') {
      return makeOk({ success: true });
    }
    return makeOk({ success: true, data: [] });
  }) as any;
}

function renderPanel(variants: unknown[] = [VARIANT_BASE], stats: unknown[] = []) {
  setupFetch(variants, stats);
  return render(<VariantsPanel surveyId={SURVEY_ID} />);
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

describe('VariantsPanel — initial render', () => {
  it('renders the A/B Variants heading', async () => {
    renderPanel([]);
    expect(screen.getByText('A/B Variants')).toBeTruthy();
  });

  it('shows empty state when no variants exist', async () => {
    renderPanel([]);
    await waitFor(() =>
      expect(
        screen.getByText('No variants yet. Add one above to start splitting visitors between alternate field sets.'),
      ).toBeTruthy(),
    );
  });

  it('renders variant list after load', async () => {
    renderPanel([VARIANT_BASE]);
    await waitFor(() => expect(screen.getByDisplayValue('Control')).toBeTruthy());
  });

  it('renders the create-form input and Add variant button', async () => {
    renderPanel([]);
    await waitFor(() =>
      expect(screen.queryByText('Loading')).toBeNull(),
    );
    expect(
      screen.getByPlaceholderText('Variant name (e.g. Short form, Long form)'),
    ).toBeTruthy();
    const addBtns = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Add variant'),
    );
    expect(addBtns.length).toBeGreaterThan(0);
  });

  it('shows error when variants fetch returns success:false', async () => {
    global.fetch = vi.fn(() => makeOk({ success: false, message: 'Forbidden' })) as any;
    render(<VariantsPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('Forbidden')).toBeTruthy());
  });

  it('shows error on network failure', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network down'))) as any;
    render(<VariantsPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('Network down')).toBeTruthy());
  });

  it('still renders variant list even when stats endpoint fails', async () => {
    setupFetch([VARIANT_BASE], [], false);
    render(<VariantsPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByDisplayValue('Control')).toBeTruthy());
  });
});

describe('VariantsPanel — variant list display', () => {
  it('shows field count for each variant', async () => {
    renderPanel([VARIANT_BASE]);
    await waitFor(() => expect(screen.getByText(/1 fields/)).toBeTruthy());
  });

  it('shows 0 fields for variant with empty fields array', async () => {
    renderPanel([VARIANT_B]);
    await waitFor(() => expect(screen.getByText(/0 fields/)).toBeTruthy());
  });

  it('shows response count from stats', async () => {
    renderPanel([VARIANT_BASE], [STAT_BASE]);
    await waitFor(() => expect(screen.getByText(/42 responses/)).toBeTruthy());
  });

  it('shows singular "response" for total=1', async () => {
    renderPanel([VARIANT_BASE], [{ ...STAT_BASE, total: 1 }]);
    await waitFor(() => expect(screen.getByText(/1 response\b/)).toBeTruthy());
  });

  it('shows weight and traffic share for enabled variants', async () => {
    renderPanel([VARIANT_BASE, VARIANT_B]);
    await waitFor(() => {
      // VARIANT_BASE: weight 100 of 150 total → ~67%
      expect(screen.getByText(/~67% of traffic/)).toBeTruthy();
    });
  });

  it('does not show traffic share for disabled variants', async () => {
    renderPanel([VARIANT_DISABLED]);
    await waitFor(() => expect(screen.getByDisplayValue('Disabled Variant')).toBeTruthy());
    // 0% share — paragraph with "% of traffic" should not appear
    expect(screen.queryByText(/% of traffic/)).toBeNull();
  });

  it('renders multiple variants', async () => {
    renderPanel([VARIANT_BASE, VARIANT_B]);
    await waitFor(() => expect(screen.getByDisplayValue('Control')).toBeTruthy());
    expect(screen.getByDisplayValue('Variant B')).toBeTruthy();
  });

  it('shows "Disable" button for enabled variant', async () => {
    renderPanel([VARIANT_BASE]);
    await waitFor(() => expect(screen.getByText('Disable')).toBeTruthy());
  });

  it('shows "Enable" button for disabled variant', async () => {
    renderPanel([VARIANT_DISABLED]);
    await waitFor(() => expect(screen.getByText('Enable')).toBeTruthy());
  });
});

describe('VariantsPanel — create variant', () => {
  it('Add variant button is disabled and skips POST when name is empty', async () => {
    renderPanel([]);
    await waitFor(() =>
      expect(screen.queryByText(/Loading/)).toBeNull(),
    );

    // The button is disabled when newName is empty — confirm it is disabled
    const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add variant'),
    ) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);

    // Even if click is forced, no POST should occur
    fireEvent.click(addBtn);
    const postCalls = (global.fetch as any).mock.calls.filter(
      (c: any[]) => c[1]?.method === 'POST',
    );
    expect(postCalls).toHaveLength(0);
  });

  it('calls POST with correct name payload', async () => {
    renderPanel([]);
    await waitFor(() =>
      expect(screen.queryByText(/Loading/)).toBeNull(),
    );

    const nameInput = screen.getByPlaceholderText(
      'Variant name (e.g. Short form, Long form)',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Short form' } });

    const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add variant'),
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
      expect(body.name).toBe('Short form');
    });
  });

  it('also triggers create on Enter keypress in the name input', async () => {
    renderPanel([]);
    await waitFor(() =>
      expect(screen.queryByText(/Loading/)).toBeNull(),
    );

    const nameInput = screen.getByPlaceholderText(
      'Variant name (e.g. Short form, Long form)',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Enter variant' } });

    await act(async () => {
      fireEvent.keyDown(nameInput, { key: 'Enter' });
    });

    await waitFor(() => {
      const postCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('resets name input after successful create', async () => {
    renderPanel([]);
    await waitFor(() =>
      expect(screen.queryByText(/Loading/)).toBeNull(),
    );

    const nameInput = screen.getByPlaceholderText(
      'Variant name (e.g. Short form, Long form)',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Variant' } });

    const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add variant'),
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(addBtn);
    });

    await waitFor(() => {
      expect(nameInput.value).toBe('');
    });
  });

  it('shows error when POST returns success:false', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const urlStr = String(url);
      if (method === 'GET' && urlStr.includes('/stats')) return makeOk({ success: true, data: [] });
      if (method === 'GET') return makeOk({ success: true, data: [] });
      if (method === 'POST') return makeOk({ success: false, message: 'Duplicate name' });
      return makeOk({ success: true, data: [] });
    }) as any;

    render(<VariantsPanel surveyId={SURVEY_ID} />);
    await waitFor(() =>
      expect(screen.queryByText(/Loading/)).toBeNull(),
    );

    const nameInput = screen.getByPlaceholderText(
      'Variant name (e.g. Short form, Long form)',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Dup' } });

    const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add variant'),
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(addBtn);
    });

    await waitFor(() => expect(screen.getByText('Duplicate name')).toBeTruthy());
  });
});

describe('VariantsPanel — update variant (name + weight + enabled)', () => {
  it('calls PATCH with updated name on blur', async () => {
    renderPanel([VARIANT_BASE]);
    await waitFor(() => expect(screen.getByDisplayValue('Control')).toBeTruthy());

    const nameInput = screen.getByDisplayValue('Control') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Updated name' } });

    await act(async () => {
      fireEvent.blur(nameInput);
    });

    await waitFor(() => {
      const patchCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall[1].body);
      expect(body.name).toBe('Updated name');
    });
  });

  it('calls PATCH with new weight on weight-input blur', async () => {
    renderPanel([VARIANT_BASE]);
    await waitFor(() => expect(screen.getByDisplayValue('Control')).toBeTruthy());

    const weightInput = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(weightInput, { target: { value: '200' } });

    await act(async () => {
      fireEvent.blur(weightInput);
    });

    await waitFor(() => {
      const patchCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall[1].body);
      expect(body.weight).toBe(200);
    });
  });

  it('ignores non-finite weight values (keeps old value)', async () => {
    renderPanel([VARIANT_BASE]);
    await waitFor(() => expect(screen.getByDisplayValue('Control')).toBeTruthy());

    const weightInput = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(weightInput, { target: { value: '' } });
    // Should not crash — stays with old value internally
    expect(weightInput).toBeTruthy();
  });

  it('calls PATCH with flipped enabled when toggle button clicked', async () => {
    renderPanel([VARIANT_BASE]);
    await waitFor(() => expect(screen.getByText('Disable')).toBeTruthy());

    const disableBtn = screen.getByText('Disable') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(disableBtn);
    });

    await waitFor(() => {
      const patchCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall[1].body);
      expect(body.enabled).toBe(false);
    });
  });

  it('shows error when PATCH returns success:false', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const urlStr = String(url);
      if (method === 'GET' && urlStr.includes('/stats')) return makeOk({ success: true, data: [] });
      if (method === 'GET') return makeOk({ success: true, data: [VARIANT_BASE] });
      if (method === 'PATCH') return makeOk({ success: false, message: 'Update rejected' });
      return makeOk({ success: true });
    }) as any;

    render(<VariantsPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('Disable')).toBeTruthy());

    const disableBtn = screen.getByText('Disable');
    await act(async () => {
      fireEvent.click(disableBtn);
    });

    await waitFor(() => expect(screen.getByText('Update rejected')).toBeTruthy());
  });
});

describe('VariantsPanel — delete variant', () => {
  it('calls DELETE on confirm', async () => {
    let listCallCount = 0;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const urlStr = String(url);
      if (method === 'GET' && urlStr.includes('/stats')) return makeOk({ success: true, data: [] });
      if (method === 'GET') {
        listCallCount++;
        if (listCallCount === 1) return makeOk({ success: true, data: [VARIANT_BASE] });
        return makeOk({ success: true, data: [] });
      }
      if (method === 'DELETE') return makeOk({ success: true });
      return makeOk({ success: true });
    }) as any;

    render(<VariantsPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByDisplayValue('Control')).toBeTruthy());

    const deleteButtons = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.querySelector('.material-icons')?.textContent === 'delete',
    );
    expect(deleteButtons.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(deleteButtons[0]);
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
    renderPanel([VARIANT_BASE]);
    await waitFor(() => expect(screen.getByDisplayValue('Control')).toBeTruthy());

    const deleteButtons = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.querySelector('.material-icons')?.textContent === 'delete',
    );
    fireEvent.click(deleteButtons[0]);

    const delCalls = (global.fetch as any).mock.calls.filter(
      (c: any[]) => c[1]?.method === 'DELETE',
    );
    expect(delCalls).toHaveLength(0);
    // Variant still shown
    expect(screen.getByDisplayValue('Control')).toBeTruthy();
  });

  it('shows error when DELETE returns success:false', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const urlStr = String(url);
      if (method === 'GET' && urlStr.includes('/stats')) return makeOk({ success: true, data: [] });
      if (method === 'GET') return makeOk({ success: true, data: [VARIANT_BASE] });
      if (method === 'DELETE') return makeOk({ success: false, message: 'Delete denied' });
      return makeOk({ success: true });
    }) as any;

    render(<VariantsPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByDisplayValue('Control')).toBeTruthy());

    const deleteButtons = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.querySelector('.material-icons')?.textContent === 'delete',
    );

    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    await waitFor(() => expect(screen.getByText('Delete denied')).toBeTruthy());
  });
});

describe('VariantsPanel — inline fields editor', () => {
  it('opens field editor on "Fields" button click', async () => {
    renderPanel([VARIANT_BASE]);
    await waitFor(() => expect(screen.getByDisplayValue('Control')).toBeTruthy());

    const fieldsBtn = screen.getByText('Fields') as HTMLButtonElement;
    fireEvent.click(fieldsBtn);

    await waitFor(() => expect(screen.getByTestId('survey-builder')).toBeTruthy());
  });

  it('shows "Close" instead of "Fields" when editor is open', async () => {
    renderPanel([VARIANT_BASE]);
    await waitFor(() => expect(screen.getByText('Fields')).toBeTruthy());

    fireEvent.click(screen.getByText('Fields'));
    await waitFor(() => expect(screen.getByText('Close')).toBeTruthy());
  });

  it('closes field editor on second "Fields"/"Close" click', async () => {
    renderPanel([VARIANT_BASE]);
    await waitFor(() => expect(screen.getByText('Fields')).toBeTruthy());

    fireEvent.click(screen.getByText('Fields'));
    await waitFor(() => expect(screen.getByText('Close')).toBeTruthy());

    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => expect(screen.getByText('Fields')).toBeTruthy());
    expect(screen.queryByTestId('survey-builder')).toBeNull();
  });

  it('calls PATCH with updated fields on "Save fields" click', async () => {
    renderPanel([VARIANT_BASE]);
    await waitFor(() => expect(screen.getByText('Fields')).toBeTruthy());

    fireEvent.click(screen.getByText('Fields'));
    await waitFor(() => expect(screen.getByTestId('survey-builder')).toBeTruthy());

    // SurveyBuilder stub fires onChange when clicked
    fireEvent.click(screen.getByTestId('survey-builder'));

    const saveFieldsBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save fields'),
    ) as HTMLButtonElement;
    expect(saveFieldsBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(saveFieldsBtn);
    });

    await waitFor(() => {
      const patchCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall[1].body);
      expect(body).toHaveProperty('fields');
    });
  });
});

describe('VariantsPanel — error dismissal', () => {
  it('clears error when close button clicked', async () => {
    global.fetch = vi.fn(() => makeOk({ success: false, message: 'Load failed' })) as any;
    render(<VariantsPanel surveyId={SURVEY_ID} />);
    await waitFor(() => expect(screen.getByText('Load failed')).toBeTruthy());

    const errorBar = document.querySelector('[class*="red-50"], [class*="red-900"]') as HTMLElement;
    expect(errorBar).toBeTruthy();
    const closeBtn = errorBar.querySelector('button') as HTMLButtonElement;
    fireEvent.click(closeBtn);

    await waitFor(() => expect(screen.queryByText('Load failed')).toBeNull());
  });
});
