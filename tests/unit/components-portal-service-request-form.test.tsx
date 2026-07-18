// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import type { SurveyField } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; className?: string }) =>
    React.createElement('a', { href, ...rest }, children),
}));

const mockFetch = vi.fn();
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch;
});

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import ServiceRequestForm from '@/components/portal/ServiceRequestForm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeField(overrides: Partial<SurveyField>): SurveyField {
  return {
    id: 'field-1',
    type: 'text',
    label: 'Your Name',
    required: false,
    order: 0,
    ...overrides,
  };
}

const BASE_PROPS = {
  serviceId: 42,
  serviceName: 'Web Design',
  serviceDescription: 'We build great websites.',
  surveyFields: [] as SurveyField[],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ServiceRequestForm', () => {
  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  describe('initial render', () => {
    it('renders service name and description', () => {
      render(<ServiceRequestForm {...BASE_PROPS} />);

      expect(screen.getByText('Web Design')).toBeInTheDocument();
      expect(screen.getByText('We build great websites.')).toBeInTheDocument();
    });

    it('renders breadcrumb links', () => {
      render(<ServiceRequestForm {...BASE_PROPS} />);

      expect(screen.getByText('Services')).toBeInTheDocument();
      expect(screen.getByText('Request')).toBeInTheDocument();
    });

    it('renders submit button', () => {
      render(<ServiceRequestForm {...BASE_PROPS} />);

      expect(screen.getByRole('button', { name: /Submit Request/i })).toBeInTheDocument();
    });

    it('omits description when null', () => {
      render(
        <ServiceRequestForm {...BASE_PROPS} serviceDescription={null} />,
      );

      expect(screen.queryByText('We build great websites.')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // No-survey mode (plain message textarea)
  // -------------------------------------------------------------------------

  describe('no-survey mode', () => {
    it('renders message textarea when no survey fields', () => {
      render(<ServiceRequestForm {...BASE_PROPS} />);

      expect(screen.getByPlaceholderText(/Describe what you need/i)).toBeInTheDocument();
      expect(screen.getByText(/Tell us about your project/i)).toBeInTheDocument();
    });

    it('does not render progress bar when no survey fields', () => {
      render(<ServiceRequestForm {...BASE_PROPS} />);

      expect(screen.queryByText(/of.*required fields answered/i)).not.toBeInTheDocument();
    });

    it('submits message and redirects on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<ServiceRequestForm {...BASE_PROPS} />);

      fireEvent.change(screen.getByPlaceholderText(/Describe what you need/i), {
        target: { value: 'I need a landing page.' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Submit Request/i }));
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/portal/services?requested=1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/portal/service-requests',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"serviceId":42'),
        }),
      );
    });

    it('shows API error message on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, message: 'Service unavailable' }),
      });

      render(<ServiceRequestForm {...BASE_PROPS} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Submit Request/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Service unavailable')).toBeInTheDocument();
      });
    });

    it('shows fallback error when no message in failure response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false }),
      });

      render(<ServiceRequestForm {...BASE_PROPS} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Submit Request/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to submit request.')).toBeInTheDocument();
      });
    });

    it('shows network error when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<ServiceRequestForm {...BASE_PROPS} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Submit Request/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Survey mode — field types
  // -------------------------------------------------------------------------

  describe('survey mode — field types', () => {
    it('renders progress bar when survey has required fields', () => {
      const fields = [makeField({ id: 'f1', required: true, label: 'Full Name' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByText(/0 of 1 required fields answered/i)).toBeInTheDocument();
    });

    it('renders heading type as section divider', () => {
      const fields = [makeField({ id: 'h1', type: 'heading', label: 'Contact Info', required: false })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByText('Contact Info')).toBeInTheDocument();
    });

    it('renders text field', () => {
      const fields = [makeField({ id: 'f1', type: 'text', label: 'Full Name', placeholder: 'Enter name' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByPlaceholderText('Enter name')).toBeInTheDocument();
    });

    it('renders textarea field', () => {
      const fields = [makeField({ id: 'f1', type: 'textarea', label: 'Description', placeholder: 'Describe...' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByPlaceholderText('Describe...')).toBeInTheDocument();
    });

    it('renders number field', () => {
      const fields = [makeField({ id: 'f1', type: 'number', label: 'Budget' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      const input = screen.getByRole('spinbutton');
      expect(input).toBeInTheDocument();
    });

    it('renders email field with default placeholder', () => {
      const fields = [makeField({ id: 'f1', type: 'email', label: 'Email' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    });

    it('renders phone field with default placeholder', () => {
      const fields = [makeField({ id: 'f1', type: 'phone', label: 'Phone' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByPlaceholderText('+1 (555) 000-0000')).toBeInTheDocument();
    });

    it('renders url field with default placeholder', () => {
      const fields = [makeField({ id: 'f1', type: 'url', label: 'Website' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByPlaceholderText('https://example.com')).toBeInTheDocument();
    });

    it('renders date field', () => {
      const fields = [makeField({ id: 'f1', type: 'date', label: 'Start Date' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      // The component renders a date input (no placeholder/label association)
      expect(screen.getByText('Start Date')).toBeInTheDocument();
      expect(document.querySelector('input[type="date"]')).toBeInTheDocument();
    });

    it('renders select field with options', () => {
      const fields = [
        makeField({ id: 'f1', type: 'select', label: 'Priority', options: ['Low', 'Medium', 'High'] }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
    });

    it('renders radio field as card buttons', () => {
      const fields = [
        makeField({ id: 'f1', type: 'radio', label: 'Plan', options: ['Starter', 'Pro', 'Enterprise'] }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByText('Starter')).toBeInTheDocument();
      expect(screen.getByText('Pro')).toBeInTheDocument();
      expect(screen.getByText('Enterprise')).toBeInTheDocument();
    });

    it('renders checkbox field as pill buttons', () => {
      const fields = [
        makeField({ id: 'f1', type: 'checkbox', label: 'Services', options: ['SEO', 'PPC', 'Design'] }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByText('SEO')).toBeInTheDocument();
      expect(screen.getByText('PPC')).toBeInTheDocument();
      expect(screen.getByText('Design')).toBeInTheDocument();
    });

    it('renders toggle field', () => {
      const fields = [makeField({ id: 'f1', type: 'toggle', label: 'Rush Order?' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByText('Rush Order?')).toBeInTheDocument();
      expect(screen.getByText('No')).toBeInTheDocument();
    });

    it('renders slider field with min/max/step', () => {
      const fields = [
        makeField({ id: 'f1', type: 'slider', label: 'Budget', min: 0, max: 50000, step: 1000 }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByText('Budget')).toBeInTheDocument();
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('renders rating field with 5 stars', () => {
      const fields = [makeField({ id: 'f1', type: 'rating', label: 'Satisfaction' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      const stars = screen.getAllByRole('button').filter(b =>
        b.querySelector('.material-icons')?.textContent === 'star',
      );
      expect(stars.length).toBe(5);
    });

    it('renders helpText when provided', () => {
      const fields = [
        makeField({ id: 'f1', type: 'text', label: 'Name', helpText: 'Enter your full legal name.' }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByText('Enter your full legal name.')).toBeInTheDocument();
    });

    it('renders required asterisk for required fields', () => {
      const fields = [makeField({ id: 'f1', type: 'text', label: 'Email', required: true })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      // The asterisk is a <span> child of the label
      expect(screen.getByText('*')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Survey interactions
  // -------------------------------------------------------------------------

  describe('survey interactions', () => {
    it('typing in text field updates answer and progress', async () => {
      const fields = [makeField({ id: 'f1', type: 'text', label: 'Full Name', required: true, placeholder: 'Enter full name' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByText('0 of 1 required fields answered')).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText('Enter full name'), {
        target: { value: 'Jane Doe' },
      });

      await waitFor(() => {
        expect(screen.getByText('1 of 1 required fields answered')).toBeInTheDocument();
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
    });

    it('selecting a radio option marks it selected', async () => {
      const fields = [
        makeField({ id: 'f1', type: 'radio', label: 'Plan', options: ['Starter', 'Pro'] }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      fireEvent.click(screen.getByText('Starter'));

      // After click the button for 'Starter' should reflect selected state (border-primary class)
      await waitFor(() => {
        const starterBtn = screen.getByText('Starter').closest('button');
        expect(starterBtn?.className).toContain('border-primary');
      });
    });

    it('clicking checkbox pill toggles selection on and off', async () => {
      const fields = [
        makeField({ id: 'f1', type: 'checkbox', label: 'Features', options: ['Analytics', 'Reports'] }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      const analyticsBtn = screen.getByText('Analytics').closest('button')!;

      // Initially not selected — has border-border, not bg-primary/8
      expect(analyticsBtn.className).toContain('border-border');
      expect(analyticsBtn.className).not.toContain('bg-primary/8');

      // Select
      fireEvent.click(analyticsBtn);

      await waitFor(() => {
        expect(analyticsBtn.className).toContain('bg-primary/8');
      });

      // Deselect
      fireEvent.click(analyticsBtn);

      await waitFor(() => {
        expect(analyticsBtn.className).not.toContain('bg-primary/8');
        expect(analyticsBtn.className).toContain('border-border');
      });
    });

    it('clicking toggle switches from No to Yes', async () => {
      const fields = [makeField({ id: 'f1', type: 'toggle', label: 'Rush?' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByText('No')).toBeInTheDocument();

      fireEvent.click(screen.getByText('No').closest('div')!);

      await waitFor(() => {
        expect(screen.getByText('Yes')).toBeInTheDocument();
      });
    });

    it('clicking a rating star sets the value and shows X / 5', async () => {
      const fields = [makeField({ id: 'f1', type: 'rating', label: 'Rating' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      const starBtns = screen.getAllByRole('button').filter(b =>
        b.querySelector('.material-icons')?.textContent === 'star',
      );

      fireEvent.click(starBtns[2]); // 3rd star

      await waitFor(() => {
        expect(screen.getByText('3 / 5')).toBeInTheDocument();
      });
    });

    it('slider change updates displayed value', async () => {
      const fields = [
        makeField({ id: 'f1', type: 'slider', label: 'Budget', min: 0, max: 10000, step: 500 }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '5000' } });

      await waitFor(() => {
        expect(screen.getByText('$5,000')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Conditional visibility
  // -------------------------------------------------------------------------

  describe('conditional visibility (showIf)', () => {
    it('hides field when showIf condition is not met', () => {
      const fields = [
        makeField({ id: 'f1', type: 'radio', label: 'Plan', options: ['Basic', 'Pro'] }),
        makeField({
          id: 'f2',
          type: 'text',
          label: 'Pro Feature',
          showIf: { fieldId: 'f1', values: ['Pro'] },
        }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.queryByLabelText(/Pro Feature/i)).not.toBeInTheDocument();
    });

    it('shows field when showIf condition is met', async () => {
      const fields = [
        makeField({ id: 'f1', type: 'radio', label: 'Plan', options: ['Basic', 'Pro'] }),
        makeField({
          id: 'f2',
          type: 'text',
          label: 'Pro Feature',
          placeholder: 'Pro feature value',
          showIf: { fieldId: 'f1', values: ['Pro'] },
        }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      // Select 'Pro'
      fireEvent.click(screen.getByText('Pro'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Pro feature value')).toBeInTheDocument();
      });
    });

    it('conditional field not counted in progress when hidden', () => {
      const fields = [
        makeField({ id: 'f1', type: 'radio', label: 'Plan', options: ['Basic', 'Pro'] }),
        makeField({
          id: 'f2',
          type: 'text',
          label: 'Pro Feature',
          required: true,
          showIf: { fieldId: 'f1', values: ['Pro'] },
        }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      // f2 is hidden so required count should be 0
      expect(screen.queryByText(/required fields answered/i)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Conditional options
  // -------------------------------------------------------------------------

  describe('conditional options', () => {
    it('shows pending message when parent field not answered', () => {
      const fields = [
        makeField({ id: 'f1', type: 'radio', label: 'Region', options: ['US', 'EU'] }),
        makeField({
          id: 'f2',
          type: 'select',
          label: 'Country',
          conditionalOptions: {
            fieldId: 'f1',
            map: { US: ['California', 'Texas'], EU: ['France', 'Germany'] },
          },
        }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      expect(screen.getByText('Answer the previous question to see options.')).toBeInTheDocument();
    });

    it('shows mapped options when parent field is answered', async () => {
      const fields = [
        makeField({ id: 'f1', type: 'radio', label: 'Region', options: ['US', 'EU'] }),
        makeField({
          id: 'f2',
          type: 'select',
          label: 'Country',
          options: [],
          conditionalOptions: {
            fieldId: 'f1',
            map: { US: ['California', 'Texas'], EU: ['France', 'Germany'] },
          },
        }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      fireEvent.click(screen.getByText('US'));

      await waitFor(() => {
        expect(screen.getByText('California')).toBeInTheDocument();
        expect(screen.getByText('Texas')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('form validation', () => {
    it('prevents submit when required field is empty', async () => {
      const fields = [makeField({ id: 'f1', type: 'text', label: 'Full Name', required: true })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Submit Request/i }));
      });

      expect(screen.getByText(/"Full Name" is required\./i)).toBeInTheDocument();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('prevents submit when required checkbox field has no selection', async () => {
      const fields = [
        makeField({
          id: 'f1',
          type: 'checkbox',
          label: 'Features',
          required: true,
          options: ['SEO', 'PPC'],
        }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Submit Request/i }));
      });

      expect(screen.getByText(/"Features" is required\./i)).toBeInTheDocument();
    });

    it('skips validation for hidden required field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const fields = [
        makeField({ id: 'f1', type: 'radio', label: 'Plan', options: ['Basic', 'Pro'] }),
        makeField({
          id: 'f2',
          type: 'text',
          label: 'Pro Feature',
          required: true,
          showIf: { fieldId: 'f1', values: ['Pro'] },
        }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      // f2 is hidden — should not block submit
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Submit Request/i }));
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('skips heading fields in validation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const fields = [
        makeField({ id: 'h1', type: 'heading', label: 'Section', required: true }),
      ];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Submit Request/i }));
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('submits with namedAnswers for survey fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const fields = [makeField({ id: 'f1', type: 'text', label: 'Company', required: false, placeholder: 'Company name' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      fireEvent.change(screen.getByPlaceholderText('Company name'), {
        target: { value: 'Acme Corp' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Submit Request/i }));
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.answers).toEqual({ Company: 'Acme Corp' });
      expect(body.message).toBeUndefined();
    });

    it('shows progress bar at 100% when all required fields answered', async () => {
      const fields = [makeField({ id: 'f1', type: 'text', label: 'Name', required: true, placeholder: 'Your name' })];

      render(<ServiceRequestForm {...BASE_PROPS} surveyFields={fields} />);

      fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Dan' } });

      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('disables submit button while loading', async () => {
      let resolvePromise!: (value: unknown) => void;
      const pendingPromise = new Promise(res => { resolvePromise = res; });
      mockFetch.mockReturnValueOnce(pendingPromise);

      render(<ServiceRequestForm {...BASE_PROPS} />);

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /Submit Request/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Submitting.../i })).toBeDisabled();
      });

      // Resolve to avoid open handles
      resolvePromise({ ok: true, json: async () => ({ success: true }) });
    });
  });
});
