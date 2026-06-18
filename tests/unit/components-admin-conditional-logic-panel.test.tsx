// @vitest-environment jsdom
/**
 * Unit tests for `components/admin/ConditionalLogicPanel.tsx`
 * Covers: empty state, add/remove rules, field/operator/value changes,
 * presence operators, numeric operators, contains operators, multi-value
 * checkboxes, multi-value free-text, choice single-select, clear-all,
 * legacy showIf shape, compound showIf shape.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks (must precede component import)
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => ({
  // Only types are imported from schema; no runtime values needed.
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import ConditionalLogicPanel from '@/components/admin/ConditionalLogicPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ShowIfCondition = {
  combinator: 'AND';
  rules: Array<{ fieldId: string; operator: string; values: string[] }>;
};

type ShowIfLegacy = { fieldId: string; values: string[] };

interface MinimalField {
  id: string;
  type: string;
  label: string;
  options: string[];
  showIf?: ShowIfLegacy | ShowIfCondition;
}

function makeTextField(overrides: Partial<MinimalField> = {}): MinimalField {
  return {
    id: 'field-1',
    type: 'text',
    label: 'Name',
    options: [],
    ...overrides,
  };
}

function makeChoiceField(overrides: Partial<MinimalField> = {}): MinimalField {
  return {
    id: 'choice-field',
    type: 'select',
    label: 'Colour',
    options: ['Red', 'Blue', 'Green'],
    ...overrides,
  };
}

function makeNumericField(overrides: Partial<MinimalField> = {}): MinimalField {
  return {
    id: 'num-field',
    type: 'number',
    label: 'Age',
    options: [],
    ...overrides,
  };
}

function renderPanel(
  field: MinimalField,
  allFields: MinimalField[],
  onChange = vi.fn(),
) {
  return {
    onChange,
    ...render(
      <ConditionalLogicPanel
        field={field as Parameters<typeof ConditionalLogicPanel>[0]['field']}
        allFields={allFields as Parameters<typeof ConditionalLogicPanel>[0]['allFields']}
        onChange={onChange}
      />,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConditionalLogicPanel — empty state (no showIf)', () => {
  it('renders "Add Condition" button when no showIf', () => {
    renderPanel(makeTextField(), []);
    expect(screen.getByRole('button', { name: /Add Condition/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add another rule/i })).not.toBeInTheDocument();
  });

  it('calls onChange with a single empty rule when Add Condition is clicked', () => {
    const { onChange } = renderPanel(makeTextField(), []);
    fireEvent.click(screen.getByRole('button', { name: /Add Condition/i }));
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as { showIf: ShowIfCondition };
    expect(arg.showIf.combinator).toBe('AND');
    expect(arg.showIf.rules).toHaveLength(1);
    expect(arg.showIf.rules[0].fieldId).toBe('');
  });
});

describe('ConditionalLogicPanel — rules configured', () => {
  const textField = makeTextField();
  const allFields = [makeChoiceField()];
  const existingShowIf: ShowIfCondition = {
    combinator: 'AND',
    rules: [{ fieldId: 'choice-field', operator: 'equals', values: ['Red'] }],
  };

  it('renders rule rows when showIf is provided', () => {
    renderPanel({ ...textField, showIf: existingShowIf }, allFields);
    // Should show field selector, operator selector, and value selector
    const selects = screen.getAllByRole('combobox');
    // At least field-selector, operator-selector, value-selector
    expect(selects.length).toBeGreaterThanOrEqual(3);
  });

  it('shows "Add another rule" button when rules exist', () => {
    renderPanel({ ...textField, showIf: existingShowIf }, allFields);
    expect(screen.getByRole('button', { name: /Add another rule/i })).toBeInTheDocument();
  });

  it('shows clear-all (cancel) button when rules exist', () => {
    renderPanel({ ...textField, showIf: existingShowIf }, allFields);
    expect(screen.getByTitle('Remove all conditions')).toBeInTheDocument();
  });

  it('calls onChange with undefined showIf when clear-all is clicked', () => {
    const { onChange } = renderPanel({ ...textField, showIf: existingShowIf }, allFields);
    fireEvent.click(screen.getByTitle('Remove all conditions'));
    expect(onChange).toHaveBeenCalledWith({ showIf: undefined });
  });

  it('adds a second rule when "Add another rule" is clicked', () => {
    const { onChange } = renderPanel({ ...textField, showIf: existingShowIf }, allFields);
    fireEvent.click(screen.getByRole('button', { name: /Add another rule/i }));
    const arg = onChange.mock.calls[0][0] as { showIf: ShowIfCondition };
    expect(arg.showIf.rules).toHaveLength(2);
  });

  it('removes a rule when the remove-rule button is clicked', () => {
    // Start with two rules
    const twoRules: ShowIfCondition = {
      combinator: 'AND',
      rules: [
        { fieldId: 'choice-field', operator: 'equals', values: ['Red'] },
        { fieldId: 'choice-field', operator: 'equals', values: ['Blue'] },
      ],
    };
    const { onChange } = renderPanel({ ...textField, showIf: twoRules }, allFields);
    const removeBtns = screen.getAllByTitle('Remove this rule');
    fireEvent.click(removeBtns[0]);
    const arg = onChange.mock.calls[0][0] as { showIf: ShowIfCondition };
    expect(arg.showIf.rules).toHaveLength(1);
  });

  it('removes last rule and calls onChange with undefined showIf', () => {
    const { onChange } = renderPanel({ ...textField, showIf: existingShowIf }, allFields);
    fireEvent.click(screen.getByTitle('Remove this rule'));
    expect(onChange).toHaveBeenCalledWith({ showIf: undefined });
  });
});

describe('ConditionalLogicPanel — field selector change', () => {
  it('updates fieldId and clears values when field selector changes', () => {
    const textField = makeTextField();
    const choiceField = makeChoiceField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: '', operator: 'equals', values: [] }],
    };
    const { onChange } = renderPanel({ ...textField, showIf: existing }, [choiceField]);

    // The first combobox is the field selector
    const fieldSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(fieldSelect, { target: { value: 'choice-field' } });

    const arg = onChange.mock.calls[0][0] as { showIf: ShowIfCondition };
    expect(arg.showIf.rules[0].fieldId).toBe('choice-field');
    expect(arg.showIf.rules[0].values).toHaveLength(0);
  });
});

describe('ConditionalLogicPanel — operator changes', () => {
  it('clears values when operator changes (via select interaction)', () => {
    // Start with a rule that has the choice field selected and a value
    const field = makeTextField();
    const depField = makeChoiceField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: 'choice-field', operator: 'equals', values: ['Red'] }],
    };
    const onChange = vi.fn();
    render(
      <ConditionalLogicPanel
        field={{ ...field, showIf: existing } as Parameters<typeof ConditionalLogicPanel>[0]['field']}
        allFields={[depField] as Parameters<typeof ConditionalLogicPanel>[0]['allFields']}
        onChange={onChange}
      />,
    );
    // The operator selector is the second combobox (after the field selector)
    const operatorSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(operatorSelect, { target: { value: 'not_equals' } });
    const arg = onChange.mock.calls[0][0] as { showIf: ShowIfCondition };
    // toStoredRule maps not_equals → not_equals operator
    expect(arg.showIf.rules[0].operator).toBe('not_equals');
    expect(arg.showIf.rules[0].values).toHaveLength(0);
  });

  it('shows "(no value)" label for is_empty operator', () => {
    const field = makeTextField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: '', operator: 'is_empty', values: [] }],
    };
    renderPanel({ ...field, showIf: existing }, []);
    expect(screen.getByText('(no value)')).toBeInTheDocument();
  });

  it('shows "(no value)" label for is_not_empty operator', () => {
    const field = makeTextField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: '', operator: 'is_not_empty', values: [] }],
    };
    renderPanel({ ...field, showIf: existing }, []);
    expect(screen.getByText('(no value)')).toBeInTheDocument();
  });

  it('switches to is_empty via operator select and shows (no value)', () => {
    const field = makeTextField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: '', operator: 'equals', values: [] }],
    };
    renderPanel({ ...field, showIf: existing }, []);
    const operatorSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(operatorSelect, { target: { value: 'is_empty' } });
    expect(screen.getByText('(no value)')).toBeInTheDocument();
  });
});

describe('ConditionalLogicPanel — value inputs', () => {
  it('renders a number input for greater_than operator', () => {
    const field = makeTextField();
    const numField = makeNumericField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: 'num-field', operator: 'greater_than', values: ['10'] }],
    };
    renderPanel({ ...field, showIf: existing }, [numField]);
    const numInputs = screen.getAllByRole('spinbutton');
    expect(numInputs.length).toBeGreaterThanOrEqual(1);
  });

  it('fires onChange with numeric value for greater_than input', () => {
    const field = makeTextField();
    const numField = makeNumericField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: 'num-field', operator: 'greater_than', values: [] }],
    };
    const { onChange } = renderPanel({ ...field, showIf: existing }, [numField]);
    const numInput = screen.getByRole('spinbutton');
    fireEvent.change(numInput, { target: { value: '42' } });
    const arg = onChange.mock.calls[0][0] as { showIf: ShowIfCondition };
    expect(arg.showIf.rules[0].values).toEqual(['42']);
  });

  it('renders a text input for contains operator', () => {
    const field = makeTextField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: '', operator: 'contains', values: [] }],
    };
    renderPanel({ ...field, showIf: existing }, []);
    const textInput = screen.getByPlaceholderText('Enter substring...');
    expect(textInput).toBeInTheDocument();
  });

  it('fires onChange with substring value for contains input', () => {
    const field = makeTextField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: '', operator: 'contains', values: [] }],
    };
    const { onChange } = renderPanel({ ...field, showIf: existing }, []);
    fireEvent.change(screen.getByPlaceholderText('Enter substring...'), {
      target: { value: 'hello' },
    });
    const arg = onChange.mock.calls[0][0] as { showIf: ShowIfCondition };
    expect(arg.showIf.rules[0].values).toEqual(['hello']);
  });

  it('renders a free-text input for plain equals on a non-choice field', () => {
    const field = makeTextField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: '', operator: 'equals', values: [] }],
    };
    renderPanel({ ...field, showIf: existing }, []);
    expect(screen.getByPlaceholderText('Enter value...')).toBeInTheDocument();
  });

  it('fires onChange with text value for plain text input', () => {
    const field = makeTextField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: '', operator: 'equals', values: [] }],
    };
    const { onChange } = renderPanel({ ...field, showIf: existing }, []);
    fireEvent.change(screen.getByPlaceholderText('Enter value...'), {
      target: { value: 'foo' },
    });
    const arg = onChange.mock.calls[0][0] as { showIf: ShowIfCondition };
    expect(arg.showIf.rules[0].values).toEqual(['foo']);
  });

  it('renders a dropdown for equals on a choice field', () => {
    const field = makeTextField();
    const choiceField = makeChoiceField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: 'choice-field', operator: 'equals', values: [] }],
    };
    renderPanel({ ...field, showIf: existing }, [choiceField]);
    // value dropdown contains the options
    expect(screen.getByRole('option', { name: 'Red' })).toBeInTheDocument();
  });

  it('fires onChange with selected value from choice dropdown', () => {
    const field = makeTextField();
    const choiceField = makeChoiceField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: 'choice-field', operator: 'equals', values: [] }],
    };
    const { onChange } = renderPanel({ ...field, showIf: existing }, [choiceField]);
    const valueSelect = screen.getAllByRole('combobox')[2];
    fireEvent.change(valueSelect, { target: { value: 'Blue' } });
    const arg = onChange.mock.calls[0][0] as { showIf: ShowIfCondition };
    expect(arg.showIf.rules[0].values).toEqual(['Blue']);
  });
});

describe('ConditionalLogicPanel — multi-value operators', () => {
  it('renders checkboxes for is_one_of on a choice field (via operator select)', () => {
    // Start with choice field selected, then switch operator to is_one_of
    const field = makeTextField();
    const choiceField = makeChoiceField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: 'choice-field', operator: 'equals', values: [] }],
    };
    renderPanel({ ...field, showIf: existing }, [choiceField]);

    // Switch operator to is_one_of
    const operatorSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(operatorSelect, { target: { value: 'is_one_of' } });

    // Now checkboxes for the choice options should appear
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(3); // Red, Blue, Green
  });

  it('renders comma-separated input for is_one_of on non-choice field (via operator select)', () => {
    const field = makeTextField();
    // Empty field selector (no dep) → no triggerField → not a choice field → free-text
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: '', operator: 'equals', values: [] }],
    };
    renderPanel({ ...field, showIf: existing }, []);

    // Switch operator to is_one_of
    const operatorSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(operatorSelect, { target: { value: 'is_one_of' } });

    expect(screen.getByPlaceholderText('Enter values, comma-separated...')).toBeInTheDocument();
  });

  it('fires onChange with parsed comma-separated values (after switching to is_one_of)', () => {
    // Start with a rule that has no field (so not a choice field) then switch to is_one_of
    const field = makeTextField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: '', operator: 'equals', values: [] }],
    };
    const { onChange } = renderPanel({ ...field, showIf: existing }, []);

    // Switch operator to is_one_of — component state updates, comma-sep input appears
    const operatorSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(operatorSelect, { target: { value: 'is_one_of' } });

    // Now the comma-separated input should be visible
    const input = screen.getByPlaceholderText('Enter values, comma-separated...');
    // Reset onChange calls count (the operator change already fired one)
    onChange.mockClear();
    fireEvent.change(input, { target: { value: 'foo, bar, baz' } });
    const arg = onChange.mock.calls[0][0] as { showIf: ShowIfCondition };
    // is_one_of maps to 'equals' operator in stored form
    expect(arg.showIf.rules[0].operator).toBe('equals');
    expect(arg.showIf.rules[0].values).toEqual(['foo', 'bar', 'baz']);
  });

  it('toggles checkbox values for is_one_of on choice field', () => {
    const field = makeTextField();
    const choiceField = makeChoiceField();
    // Use multi equals on choice field → fromStoredRule gives is_one_of uiOperator
    const multiShowIf: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: 'choice-field', operator: 'equals', values: ['Red', 'Blue'] }],
    };
    const { onChange } = renderPanel({ ...field, showIf: multiShowIf }, [choiceField]);
    const checkboxes = screen.getAllByRole('checkbox');
    // Red is checked (index 0) — uncheck it
    fireEvent.click(checkboxes[0]);
    const arg = onChange.mock.calls[0][0] as { showIf: ShowIfCondition };
    expect(arg.showIf.rules[0].values).not.toContain('Red');
  });
});

describe('ConditionalLogicPanel — legacy showIf shape', () => {
  it('parses legacy { fieldId, values } shape into a single rule', () => {
    const field = makeTextField();
    const choiceField = makeChoiceField();
    const legacyShowIf = { fieldId: 'choice-field', values: ['Red'] };
    renderPanel(
      { ...field, showIf: legacyShowIf as Parameters<typeof ConditionalLogicPanel>[0]['field']['showIf'] },
      [choiceField],
    );
    expect(screen.getByRole('button', { name: /Add another rule/i })).toBeInTheDocument();
  });
});

describe('ConditionalLogicPanel — numeric field operator options', () => {
  it('shows greater_than/less_than options for a numeric field', () => {
    const field = makeTextField();
    const numField = makeNumericField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: 'num-field', operator: 'equals', values: [] }],
    };
    renderPanel({ ...field, showIf: existing }, [numField]);
    expect(screen.getByRole('option', { name: 'Greater than' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Less than' })).toBeInTheDocument();
  });

  it('shows greater_than/less_than options when no field is selected', () => {
    const field = makeTextField();
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: '', operator: 'equals', values: [] }],
    };
    renderPanel({ ...field, showIf: existing }, []);
    expect(screen.getByRole('option', { name: 'Greater than' })).toBeInTheDocument();
  });
});

describe('ConditionalLogicPanel — re-parse on field.id change', () => {
  it('resets rules when field.id changes (useEffect)', () => {
    const field1 = makeTextField({ id: 'f1' });
    const field2 = makeTextField({ id: 'f2' });
    const existing: ShowIfCondition = {
      combinator: 'AND',
      rules: [{ fieldId: '', operator: 'equals', values: [] }],
    };
    const onChange = vi.fn();
    const { rerender } = render(
      <ConditionalLogicPanel
        field={{ ...field1, showIf: existing } as Parameters<typeof ConditionalLogicPanel>[0]['field']}
        allFields={[] as Parameters<typeof ConditionalLogicPanel>[0]['allFields']}
        onChange={onChange}
      />,
    );
    // field2 has no showIf → panel should reset to empty state
    rerender(
      <ConditionalLogicPanel
        field={field2 as Parameters<typeof ConditionalLogicPanel>[0]['field']}
        allFields={[] as Parameters<typeof ConditionalLogicPanel>[0]['allFields']}
        onChange={onChange}
      />,
    );
    // Empty state = "Add Condition" button visible
    expect(screen.getByRole('button', { name: /Add Condition/i })).toBeInTheDocument();
  });
});
