/**
 * QuestionEditor — single-question edit form integration test.
 *
 * QuestionEditor today is a controlled adapter around the existing
 * components/admin/SurveyBuilder. We assert the user-visible contract:
 * editing the field's label triggers the onChange callback with the patched
 * field. This test pins the seam so a future split into a dedicated editor
 * component can land without breaking the page.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionEditor from '@/app/portal/surveys/[id]/_components/QuestionEditor';
import type { SurveyField } from '@/components/admin/SurveyBuilder';

function makeField(overrides: Partial<SurveyField> = {}): SurveyField {
  return {
    id: 'q-test',
    type: 'text',
    label: 'Original Label',
    placeholder: '',
    helpText: '',
    required: false,
    options: [],
    order: 0,
    ...overrides,
  };
}

describe('QuestionEditor', () => {
  it('renders the field label in the collapsed header', () => {
    const onChange = vi.fn();
    render(<QuestionEditor field={makeField({ label: 'How old are you?' })} onChange={onChange} />);
    // SurveyBuilder shows the label as the first row title.
    expect(screen.getAllByText('How old are you?').length).toBeGreaterThan(0);
  });

  it('emits onChange with patched label when user edits the label input', async () => {
    const onChange = vi.fn();
    const field = makeField({ label: 'Original Label' });
    render(<QuestionEditor field={field} onChange={onChange} />);

    // Expand the editor by clicking the pencil button (title="Edit").
    const expand = screen.getByTitle('Edit');
    await userEvent.click(expand);

    // The label input uses the unique placeholder from SurveyBuilder.
    const labelInput = screen.getByPlaceholderText(/What is your domain name\?/);
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, 'A');

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.id).toBe('q-test');
    // The final patched label should include the typed character.
    expect(lastCall.label).toContain('A');
  });
});
