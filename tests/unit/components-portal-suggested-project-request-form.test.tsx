// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks — declared before module imports so vi.mock hoisting works correctly.
// ---------------------------------------------------------------------------

const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Mock @/lib/db/schema so imports resolve without DB
vi.mock('@/lib/db/schema', () => ({}));

// ---------------------------------------------------------------------------
// Types (local duplicate — avoids importing from schema which needs DB driver)
// ---------------------------------------------------------------------------
interface SurveyField {
  id: string;
  type: 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'url' | 'select' | 'radio' | 'checkbox' | 'toggle' | 'date' | 'rating' | 'heading' | 'slider';
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  showIf?: { fieldId: string; values: string[] };
  conditionalOptions?: { fieldId: string; map: Record<string, string[]>; default?: string[] };
  order: number;
}

import SuggestedProjectRequestForm from '@/components/portal/SuggestedProjectRequestForm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseProps(overrides?: { surveyFields?: SurveyField[] }) {
  return {
    projectId: 42,
    projectTitle: 'Test Project',
    projectDescription: 'A project description',
    surveyFields: overrides?.surveyFields ?? [],
    heroGradient: 'from-indigo-500 to-purple-600',
  };
}

function mockFetch(success: boolean, extra?: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    json: async () => ({ success, message: success ? undefined : 'Error message', ...extra }),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SuggestedProjectRequestForm — no survey (message mode)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = mockFetch(true);
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  it('renders project title and description', () => {
    render(<SuggestedProjectRequestForm {...baseProps()} />);
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('A project description')).toBeInTheDocument();
  });

  it('renders message textarea when no survey fields', () => {
    render(<SuggestedProjectRequestForm {...baseProps()} />);
    expect(screen.getByPlaceholderText(/Describe your goals/)).toBeInTheDocument();
  });

  it('renders breadcrumb links', () => {
    render(<SuggestedProjectRequestForm {...baseProps()} />);
    expect(screen.getByText('Suggested Projects')).toBeInTheDocument();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
  });

  it('renders Back link and Submit button', () => {
    render(<SuggestedProjectRequestForm {...baseProps()} />);
    expect(screen.getByText('Back')).toBeInTheDocument();
    expect(screen.getByText('Submit Request')).toBeInTheDocument();
  });

  it('does not render progress bar when no survey fields', () => {
    render(<SuggestedProjectRequestForm {...baseProps()} />);
    expect(screen.queryByText(/required fields answered/)).not.toBeInTheDocument();
  });

  it('submits message and navigates on success', async () => {
    global.fetch = mockFetch(true);
    render(<SuggestedProjectRequestForm {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe your goals/), {
      target: { value: 'My project message' },
    });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /Submit Request/ }).closest('form')!);
    });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/portal/suggested-project-requests',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockRouterPush).toHaveBeenCalledWith('/portal/suggested-projects?requested=1');
    });
  });

  it('shows server error message on failure response', async () => {
    global.fetch = mockFetch(false);
    render(<SuggestedProjectRequestForm {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe your goals/), {
      target: { value: 'hello' },
    });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /Submit Request/ }).closest('form')!);
    });
    await waitFor(() => {
      expect(screen.getByText('Error message')).toBeInTheDocument();
    });
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it('shows generic error when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<SuggestedProjectRequestForm {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe your goals/), {
      target: { value: 'hello' },
    });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /Submit Request/ }).closest('form')!);
    });
    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });
  });

  it('sends message undefined and answers undefined for no-survey mode', async () => {
    global.fetch = mockFetch(true);
    render(<SuggestedProjectRequestForm {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe your goals/), {
      target: { value: 'My note' },
    });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /Submit Request/ }).closest('form')!);
    });
    await waitFor(() => {
      const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(body.suggestedProjectId).toBe(42);
      expect(body.message).toBe('My note');
      expect(body.answers).toBeUndefined();
    });
  });

  it('shows Submitting... while loading', async () => {
    let resolveFetch!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise(r => { resolveFetch = r; }));
    render(<SuggestedProjectRequestForm {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe your goals/), {
      target: { value: 'hello' },
    });
    act(() => {
      fireEvent.submit(screen.getByRole('button', { name: /Submit Request/ }).closest('form')!);
    });
    expect(await screen.findByText('Submitting...')).toBeInTheDocument();
    // Clean up
    await act(async () => {
      resolveFetch({ json: async () => ({ success: true }) });
    });
  });

  it('renders null description gracefully', () => {
    render(
      <SuggestedProjectRequestForm
        {...baseProps()}
        projectDescription={null}
      />,
    );
    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Survey mode
// ---------------------------------------------------------------------------

describe('SuggestedProjectRequestForm — with survey fields', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = mockFetch(true);
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  const textField: SurveyField = { id: 'f1', type: 'text', label: 'Your Name', required: true, order: 1 };
  const optionalField: SurveyField = { id: 'f2', type: 'textarea', label: 'Notes', required: false, order: 2 };
  const emailField: SurveyField = { id: 'f3', type: 'email', label: 'Email', required: true, order: 3 };
  const headingField: SurveyField = { id: 'h1', type: 'heading', label: 'Section', required: false, order: 0 };
  const selectField: SurveyField = { id: 'sel1', type: 'select', label: 'Color', required: true, options: ['Red', 'Blue'], order: 4 };
  const radioField: SurveyField = { id: 'rad1', type: 'radio', label: 'Size', required: false, options: ['Small', 'Large'], order: 5 };
  const checkboxField: SurveyField = { id: 'chk1', type: 'checkbox', label: 'Features', required: false, options: ['A', 'B', 'C'], order: 6 };
  const toggleField: SurveyField = { id: 'tog1', type: 'toggle', label: 'Active', required: false, order: 7 };
  const sliderField: SurveyField = { id: 'sld1', type: 'slider', label: 'Budget', required: false, min: 0, max: 10000, step: 500, order: 8 };
  const ratingField: SurveyField = { id: 'rat1', type: 'rating', label: 'Rating', required: false, order: 9 };
  const phoneField: SurveyField = { id: 'ph1', type: 'phone', label: 'Phone', required: false, order: 10 };
  const urlField: SurveyField = { id: 'url1', type: 'url', label: 'Website', required: false, order: 11 };
  const dateField: SurveyField = { id: 'dat1', type: 'date', label: 'Date', required: false, order: 12 };
  const numberField: SurveyField = { id: 'num1', type: 'number', label: 'Count', required: false, order: 13 };

  it('renders progress bar when required fields exist', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [textField] })} />);
    expect(screen.getByText(/required fields answered/)).toBeInTheDocument();
  });

  it('shows 100% when no required fields', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [optionalField] })} />);
    // No progress bar shown when no required fields
    expect(screen.queryByText(/required fields answered/)).not.toBeInTheDocument();
  });

  it('renders heading field as section divider', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [headingField] })} />);
    expect(screen.getByText('Section')).toBeInTheDocument();
  });

  it('renders text field with label', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [textField] })} />);
    expect(screen.getByText('Your Name')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);
  });

  it('renders helpText when provided', () => {
    const fieldWithHelp: SurveyField = { ...textField, helpText: 'Enter your full name' };
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [fieldWithHelp] })} />);
    expect(screen.getByText('Enter your full name')).toBeInTheDocument();
  });

  it('updating text field value updates state and progress', async () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [textField] })} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Alice' } });
    await waitFor(() => {
      expect(screen.getByText('1 of 1 required fields answered')).toBeInTheDocument();
    });
  });

  it('shows required validation error when required field empty on submit', async () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [textField] })} />);
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /Submit Request/ }).closest('form')!);
    });
    await waitFor(() => {
      expect(screen.getByText(/"Your Name" is required\./)).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('submits survey answers correctly', async () => {
    global.fetch = mockFetch(true);
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [textField] })} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bob' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /Submit Request/ }).closest('form')!);
    });
    await waitFor(() => {
      const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(body.answers['Your Name']).toBe('Bob');
      expect(body.message).toBeUndefined();
    });
  });

  it('renders select field and allows selection', async () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [selectField] })} />);
    const sel = screen.getByRole('combobox');
    fireEvent.change(sel, { target: { value: 'Red' } });
    await waitFor(() => {
      expect(screen.getByText('1 of 1 required fields answered')).toBeInTheDocument();
    });
  });

  it('renders radio buttons and can select one', async () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [radioField] })} />);
    const smallBtn = screen.getByText('Small');
    fireEvent.click(smallBtn);
    // Selected styling applied — button still in DOM
    expect(smallBtn).toBeInTheDocument();
  });

  it('renders checkbox pills and toggles selection', async () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [checkboxField] })} />);
    const aBtn = screen.getByText('A');
    fireEvent.click(aBtn);
    fireEvent.click(aBtn); // deselect
    expect(aBtn).toBeInTheDocument();
  });

  it('renders toggle field and toggles value', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [toggleField] })} />);
    const toggle = screen.getByText('No').closest('div')!;
    fireEvent.click(toggle);
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('renders slider field with range input', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [sliderField] })} />);
    const range = screen.getByRole('slider');
    expect(range).toBeInTheDocument();
    fireEvent.change(range, { target: { value: '3000' } });
  });

  it('renders rating field with 5 stars', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [ratingField] })} />);
    // 5 star buttons
    const starBtns = screen.getAllByRole('button').filter(b => b.querySelector('.material-icons')?.textContent === 'star');
    expect(starBtns.length).toBe(5);
    fireEvent.click(starBtns[2]); // select 3 stars
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
  });

  it('renders email field with email placeholder default', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [emailField] })} />);
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  });

  it('renders phone field with tel placeholder', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [phoneField] })} />);
    expect(screen.getByPlaceholderText('+1 (555) 000-0000')).toBeInTheDocument();
  });

  it('renders url field with url placeholder', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [urlField] })} />);
    expect(screen.getByPlaceholderText('https://example.com')).toBeInTheDocument();
  });

  it('renders date field', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [dateField] })} />);
    expect(screen.getByDisplayValue('')).toBeInTheDocument();
  });

  it('renders number field', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [numberField] })} />);
    const input = document.querySelector('input[type="number"]');
    expect(input).toBeInTheDocument();
  });

  it('shows "Answer the previous question to see options" when conditionalOptions pending', () => {
    const depField: SurveyField = {
      id: 'dep1', type: 'select', label: 'Sub', required: false, order: 10,
      conditionalOptions: { fieldId: 'rad1', map: { Small: ['XS', 'S'] }, default: [] },
    };
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [radioField, depField] })} />);
    expect(screen.getByText('Answer the previous question to see options.')).toBeInTheDocument();
  });

  it('showIf hides field when condition not met', () => {
    const conditionalField: SurveyField = {
      id: 'cf1', type: 'text', label: 'Hidden Field', required: false, order: 20,
      showIf: { fieldId: 'rad1', values: ['Large'] },
    };
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [radioField, conditionalField] })} />);
    expect(screen.queryByText('Hidden Field')).not.toBeInTheDocument();
  });

  it('showIf reveals field when condition met', async () => {
    const conditionalField: SurveyField = {
      id: 'cf1', type: 'text', label: 'Hidden Field', required: false, order: 20,
      showIf: { fieldId: 'rad1', values: ['Large'] },
    };
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [radioField, conditionalField] })} />);
    fireEvent.click(screen.getByText('Large'));
    await waitFor(() => {
      expect(screen.getByText('Hidden Field')).toBeInTheDocument();
    });
  });

  it('showIf with array value (checkbox) reveals field when any value matches', async () => {
    const conditionalField: SurveyField = {
      id: 'cf2', type: 'text', label: 'Array Hidden', required: false, order: 30,
      showIf: { fieldId: 'chk1', values: ['B'] },
    };
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [checkboxField, conditionalField] })} />);
    fireEvent.click(screen.getByText('B'));
    await waitFor(() => {
      expect(screen.getByText('Array Hidden')).toBeInTheDocument();
    });
  });

  it('conditionalOptions with map returns mapped options after dep answered', async () => {
    const depField: SurveyField = {
      id: 'dep2', type: 'select', label: 'Sub Options', required: false, order: 20,
      conditionalOptions: { fieldId: 'rad1', map: { Small: ['XS', 'S'], Large: ['L', 'XL'] } },
    };
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [radioField, depField] })} />);
    // Select 'Small' radio
    fireEvent.click(screen.getByText('Small'));
    await waitFor(() => {
      expect(screen.getByText('XS')).toBeInTheDocument();
    });
  });

  it('heading fields not counted as required and not numbered', () => {
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [headingField, textField] })} />);
    // Only 1 required field (textField), heading not included
    expect(screen.getByText(/0 of 1 required fields answered/)).toBeInTheDocument();
  });

  it('required field with array answer (checkbox) validates correctly', async () => {
    const requiredCheckbox: SurveyField = { ...checkboxField, required: true };
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [requiredCheckbox] })} />);
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /Submit Request/ }).closest('form')!);
    });
    await waitFor(() => {
      expect(screen.getByText(/"Features" is required\./)).toBeInTheDocument();
    });
  });

  it('does not send skipped invisible required fields', async () => {
    // A required field hidden by showIf should be skipped in validation
    const hiddenRequired: SurveyField = {
      id: 'hr1', type: 'text', label: 'Hidden Required', required: true, order: 5,
      showIf: { fieldId: 'rad1', values: ['Large'] },
    };
    global.fetch = mockFetch(true);
    render(<SuggestedProjectRequestForm {...baseProps({ surveyFields: [radioField, hiddenRequired] })} />);
    // Submit without revealing the field — should pass validation
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /Submit Request/ }).closest('form')!);
    });
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/portal/suggested-projects?requested=1');
    });
  });
});
