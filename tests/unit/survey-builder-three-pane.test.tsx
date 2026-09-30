// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
let flag = true;
vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => flag }));
import SurveyBuilder from '@/components/admin/SurveyBuilder';
import type { SurveyField } from '@/components/admin/SurveyBuilder.types';

afterEach(cleanup);
const fields: SurveyField[] = [
  { id: 'q1', type: 'radio', label: 'How was your guide?', placeholder: '', helpText: '', required: true, options: ['Poor', 'Good', 'Great'], order: 0 },
  { id: 'q2', type: 'slider', label: 'How likely to recommend?', placeholder: '', helpText: '', required: false, options: [], min: 0, max: 10, order: 1, scoring: { type: 'nps' } },
];

describe('PUX-179 SurveyBuilder three panes', () => {
  it('studio: list · preview · settings; selecting a question moves the preview and the editor', () => {
    flag = true;
    const onChange = vi.fn();
    render(<SurveyBuilder fields={fields} onChange={onChange} />);
    expect(screen.getByLabelText('Questions')).toBeTruthy();
    const preview = screen.getByLabelText('Preview');
    expect(preview.textContent).toContain('How was your guide?');
    expect(screen.getByLabelText('Question settings').textContent).toContain('ID: q1');
    fireEvent.click(screen.getByText('How likely to recommend?'));
    expect(preview.textContent).toContain('scored as NPS');
    expect(screen.getByLabelText('Question settings').textContent).toContain('ID: q2');
    expect(screen.getByLabelText('Question settings').innerHTML).toContain('studio-gold-surface'); // NPS gold
    fireEvent.change(screen.getAllByDisplayValue('How likely to recommend?')[0], { target: { value: 'Would you recommend us?' } });
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'q2', label: 'Would you recommend us?' })]));
  });
  it('flag off: the accordion, no panes', () => {
    flag = false;
    render(<SurveyBuilder fields={fields} onChange={() => {}} />);
    expect(screen.queryByLabelText('Questions')).toBeNull();
    expect(screen.queryByLabelText('Preview')).toBeNull();
    expect(screen.getAllByTitle('Edit').length).toBe(2);
  });
});
