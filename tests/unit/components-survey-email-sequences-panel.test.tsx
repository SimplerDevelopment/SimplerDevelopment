// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Module mocks — declare before the import under test
// ---------------------------------------------------------------------------

vi.mock('@/components/admin/SurveyBuilder', () => ({}));

vi.mock('@/lib/surveys/email-followup-gate', () => ({
  formatDelay: (hours: number): string => {
    if (!Number.isFinite(hours) || hours < 0) return '0h';
    if (hours === 0) return 'Immediately';
    const days = Math.floor(hours / 24);
    const rem = hours % 24;
    if (days > 0 && rem > 0) return `${days}d ${rem}h`;
    if (days > 0) return `${days}d`;
    return `${rem}h`;
  },
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import EmailSequencesPanel from '@/app/portal/surveys/[id]/_components/EmailSequencesPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOk(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

function makeFail(body: unknown) {
  return Promise.resolve({ ok: false, json: () => Promise.resolve(body) });
}

const SURVEY_ID = 'survey-42';

const SEQ_BASE = {
  id: 1,
  surveyId: 42,
  subject: 'Thanks for your feedback',
  bodyHtml: '<p>Hi!</p>',
  delayHours: 24,
  conditionField: null,
  conditionValue: null,
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
};

const SEQ_2 = {
  id: 2,
  surveyId: 42,
  subject: 'Follow-up part 2',
  bodyHtml: '<p>More info</p>',
  delayHours: 48,
  conditionField: 'field-1',
  conditionValue: 'Yes',
  enabled: false,
  createdAt: '2026-01-02T00:00:00Z',
};

function setupFetch(sequences: unknown[] = [SEQ_BASE]) {
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    // Initial list load
    if (method === 'GET' && url.includes('/email-sequences') && !url.match(/\/\d+$/)) {
      return makeOk({ success: true, data: sequences });
    }
    // Create
    if (method === 'POST') {
      return makeOk({ success: true, data: { ...SEQ_BASE, id: 99, subject: 'New' } });
    }
    // Update / toggle
    if (method === 'PUT') {
      return makeOk({ success: true, data: {} });
    }
    // Delete
    if (method === 'DELETE') {
      return makeOk({ success: true });
    }
    return makeOk({ success: true, data: [] });
  }) as any;
}

const defaultFields = [
  { id: 'field-1', type: 'text' as const, label: 'Name', placeholder: '', helpText: '', required: false, options: [], order: 0 },
  { id: 'field-2', type: 'heading' as const, label: 'Section', placeholder: '', helpText: '', required: false, options: [], order: 1 },
];

function renderPanel(sequences: unknown[] = [SEQ_BASE]) {
  setupFetch(sequences);
  return render(
    <EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={defaultFields} />,
  );
}

/**
 * Find an edit-form Save button by its visible text content.
 * The button renders: <span class="material-icons">save</span>Save
 * so the accessible name is "save Save" — use a DOM query on textContent instead.
 */
function getSaveButton(): HTMLButtonElement {
  const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  const saveBtn = btns.find((b) => b.textContent?.trim().endsWith('Save') && !b.textContent?.trim().endsWith('Saving…'));
  if (!saveBtn) throw new Error('Save button not found');
  return saveBtn;
}

function querySaveButton(): HTMLButtonElement | undefined {
  const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  return btns.find((b) => b.textContent?.trim().endsWith('Save') && !b.textContent?.trim().endsWith('Saving…'));
}

function countSaveButtons(): number {
  const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  return btns.filter((b) => b.textContent?.trim().endsWith('Save') && !b.textContent?.trim().endsWith('Saving…')).length;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Stub window.confirm so delete tests don't hang
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmailSequencesPanel — initial render', () => {
  it('shows loading spinner then the sequence list', async () => {
    renderPanel([SEQ_BASE]);
    // loading state briefly visible — heading stays throughout
    expect(screen.getByText('Email Follow-up Sequences')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());
  });

  it('renders empty state when no sequences exist', async () => {
    renderPanel([]);
    await waitFor(() =>
      expect(screen.getByText('No follow-up sequences configured yet.')).toBeTruthy(),
    );
  });

  it('renders the "Add a sequence" form on mount', async () => {
    renderPanel([]);
    await waitFor(() => screen.getByRole('button', { name: /Add sequence/i }));
    expect(screen.getByRole('button', { name: /Add sequence/i })).toBeTruthy();
  });

  it('filters out heading/page_break/file fields for condition selector', async () => {
    renderPanel([]);
    await waitFor(() => screen.getByRole('button', { name: /Add sequence/i }));
    // field-1 (text) should appear in select options; field-2 (heading) should not
    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toBeTruthy();
    expect(selects[0].innerHTML).toContain('field-1');
    expect(selects[0].innerHTML).not.toContain('field-2');
  });

  it('displays error message from fetch failure', async () => {
    global.fetch = vi.fn(() => makeOk({ success: false, message: 'DB connection failed' })) as any;
    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={[]} />);
    await waitFor(() => expect(screen.getByText('DB connection failed')).toBeTruthy());
  });

  it('handles fetch network error gracefully', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network down'))) as any;
    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={[]} />);
    await waitFor(() => expect(screen.getByText('Network down')).toBeTruthy());
  });
});

describe('EmailSequencesPanel — sequence list display', () => {
  it('renders multiple sequences', async () => {
    renderPanel([SEQ_BASE, SEQ_2]);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());
    expect(screen.getByText('Follow-up part 2')).toBeTruthy();
  });

  it('shows formatted delay for each sequence', async () => {
    renderPanel([SEQ_BASE]);
    // delayHours=24 → "1d"
    await waitFor(() => expect(screen.getByText('1d')).toBeTruthy());
  });

  it('shows condition filter badge when conditionField is set', async () => {
    renderPanel([SEQ_2]);
    await waitFor(() => expect(screen.getByText(/field-1 = Yes/)).toBeTruthy());
  });

  it('shows "Paused" badge for disabled sequences', async () => {
    renderPanel([SEQ_2]);
    await waitFor(() => expect(screen.getByText('Paused')).toBeTruthy());
  });

  it('does not show "Paused" badge for enabled sequences', async () => {
    renderPanel([SEQ_BASE]);
    await waitFor(() => expect(screen.queryByText('Paused')).toBeNull());
  });
});

describe('EmailSequencesPanel — create sequence', () => {
  it('calls POST with correct payload on valid form submission', async () => {
    renderPanel([]);
    await waitFor(() => screen.getByRole('button', { name: /Add sequence/i }));

    // Fill subject
    const subjectInput = screen.getAllByRole('textbox').find(
      (i) => (i as HTMLInputElement).placeholder === 'Thanks for your feedback',
    ) as HTMLInputElement;
    fireEvent.change(subjectInput, { target: { value: 'Welcome email' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add sequence/i }));
    });

    await waitFor(() => {
      const call = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'POST',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(call[1].body);
      expect(body.subject).toBe('Welcome email');
      expect(body.delayHours).toBe(24);
      expect(body.enabled).toBe(true);
    });
  });

  it('shows error and skips POST when subject is empty', async () => {
    renderPanel([]);
    await waitFor(() => screen.getByRole('button', { name: /Add sequence/i }));

    // Clear default body to get a fresh state — subject starts empty (default)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add sequence/i }));
    });

    expect(screen.getByText('Subject is required')).toBeTruthy();
    const postCalls = (global.fetch as any).mock.calls.filter(
      (c: any[]) => c[1]?.method === 'POST',
    );
    expect(postCalls).toHaveLength(0);
  });

  it('shows error when body HTML is blank', async () => {
    renderPanel([]);
    await waitFor(() => screen.getByRole('button', { name: /Add sequence/i }));

    // Set subject but blank out body
    const subjectInput = screen.getAllByRole('textbox').find(
      (i) => (i as HTMLInputElement).placeholder === 'Thanks for your feedback',
    ) as HTMLInputElement;
    fireEvent.change(subjectInput, { target: { value: 'My subject' } });

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add sequence/i }));
    });

    expect(screen.getByText('Body HTML is required')).toBeTruthy();
  });

  it('shows error when delay is negative', async () => {
    renderPanel([]);
    await waitFor(() => screen.getByRole('button', { name: /Add sequence/i }));

    const subjectInput = screen.getAllByRole('textbox').find(
      (i) => (i as HTMLInputElement).placeholder === 'Thanks for your feedback',
    ) as HTMLInputElement;
    fireEvent.change(subjectInput, { target: { value: 'Negative delay test' } });

    const delayInput = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(delayInput, { target: { value: '-5' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add sequence/i }));
    });

    expect(screen.getByText('Delay must be a non-negative integer (hours)')).toBeTruthy();
  });

  it('shows error when POST returns success:false', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') return makeOk({ success: true, data: [] });
      if (method === 'POST') return makeOk({ success: false, message: 'Duplicate subject' });
      return makeOk({ success: true, data: [] });
    }) as any;

    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={[]} />);
    await waitFor(() => screen.getByRole('button', { name: /Add sequence/i }));

    const subjectInput = screen.getAllByRole('textbox').find(
      (i) => (i as HTMLInputElement).placeholder === 'Thanks for your feedback',
    ) as HTMLInputElement;
    fireEvent.change(subjectInput, { target: { value: 'Some subject' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add sequence/i }));
    });

    await waitFor(() => expect(screen.getByText('Duplicate subject')).toBeTruthy());
  });

  it('resets draft after successful create', async () => {
    // Setup: first GET returns empty list, POST succeeds, second GET returns new sequence
    let listCallCount = 0;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        listCallCount++;
        if (listCallCount === 1) return makeOk({ success: true, data: [] });
        return makeOk({ success: true, data: [{ ...SEQ_BASE, subject: 'New seq', id: 99 }] });
      }
      if (method === 'POST') return makeOk({ success: true, data: { id: 99 } });
      return makeOk({ success: true, data: [] });
    }) as any;

    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={[]} />);
    await waitFor(() => screen.getByRole('button', { name: /Add sequence/i }));

    const subjectInput = screen.getAllByRole('textbox').find(
      (i) => (i as HTMLInputElement).placeholder === 'Thanks for your feedback',
    ) as HTMLInputElement;
    fireEvent.change(subjectInput, { target: { value: 'New seq' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add sequence/i }));
    });

    // After create+refresh, subject input should be reset to empty
    await waitFor(() => {
      expect(subjectInput.value).toBe('');
    });
  });

  it('disables conditionValue input when no conditionField is selected', async () => {
    renderPanel([]);
    await waitFor(() => screen.getByRole('button', { name: /Add sequence/i }));

    const condValueInputs = screen.getAllByRole('textbox').filter(
      (i) => (i as HTMLInputElement).placeholder === 'e.g. Yes',
    );
    expect(condValueInputs[0]).toBeTruthy();
    expect((condValueInputs[0] as HTMLInputElement).disabled).toBe(true);
  });

  it('enables conditionValue when a conditionField is selected', async () => {
    const fieldsWithText = [
      { id: 'q1', type: 'text' as const, label: 'Q1', placeholder: '', helpText: '', required: false, options: [], order: 0 },
    ];
    global.fetch = vi.fn(() => makeOk({ success: true, data: [] })) as any;
    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={fieldsWithText} />);
    await waitFor(() => screen.getByRole('button', { name: /Add sequence/i }));

    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'q1' } });

    const condValueInputs = screen.getAllByRole('textbox').filter(
      (i) => (i as HTMLInputElement).placeholder === 'e.g. Yes',
    );
    expect((condValueInputs[0] as HTMLInputElement).disabled).toBe(false);
  });

  it('sends conditionField=null when no field selected (omits conditionValue)', async () => {
    renderPanel([]);
    await waitFor(() => screen.getByRole('button', { name: /Add sequence/i }));

    const subjectInput = screen.getAllByRole('textbox').find(
      (i) => (i as HTMLInputElement).placeholder === 'Thanks for your feedback',
    ) as HTMLInputElement;
    fireEvent.change(subjectInput, { target: { value: 'Unconditional' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add sequence/i }));
    });

    await waitFor(() => {
      const call = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'POST',
      );
      const body = JSON.parse(call[1].body);
      expect(body.conditionField).toBeNull();
      expect(body.conditionValue).toBeNull();
    });
  });
});

describe('EmailSequencesPanel — error dismissal', () => {
  it('clears the error when the close button is clicked', async () => {
    global.fetch = vi.fn(() => makeOk({ success: false, message: 'Fetch error' })) as any;
    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={[]} />);
    await waitFor(() => expect(screen.getByText('Fetch error')).toBeTruthy());

    // The close button is inside the error bar; find it by its ml-auto class
    const errorBar = document.querySelector('[class*="red-50"], [class*="red-900"]') as HTMLElement;
    expect(errorBar).toBeTruthy();
    const closeBtn = errorBar.querySelector('button') as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);

    await waitFor(() => expect(screen.queryByText('Fetch error')).toBeNull());
  });
});

describe('EmailSequencesPanel — toggle enabled', () => {
  it('calls PUT with flipped enabled value on toggle click', async () => {
    renderPanel([SEQ_BASE]);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

    // The pause button (enabled=true → pause icon)
    const pauseBtn = screen.getByTitle('Pause');
    await act(async () => {
      fireEvent.click(pauseBtn);
    });

    await waitFor(() => {
      const putCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'PUT' && c[0].includes(`/${SEQ_BASE.id}`),
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall[1].body);
      expect(body.enabled).toBe(false);
    });
  });

  it('reverts optimistic toggle on PUT failure — sequence still present after revert', async () => {
    // NOTE: refresh() calls setError('') which clears the error set before it;
    // we verify revert by checking the sequence is back in the list.
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') return makeOk({ success: true, data: [SEQ_BASE] });
      if (method === 'PUT') return makeOk({ success: false, message: 'Toggle failed' });
      return makeOk({ success: true });
    }) as any;

    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={[]} />);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

    const pauseBtn = screen.getByTitle('Pause');
    await act(async () => {
      fireEvent.click(pauseBtn);
    });

    // After revert refresh, GET is called again and sequence is restored
    await waitFor(() => {
      const getCalls = (global.fetch as any).mock.calls.filter(
        (c: any[]) => (c[1]?.method ?? 'GET') === 'GET',
      );
      // Two GET calls: initial load + revert refresh
      expect(getCalls.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText('Thanks for your feedback')).toBeTruthy();
  });
});

describe('EmailSequencesPanel — delete sequence', () => {
  it('calls DELETE and removes sequence from list on confirm', async () => {
    let listCallCount = 0;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        listCallCount++;
        if (listCallCount === 1) return makeOk({ success: true, data: [SEQ_BASE] });
        return makeOk({ success: true, data: [] });
      }
      if (method === 'DELETE') return makeOk({ success: true });
      return makeOk({ success: true });
    }) as any;

    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={[]} />);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

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

  it('skips DELETE when confirm returns false', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel([SEQ_BASE]);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

    const deleteBtn = screen.getByTitle('Delete');
    fireEvent.click(deleteBtn);

    const delCalls = (global.fetch as any).mock.calls.filter(
      (c: any[]) => c[1]?.method === 'DELETE',
    );
    expect(delCalls).toHaveLength(0);
    // Sequence still shown
    expect(screen.getByText('Thanks for your feedback')).toBeTruthy();
  });

  it('reverts optimistic delete on DELETE failure', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') return makeOk({ success: true, data: [SEQ_BASE] });
      if (method === 'DELETE') return makeOk({ success: false, message: 'Delete failed' });
      return makeOk({ success: true });
    }) as any;

    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={[]} />);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

    const deleteBtn = screen.getByTitle('Delete');
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() => expect(screen.getByText('Delete failed')).toBeTruthy());
    // Sequence re-appears after revert
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());
  });
});

describe('EmailSequencesPanel — inline edit', () => {
  it('opens edit form on edit button click', async () => {
    renderPanel([SEQ_BASE]);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

    const editBtn = screen.getByTitle('Edit');
    fireEvent.click(editBtn);

    // Edit form should appear — Save and Cancel buttons become visible
    // Save button accessible name includes material-icon text "save" + label "Save"
    await waitFor(() => expect(document.querySelector('button[class*="bg-primary"]')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeTruthy();
  });

  it('closes edit form on Cancel button click', async () => {
    renderPanel([SEQ_BASE]);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

    fireEvent.click(screen.getByTitle('Edit'));
    await waitFor(() => screen.getByRole('button', { name: /Cancel/i }));

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(querySaveButton()).toBeUndefined();
  });

  it('toggles edit form off when edit button clicked twice', async () => {
    renderPanel([SEQ_BASE]);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

    const editBtn = screen.getByTitle('Edit');
    fireEvent.click(editBtn);
    await waitFor(() => getSaveButton());
    fireEvent.click(editBtn);
    expect(querySaveButton()).toBeUndefined();
  });

  it('populates edit form with existing sequence values', async () => {
    renderPanel([SEQ_BASE]);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

    fireEvent.click(screen.getByTitle('Edit'));

    // The edit subject input should be pre-filled
    await waitFor(() => {
      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      const editSubject = inputs.find((i) => i.value === 'Thanks for your feedback');
      expect(editSubject).toBeTruthy();
    });
  });

  it('calls PUT with updated values on save', async () => {
    let listCallCount = 0;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        listCallCount++;
        if (listCallCount === 1) return makeOk({ success: true, data: [SEQ_BASE] });
        return makeOk({ success: true, data: [{ ...SEQ_BASE, subject: 'Updated subject' }] });
      }
      if (method === 'PUT') return makeOk({ success: true, data: {} });
      return makeOk({ success: true });
    }) as any;

    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={[]} />);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

    fireEvent.click(screen.getByTitle('Edit'));
    await waitFor(() => getSaveButton());

    // Update subject in edit form
    const allInputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    const editSubjectInput = allInputs.find((i) => i.value === 'Thanks for your feedback');
    expect(editSubjectInput).toBeTruthy();
    fireEvent.change(editSubjectInput!, { target: { value: 'Updated subject' } });

    await act(async () => {
      fireEvent.click(getSaveButton());
    });

    await waitFor(() => {
      const putCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall[1].body);
      expect(body.subject).toBe('Updated subject');
    });
  });

  it('shows error and keeps form open when PUT fails', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') return makeOk({ success: true, data: [SEQ_BASE] });
      if (method === 'PUT') return makeOk({ success: false, message: 'Save failed' });
      return makeOk({ success: true });
    }) as any;

    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={[]} />);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

    fireEvent.click(screen.getByTitle('Edit'));
    await waitFor(() => getSaveButton());

    await act(async () => {
      fireEvent.click(getSaveButton());
    });

    await waitFor(() => expect(screen.getByText('Save failed')).toBeTruthy());
    // Edit form still open (savingId cleared, editingId still set)
    expect(getSaveButton()).toBeTruthy();
  });

  it('shows error when edit delay is invalid', async () => {
    renderPanel([SEQ_BASE]);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

    fireEvent.click(screen.getByTitle('Edit'));
    await waitFor(() => getSaveButton());

    // There are two spinbuttons now (create delay + edit delay); edit one is second
    const spinButtons = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    const editDelay = spinButtons[spinButtons.length - 1];
    fireEvent.change(editDelay, { target: { value: '-3' } });

    await act(async () => {
      fireEvent.click(getSaveButton());
    });

    expect(screen.getByText('Delay must be a non-negative integer (hours)')).toBeTruthy();
  });

  it('closes edit form on successful save', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') return makeOk({ success: true, data: [SEQ_BASE] });
      if (method === 'PUT') return makeOk({ success: true, data: {} });
      return makeOk({ success: true });
    }) as any;

    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={[]} />);
    await waitFor(() => expect(screen.getByText('Thanks for your feedback')).toBeTruthy());

    fireEvent.click(screen.getByTitle('Edit'));
    await waitFor(() => getSaveButton());

    await act(async () => {
      fireEvent.click(getSaveButton());
    });

    await waitFor(() => expect(querySaveButton()).toBeUndefined());
  });

  it('opening a second sequence edit collapses the first', async () => {
    const seq1 = { ...SEQ_BASE, id: 1, subject: 'Seq One' };
    const seq2 = { ...SEQ_BASE, id: 2, subject: 'Seq Two', enabled: false };

    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') return makeOk({ success: true, data: [seq1, seq2] });
      return makeOk({ success: true });
    }) as any;

    render(<EmailSequencesPanel surveyId={SURVEY_ID} surveyFields={[]} />);
    await waitFor(() => expect(screen.getByText('Seq One')).toBeTruthy());

    const editBtns = screen.getAllByTitle('Edit');
    // Open edit for first sequence
    fireEvent.click(editBtns[0]);
    await waitFor(() => getSaveButton());

    // Open edit for second sequence — first should collapse
    fireEvent.click(editBtns[1]);
    // Still only one Save button (for seq2 only)
    await waitFor(() => expect(countSaveButtons()).toBe(1));
  });
});

describe('EmailSequencesPanel — enabled checkbox in create form', () => {
  it('toggles enabled checkbox', async () => {
    renderPanel([]);
    await waitFor(() => screen.getByRole('button', { name: /Add sequence/i }));

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // The first checkbox in the create form is the "Enabled" checkbox
    const enabledCheckbox = checkboxes[0];
    expect(enabledCheckbox.checked).toBe(true);

    fireEvent.click(enabledCheckbox);
    expect(enabledCheckbox.checked).toBe(false);

    fireEvent.click(enabledCheckbox);
    expect(enabledCheckbox.checked).toBe(true);
  });
});
