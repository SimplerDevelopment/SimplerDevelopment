/**
 * QuestionTypePicker — type-selection control integration test.
 *
 * The picker is a controlled <select> exposing FieldType values. We verify
 * its onChange callback fires with the new FieldType when the user changes
 * the selection.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionTypePicker, {
  QUESTION_TYPES,
} from '@/app/portal/surveys/[id]/_components/QuestionTypePicker';

describe('QuestionTypePicker', () => {
  it('renders all known question-type options', () => {
    const onChange = vi.fn();
    render(<QuestionTypePicker value="text" onChange={onChange} />);

    const select = screen.getByLabelText('Question type') as HTMLSelectElement;
    expect(select.value).toBe('text');
    // Every entry from QUESTION_TYPES should be present in the option list.
    for (const t of QUESTION_TYPES) {
      expect(screen.getByRole('option', { name: t.label })).toBeInTheDocument();
    }
  });

  it('emits onChange with the selected FieldType when the user picks a new type', async () => {
    const onChange = vi.fn();
    render(<QuestionTypePicker value="text" onChange={onChange} />);

    const select = screen.getByLabelText('Question type');
    await userEvent.selectOptions(select, 'rating');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('rating');
  });
});
