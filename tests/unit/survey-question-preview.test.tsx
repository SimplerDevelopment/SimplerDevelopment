// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import QuestionPreview from '@/components/admin/survey-builder/QuestionPreview';
import type { SurveyField } from '@/components/admin/SurveyBuilder.types';

afterEach(cleanup);
const base = { id: 'f1', placeholder: '', helpText: '', required: false, options: [], order: 0 } as const;

describe('PUX-179 QuestionPreview', () => {
  it('draws a radio question with its options and the required mark', () => {
    render(<QuestionPreview field={{ ...base, type: 'radio', label: 'How was your guide?', required: true, options: ['Poor', 'Good', 'Great'] } as SurveyField} surveyTitle="Post-trip feedback" />);
    expect(screen.getByText('How was your guide?')).toBeTruthy();
    expect(screen.getByLabelText('required')).toBeTruthy();
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(3);
  });
  it('an NPS-scored slider gets the gold frame and the 0–10 scale', () => {
    const { container } = render(<QuestionPreview field={{ ...base, type: 'slider', label: 'How likely to recommend?', min: 0, max: 10, scoring: { type: 'nps' } } as SurveyField} />);
    expect(container.querySelector('input[type="range"]')?.getAttribute('max')).toBe('10');
    expect(container.textContent).toContain('scored as NPS');
    expect(container.innerHTML).toContain('studio-gold-line');
  });
  it('nothing selected → a nudge, not a blank', () => {
    render(<QuestionPreview field={null} />);
    expect(screen.getByText(/Pick a question/)).toBeTruthy();
  });
});
