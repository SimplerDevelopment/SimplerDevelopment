// @vitest-environment jsdom
/**
 * Unit tests for GenerateSurveyModal (PUX-033 step 4) —
 * components/portal/projects/GenerateSurveyModal.tsx
 *
 * Covers:
 *  - Not rendered when open=false
 *  - Renders the three preset radio cards when open=true
 *  - Selecting a preset and clicking Generate POSTs
 *    /api/portal/projects/<id>/surveys/generate with { preset }
 *  - Success state shows the survey title, approval URL and reviewed-card
 *    count for qa_review
 *  - Error state shows the API's `error` message
 *
 * fetch is mocked the way sibling modal tests do (components-crm-new-deal-modal
 * mocks its api module directly; this component calls fetch itself, so we
 * stub global.fetch per the CrmAddDealModal/CrmAddContactModal convention).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import GenerateSurveyModal from '../../components/portal/projects/GenerateSurveyModal';

function makeProps(overrides: Partial<Parameters<typeof GenerateSurveyModal>[0]> = {}) {
  return {
    projectId: 42,
    open: true,
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('GenerateSurveyModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  describe('rendering', () => {
    it('renders nothing when open=false', () => {
      const { container } = render(<GenerateSurveyModal {...makeProps({ open: false })} />);
      expect(container.textContent).toBe('');
    });

    it('renders the dialog with the three preset radio cards when open=true', () => {
      render(<GenerateSurveyModal {...makeProps()} />);
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(screen.getByText('QA review')).toBeTruthy();
      expect(screen.getByText('Stakeholder feedback')).toBeTruthy();
      expect(screen.getByText('Retro')).toBeTruthy();
    });

    it('defaults the qa_review preset as checked', () => {
      const { container } = render(<GenerateSurveyModal {...makeProps()} />);
      const radios = Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      const qaRadio = radios.find((r) => r.value === 'qa_review')!;
      expect(qaRadio.checked).toBe(true);
    });

    it('renders no error message on initial render', () => {
      const { container } = render(<GenerateSurveyModal {...makeProps()} />);
      expect(container.querySelector('.text-destructive')).toBeNull();
    });
  });

  describe('generate — payload', () => {
    it('POSTs to /api/portal/projects/<id>/surveys/generate with the selected preset', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        json: async () => ({
          success: true,
          data: {
            survey: { id: 1, slug: 'retro-abc', title: 'Retro — Project X', status: 'draft' },
            approvalUrl: 'https://portal.example.com/approve/tok123',
            publicPath: '/s/retro-abc',
            artifactId: 5,
            reviewedCardIds: [],
          },
        }),
      });
      const { container } = render(<GenerateSurveyModal {...makeProps({ projectId: 42 })} />);
      const radios = Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      // Deliberately select a preset OTHER than 'retro' — if the component
      // ever ignored the selection and always sent 'retro' (the default
      // radio choice, plus a plausible copy/paste bug), this assertion would
      // still pass unless we pick something else here.
      const stakeholderRadio = radios.find((r) => r.value === 'stakeholder_feedback')!;
      fireEvent.click(stakeholderRadio);
      fireEvent.click(screen.getByText('Generate'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/portal/projects/42/surveys/generate',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ preset: 'stakeholder_feedback' }),
          }),
        );
      });
    });
  });

  describe('generate — success', () => {
    it('shows the survey title, approval URL and reviewed-card count for qa_review', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        json: async () => ({
          success: true,
          data: {
            survey: { id: 1, slug: 'qa-review-abc', title: 'QA review — Project X', status: 'draft' },
            approvalUrl: 'https://portal.example.com/approve/tok456',
            publicPath: '/s/qa-review-abc',
            artifactId: 7,
            reviewedCardIds: [101, 102, 103],
          },
        }),
      });
      const { container } = render(<GenerateSurveyModal {...makeProps()} />);
      fireEvent.click(screen.getByText('Generate'));

      await waitFor(() => {
        expect(container.textContent).toContain('QA review — Project X');
      });
      expect(container.textContent).toContain('3 cards will be reviewed.');
      const urlInput = container.querySelector('input[readonly]') as HTMLInputElement;
      expect(urlInput.value).toBe('https://portal.example.com/approve/tok456');
      expect(container.textContent).toContain('/s/qa-review-abc');
    });

    it('calls onGenerated with the response data', async () => {
      const onGenerated = vi.fn();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        json: async () => ({
          success: true,
          data: {
            survey: { id: 2, slug: 'stakeholder-abc', title: 'Milestone check-in — Project X', status: 'draft' },
            approvalUrl: null,
            publicPath: '/s/stakeholder-abc',
            artifactId: 9,
            reviewedCardIds: [],
          },
        }),
      });
      render(<GenerateSurveyModal {...makeProps({ onGenerated })} />);
      fireEvent.click(screen.getByText('Generate'));

      await waitFor(() => {
        expect(onGenerated).toHaveBeenCalledWith(
          expect.objectContaining({ survey: expect.objectContaining({ id: 2 }) }),
        );
      });
    });
  });

  describe('generate — error', () => {
    it('shows the API error message on a 400/404 response', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        json: async () => ({ success: false, error: 'Project not found' }),
      });
      render(<GenerateSurveyModal {...makeProps()} />);
      fireEvent.click(screen.getByText('Generate'));

      await waitFor(() => {
        expect(screen.getByText('Project not found')).toBeTruthy();
      });
    });
  });

  describe('close behavior', () => {
    it('clicking the overlay calls onClose', () => {
      const onClose = vi.fn();
      const { container } = render(<GenerateSurveyModal {...makeProps({ onClose })} />);
      fireEvent.click(container.firstElementChild as HTMLElement);
      expect(onClose).toHaveBeenCalled();
    });

    it('pressing Escape calls onClose', () => {
      const onClose = vi.fn();
      render(<GenerateSurveyModal {...makeProps({ onClose })} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });
});
