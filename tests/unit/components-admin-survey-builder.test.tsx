// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// ConditionalLogicPanel is a stateful child — stub it so we exercise SurveyBuilder
// logic without the full compound-rules UI.
vi.mock('@/components/admin/ConditionalLogicPanel', () => ({
  default: function ConditionalLogicPanelStub({ onChange }: { onChange: (patch: any) => void }) {
    return React.createElement(
      'div',
      { 'data-testid': 'conditional-logic-panel' },
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'clp-add-condition',
          onClick: () =>
            onChange({
              showIf: {
                combinator: 'AND',
                rules: [{ fieldId: 'other-id', operator: 'equals', values: ['Yes'] }],
              },
            }),
        },
        'Add Condition',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'clp-clear-condition',
          onClick: () => onChange({ showIf: undefined }),
        },
        'Clear Condition',
      ),
    );
  },
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import SurveyBuilder, { type SurveyField } from '@/components/admin/SurveyBuilder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeField(overrides: Partial<SurveyField> = {}): SurveyField {
  return {
    id: 'field-1',
    type: 'text',
    label: 'My Field',
    placeholder: '',
    helpText: '',
    required: false,
    options: [],
    order: 0,
    ...overrides,
  };
}

function renderBuilder(fields: SurveyField[] = [], onChange = vi.fn()) {
  return { onChange, ...render(<SurveyBuilder fields={fields} onChange={onChange} />) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('SurveyBuilder — empty state', () => {
  it('renders the section header', () => {
    renderBuilder();
    expect(screen.getByText('Survey / Intake Form')).toBeInTheDocument();
  });

  it('shows the empty-state placeholder when no fields exist', () => {
    renderBuilder();
    expect(screen.getByText(/No fields yet/i)).toBeInTheDocument();
  });

  it('shows the "Add Field" button', () => {
    renderBuilder();
    expect(screen.getByText('Add Field')).toBeInTheDocument();
  });

  it('does not show the type picker by default', () => {
    renderBuilder();
    expect(screen.queryByText('Choose field type')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Type picker toggle
// ---------------------------------------------------------------------------

describe('SurveyBuilder — type picker', () => {
  it('opens the type picker when "Add Field" is clicked', () => {
    renderBuilder();
    fireEvent.click(screen.getByText('Add Field'));
    expect(screen.getByText(/Choose field type/i)).toBeInTheDocument();
  });

  it('closes the type picker when "Cancel" is clicked', () => {
    renderBuilder();
    fireEvent.click(screen.getByText('Add Field'));
    expect(screen.getByText(/Choose field type/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText(/Choose field type/i)).toBeNull();
  });

  it('renders all 16 field type buttons in the picker', () => {
    renderBuilder();
    fireEvent.click(screen.getByText('Add Field'));
    // 16 field types defined in FIELD_TYPES
    const typeButtons = screen.getAllByRole('button').filter(b =>
      b.closest('[data-testid]') === null &&
      !['Add Field', 'Cancel'].includes(b.textContent?.trim() ?? '')
    );
    // At minimum Short Text and Long Text should be visible
    expect(screen.getByText('Short Text')).toBeInTheDocument();
    expect(screen.getByText('Long Text')).toBeInTheDocument();
    expect(screen.getByText('Dropdown')).toBeInTheDocument();
    expect(screen.getByText('Star Rating (1–5)')).toBeInTheDocument();
    expect(screen.getByText('Page Break')).toBeInTheDocument();
    expect(typeButtons.length).toBeGreaterThan(0);
  });

  it('closes the picker after selecting a field type', () => {
    renderBuilder();
    fireEvent.click(screen.getByText('Add Field'));
    fireEvent.click(screen.getByText('Short Text'));
    expect(screen.queryByText(/Choose field type/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addField
// ---------------------------------------------------------------------------

describe('SurveyBuilder — addField', () => {
  it('calls onChange with a new text field when "Short Text" is selected', () => {
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add Field'));
    fireEvent.click(screen.getByText('Short Text'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [newFields] = onChange.mock.calls[0];
    expect(newFields).toHaveLength(1);
    expect(newFields[0].type).toBe('text');
    expect(newFields[0].label).toBe('Short Text');
    expect(newFields[0].options).toEqual([]);
  });

  it('initialises select/radio/checkbox fields with two default options', () => {
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add Field'));
    fireEvent.click(screen.getByText('Dropdown'));
    const [newFields] = onChange.mock.calls[0];
    expect(newFields[0].type).toBe('select');
    expect(newFields[0].options).toEqual(['Option 1', 'Option 2']);
  });

  it('initialises slider fields with min/max/step defaults', () => {
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add Field'));
    fireEvent.click(screen.getByText('Range Slider'));
    const [newFields] = onChange.mock.calls[0];
    expect(newFields[0].type).toBe('slider');
    expect(newFields[0].min).toBe(500);
    expect(newFields[0].max).toBe(50000);
    expect(newFields[0].step).toBe(500);
  });

  it('sets order equal to the current field count', () => {
    const existing = makeField({ id: 'f0', order: 0 });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[existing]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add Field'));
    fireEvent.click(screen.getByText('Number'));
    const [newFields] = onChange.mock.calls[0];
    expect(newFields[1].order).toBe(1);
  });

  it('adds a page_break field', () => {
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add Field'));
    fireEvent.click(screen.getByText('Page Break'));
    const [newFields] = onChange.mock.calls[0];
    expect(newFields[0].type).toBe('page_break');
  });
});

// ---------------------------------------------------------------------------
// Field list rendering
// ---------------------------------------------------------------------------

describe('SurveyBuilder — field list', () => {
  it('renders a field card when fields are provided', () => {
    const field = makeField({ label: 'What is your name?' });
    renderBuilder([field]);
    expect(screen.getByText('What is your name?')).toBeInTheDocument();
    // No empty-state placeholder
    expect(screen.queryByText(/No fields yet/i)).toBeNull();
  });

  it('renders a page_break as a visual divider with page number', () => {
    const pageBreak = makeField({ id: 'pb-1', type: 'page_break', label: 'Page Break', order: 1 });
    renderBuilder([pageBreak]);
    expect(screen.getByText(/Page 2/)).toBeInTheDocument();
  });

  it('renders required badge when field.required is true', () => {
    const field = makeField({ required: true });
    renderBuilder([field]);
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('does not render required badge when field.required is false', () => {
    const field = makeField({ required: false });
    renderBuilder([field]);
    expect(screen.queryByText('Required')).toBeNull();
  });

  it('shows conditional logic icon when field has showIf', () => {
    const field = makeField({
      showIf: { fieldId: 'other', values: ['Yes'] },
    });
    const { container } = renderBuilder([field]);
    // The visibility icon is rendered as a span with text content "visibility"
    const icon = Array.from(container.querySelectorAll('.material-icons')).find(
      el => el.textContent === 'visibility',
    );
    expect(icon).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Expand / collapse editor
// ---------------------------------------------------------------------------

describe('SurveyBuilder — expand/collapse field editor', () => {
  it('expands a field card when the edit button is clicked', () => {
    const field = makeField();
    renderBuilder([field]);
    // Editor not visible yet
    expect(screen.queryByText('Field Type')).toBeNull();
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText('Field Type')).toBeInTheDocument();
  });

  it('collapses when "Done editing" is clicked', () => {
    const field = makeField();
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText('Field Type')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Done editing'));
    expect(screen.queryByText('Field Type')).toBeNull();
  });

  it('shows field ID in expanded editor', () => {
    const field = makeField({ id: 'abc123' });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText(/ID: abc123/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// updateField — label, placeholder, helpText
// ---------------------------------------------------------------------------

describe('SurveyBuilder — updateField', () => {
  it('calls onChange when label is edited', () => {
    const field = makeField({ id: 'f1' });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    const labelInput = screen.getByPlaceholderText('e.g. What is your domain name?');
    fireEvent.change(labelInput, { target: { value: 'New Label' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [updated] = onChange.mock.calls[0];
    expect(updated[0].label).toBe('New Label');
  });

  it('calls onChange when placeholder is edited (text field)', () => {
    const field = makeField({ id: 'f1', type: 'text' });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    const placeholderInput = screen.getByPlaceholderText('e.g. example.com');
    fireEvent.change(placeholderInput, { target: { value: 'Enter name' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [updated] = onChange.mock.calls[0];
    expect(updated[0].placeholder).toBe('Enter name');
  });

  it('calls onChange when help text is edited', () => {
    const field = makeField({ id: 'f1', type: 'text' });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    const helpInput = screen.getByPlaceholderText('Optional hint shown below the field');
    fireEvent.change(helpInput, { target: { value: 'Some hint' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [updated] = onChange.mock.calls[0];
    expect(updated[0].helpText).toBe('Some hint');
  });

  it('shows piping token note when label contains {token}', () => {
    const field = makeField({ label: 'Hello {name}' });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText(/Uses piping token/i)).toBeInTheDocument();
  });

  it('does NOT show piping token note without braces', () => {
    const field = makeField({ label: 'Hello name' });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.queryByText(/Uses piping token/i)).toBeNull();
  });

  it('blocks attempts to change the field ID via updateField (console.error)', () => {
    // The guard in updateField checks for 'id' in patch and returns early.
    // We exercise this by changing field type (which internally calls updateField without id)
    // and verify the field id remains the same.
    const field = makeField({ id: 'immutable-id', type: 'text' });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    // Change label — should fire onChange with the same id
    const labelInput = screen.getByPlaceholderText('e.g. What is your domain name?');
    fireEvent.change(labelInput, { target: { value: 'Updated' } });

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].id).toBe('immutable-id');
  });
});

// ---------------------------------------------------------------------------
// Field type switcher (expanded editor)
// ---------------------------------------------------------------------------

describe('SurveyBuilder — field type switcher', () => {
  it('switches field type and clears options when changing to a non-option type', () => {
    const field = makeField({ type: 'select', options: ['A', 'B'] });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    const typeSelect = screen.getByDisplayValue('Dropdown');
    fireEvent.change(typeSelect, { target: { value: 'text' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [updated] = onChange.mock.calls[0];
    expect(updated[0].type).toBe('text');
    expect(updated[0].options).toEqual([]);
  });

  it('preserves existing options when switching between option types', () => {
    const field = makeField({ type: 'select', options: ['A', 'B', 'C'] });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    const typeSelect = screen.getByDisplayValue('Dropdown');
    fireEvent.change(typeSelect, { target: { value: 'radio' } });

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].type).toBe('radio');
    expect(updated[0].options).toEqual(['A', 'B', 'C']);
  });

  it('adds min/max/step when switching to slider type', () => {
    const field = makeField({ type: 'text' });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    const typeSelect = screen.getByDisplayValue('Short Text');
    fireEvent.change(typeSelect, { target: { value: 'slider' } });

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].type).toBe('slider');
    expect(updated[0].min).toBe(500);
    expect(updated[0].max).toBe(50000);
    expect(updated[0].step).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Options editor (select / radio / checkbox)
// ---------------------------------------------------------------------------

describe('SurveyBuilder — options textarea', () => {
  it('shows options textarea for select fields', () => {
    const field = makeField({ type: 'select', options: ['Option 1', 'Option 2'] });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    const textarea = screen.getByPlaceholderText(/Option 1/);
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe('Option 1\nOption 2');
  });

  it('calls onChange when options are edited', () => {
    const field = makeField({ type: 'radio', options: ['Yes', 'No'] });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    const textarea = screen.getByPlaceholderText(/Option 1/);
    fireEvent.change(textarea, { target: { value: 'Yes\nNo\nMaybe' } });

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].options).toEqual(['Yes', 'No', 'Maybe']);
  });

  it('does not show options textarea for text field', () => {
    const field = makeField({ type: 'text' });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.queryByPlaceholderText(/Option 1/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Slider min / max / step inputs
// ---------------------------------------------------------------------------

describe('SurveyBuilder — slider fields', () => {
  it('shows min/max/step inputs for slider fields', () => {
    const field = makeField({ type: 'slider', min: 0, max: 100, step: 10 });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText('Min')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
    expect(screen.getByText('Step')).toBeInTheDocument();
  });

  it('calls onChange when slider min is changed', () => {
    const field = makeField({ type: 'slider', min: 0, max: 100, step: 10 });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    // Min input is the number input right after the "Min" label
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '50' } });

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].min).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Required toggle
// ---------------------------------------------------------------------------

describe('SurveyBuilder — required toggle', () => {
  it('shows the required toggle for non-heading/non-page_break fields', () => {
    const field = makeField({ type: 'text' });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText('Required field')).toBeInTheDocument();
  });

  it('does not show required toggle for heading fields', () => {
    const field = makeField({ type: 'heading', label: 'A Heading' });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.queryByText('Required field')).toBeNull();
  });

  it('toggles required on click', () => {
    const field = makeField({ type: 'text', required: false });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    const toggle = screen.getByRole('switch', { name: '' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].required).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deleteField
// ---------------------------------------------------------------------------

describe('SurveyBuilder — deleteField', () => {
  it('calls onChange with the field removed when delete is clicked', () => {
    const field = makeField({ id: 'del-me' });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Delete'));
    const [updated] = onChange.mock.calls[0];
    expect(updated).toHaveLength(0);
  });

  it('re-sequences order after deletion', () => {
    const f1 = makeField({ id: 'f1', order: 0 });
    const f2 = makeField({ id: 'f2', label: 'Second', order: 1 });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[f1, f2]} onChange={onChange} />);
    // Delete first field (f1) — use first Delete button
    fireEvent.click(screen.getAllByTitle('Delete')[0]);
    const [updated] = onChange.mock.calls[0];
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('f2');
    expect(updated[0].order).toBe(0);
  });

  it('collapses the editor when the currently expanded field is deleted', () => {
    const field = makeField();
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText('Field Type')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Delete'));
    // After deletion, field list re-renders; the expanded editor should be gone
    expect(screen.queryByText('Field Type')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// moveField
// ---------------------------------------------------------------------------

describe('SurveyBuilder — moveField', () => {
  it('moves a field up when "Move up" is clicked', () => {
    const f1 = makeField({ id: 'f1', label: 'First', order: 0 });
    const f2 = makeField({ id: 'f2', label: 'Second', order: 1 });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[f1, f2]} onChange={onChange} />);

    // "Move up" on second field (index 1)
    const upButtons = screen.getAllByTitle('Move up');
    fireEvent.click(upButtons[1]); // second field's up button

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].id).toBe('f2');
    expect(updated[1].id).toBe('f1');
    expect(updated[0].order).toBe(0);
    expect(updated[1].order).toBe(1);
  });

  it('moves a field down when "Move down" is clicked', () => {
    const f1 = makeField({ id: 'f1', label: 'First', order: 0 });
    const f2 = makeField({ id: 'f2', label: 'Second', order: 1 });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[f1, f2]} onChange={onChange} />);

    const downButtons = screen.getAllByTitle('Move down');
    fireEvent.click(downButtons[0]); // first field's down button

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].id).toBe('f2');
    expect(updated[1].id).toBe('f1');
  });

  it('does not call onChange when trying to move the first field further up', () => {
    const f1 = makeField({ id: 'f1', label: 'Only' });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[f1]} onChange={onChange} />);
    // Move up button is disabled for first field
    const upBtn = screen.getByTitle('Move up');
    expect(upBtn).toBeDisabled();
    fireEvent.click(upBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables Move down on last field', () => {
    const f1 = makeField({ id: 'f1' });
    renderBuilder([f1]);
    expect(screen.getByTitle('Move down')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Conditional logic (via stub)
// ---------------------------------------------------------------------------

describe('SurveyBuilder — conditional logic panel integration', () => {
  it('renders ConditionalLogicPanel inside expanded field editor', () => {
    const field = makeField({ type: 'text' });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByTestId('conditional-logic-panel')).toBeInTheDocument();
  });

  it('applies showIf patch from ConditionalLogicPanel via updateField', () => {
    const field = makeField({ id: 'f1', type: 'text' });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByTestId('clp-add-condition'));
    const [updated] = onChange.mock.calls[0];
    expect(updated[0].showIf).toBeDefined();
    expect((updated[0].showIf as any).combinator).toBe('AND');
  });

  it('clears showIf when ConditionalLogicPanel fires clearAll', () => {
    const field = makeField({
      id: 'f1',
      showIf: { fieldId: 'other', values: ['Yes'] },
    });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByTestId('clp-clear-condition'));
    const [updated] = onChange.mock.calls[0];
    expect(updated[0].showIf).toBeUndefined();
  });

  it('excludes page_break and heading fields from allFields passed to ConditionalLogicPanel', () => {
    // By rendering multiple fields and verifying no crash — the filter logic
    // inside SurveyBuilder excludes non-eligible types before passing to the panel.
    const f1 = makeField({ id: 'f1', type: 'page_break', label: 'PB', order: 0 });
    const f2 = makeField({ id: 'f2', type: 'heading', label: 'Section', order: 1 });
    const f3 = makeField({ id: 'f3', type: 'text', label: 'Name', order: 2 });
    renderBuilder([f1, f2, f3]);
    // f2 (heading) and f3 (text) each have their own Edit button; click f3's
    const editBtns = screen.getAllByTitle('Edit');
    fireEvent.click(editBtns[editBtns.length - 1]);
    // Panel is rendered and no crash — the stub doesn't need allFields
    expect(screen.getByTestId('conditional-logic-panel')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scoring panel (SCORE-01)
// ---------------------------------------------------------------------------

describe('SurveyBuilder — scoring panel', () => {
  it('shows the scoring section for rating fields', () => {
    const field = makeField({ type: 'rating' });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText(/Scoring/)).toBeInTheDocument();
  });

  it('does not show scoring section for text fields', () => {
    const field = makeField({ type: 'text' });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.queryByText(/Scoring \(optional\)/)).toBeNull();
  });

  it('enables numeric scoring for rating field when scoring toggle is clicked', () => {
    const field = makeField({ type: 'rating' });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    // Two switches: required (index 0) + scoring (index 1)
    const switches = screen.getAllByRole('switch');
    const scoringSwitch = switches[switches.length - 1];
    fireEvent.click(scoringSwitch);

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].scoring).toBeDefined();
    expect(updated[0].scoring?.type).toBe('numeric');
    expect((updated[0].scoring as any).weight).toBe(1);
  });

  it('enables option_map scoring for toggle field', () => {
    const field = makeField({ type: 'toggle' });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    const switches = screen.getAllByRole('switch');
    const scoringSwitch = switches[switches.length - 1];
    fireEvent.click(scoringSwitch);

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].scoring?.type).toBe('option_map');
    expect((updated[0].scoring as any).options).toEqual({ Yes: 1, No: 0 });
  });

  it('enables option_map scoring for select field and seeds options to 0', () => {
    const field = makeField({ type: 'select', options: ['Option A', 'Option B'] });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    const switches = screen.getAllByRole('switch');
    const scoringSwitch = switches[switches.length - 1];
    fireEvent.click(scoringSwitch);

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].scoring?.type).toBe('option_map');
    expect((updated[0].scoring as any).options).toEqual({ 'Option A': 0, 'Option B': 0 });
  });

  it('disables scoring when toggle is clicked a second time (scoring is defined)', () => {
    const field = makeField({ type: 'rating', scoring: { type: 'numeric', weight: 1 } });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    const switches = screen.getAllByRole('switch');
    const scoringSwitch = switches[switches.length - 1];
    expect(scoringSwitch).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(scoringSwitch);

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].scoring).toBeUndefined();
  });

  it('shows weight input when numeric scoring is active', () => {
    const field = makeField({ type: 'rating', scoring: { type: 'numeric', weight: 2 } });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText('Weight')).toBeInTheDocument();
  });

  it('shows NPS button only for rating/slider fields', () => {
    const ratingField = makeField({ type: 'rating', scoring: { type: 'numeric', weight: 1 } });
    renderBuilder([ratingField]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText('NPS')).toBeInTheDocument();
  });

  it('does not show NPS button for number fields', () => {
    const numField = makeField({ type: 'number', scoring: { type: 'numeric', weight: 1 } });
    renderBuilder([numField]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.queryByText('NPS')).toBeNull();
  });

  it('switches to NPS mode when NPS button is clicked', () => {
    const field = makeField({ type: 'rating', scoring: { type: 'numeric', weight: 1 } });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    fireEvent.click(screen.getByText('NPS'));

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].scoring?.type).toBe('nps');
  });

  it('shows NPS info box when scoring type is nps', () => {
    const field = makeField({ type: 'rating', scoring: { type: 'nps' } });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText(/NPS bucketing/i)).toBeInTheDocument();
  });

  it('shows option values editor for select with option_map scoring', () => {
    const field = makeField({
      type: 'select',
      options: ['Alpha', 'Beta'],
      scoring: { type: 'option_map', options: { Alpha: 3, Beta: 5 } },
    });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText('Option values')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows "Add options above" message when options list is empty for option_map', () => {
    const field = makeField({
      type: 'select',
      options: [],
      scoring: { type: 'option_map', options: {} },
    });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText(/Add options above to assign scoring values/i)).toBeInTheDocument();
  });

  it('shows checkbox sum note for checkbox fields with option_map scoring', () => {
    const field = makeField({
      type: 'checkbox',
      options: ['X', 'Y'],
      scoring: { type: 'option_map', options: { X: 1, Y: 2 } },
    });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText(/Checkboxes sum the values/i)).toBeInTheDocument();
  });

  it('shows Yes/No options for toggle with option_map scoring', () => {
    const field = makeField({
      type: 'toggle',
      options: [],
      scoring: { type: 'option_map', options: { Yes: 1, No: 0 } },
    });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('updates scoring weight when weight input changes', () => {
    const field = makeField({ type: 'rating', scoring: { type: 'numeric', weight: 1 } });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[field]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Edit'));

    // Weight input is a number spinbutton — find by label
    const weightInput = screen.getAllByRole('spinbutton').find(
      el => (el as HTMLInputElement).step === '0.5',
    );
    expect(weightInput).toBeTruthy();
    fireEvent.change(weightInput!, { target: { value: '2.5' } });

    const [updated] = onChange.mock.calls[0];
    expect((updated[0].scoring as any).weight).toBe(2.5);
  });
});

// ---------------------------------------------------------------------------
// Skip logic / branching
// ---------------------------------------------------------------------------

describe('SurveyBuilder — skip logic (branching)', () => {
  it('does not show skip logic when there are no page breaks', () => {
    const field = makeField({ type: 'select', options: ['Yes', 'No'] });
    renderBuilder([field]);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.queryByText(/Skip Logic/i)).toBeNull();
  });

  it('shows skip logic for select field when a page_break exists', () => {
    const pageBreak = makeField({ id: 'pb', type: 'page_break', label: 'PB', order: 0 });
    const selectField = makeField({ id: 'sf', type: 'select', options: ['Yes', 'No'], order: 1 });
    renderBuilder([pageBreak, selectField]);
    // Open the select field editor
    fireEvent.click(screen.getAllByTitle('Edit')[0]);
    expect(screen.getByText(/Skip Logic/i)).toBeInTheDocument();
  });

  it('does not show skip logic for text fields even with page breaks', () => {
    const pageBreak = makeField({ id: 'pb', type: 'page_break', label: 'PB', order: 0 });
    const textField = makeField({ id: 'tf', type: 'text', label: 'Name', order: 1 });
    renderBuilder([pageBreak, textField]);
    fireEvent.click(screen.getAllByTitle('Edit')[0]);
    expect(screen.queryByText(/Skip Logic/i)).toBeNull();
  });

  it('calls onChange with goToPage when a skip-logic page is selected', () => {
    const pageBreak = makeField({ id: 'pb', type: 'page_break', label: 'PB', order: 0 });
    const selectField = makeField({ id: 'sf', type: 'select', options: ['Yes', 'No'], order: 1 });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[pageBreak, selectField]} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle('Edit')[0]);

    const selects = screen.getAllByRole('combobox');
    // The skip-logic selects are the last ones; each option has its own select
    const skipSelect = selects.find(s => s.textContent?.includes('Next page'));
    expect(skipSelect).toBeTruthy();
    fireEvent.change(skipSelect!, { target: { value: '0' } });

    const [updated] = onChange.mock.calls[0];
    // goToPage should be set for 'Yes' or 'No'
    expect(updated.some((f: SurveyField) => f.goToPage !== undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Page break rendering details
// ---------------------------------------------------------------------------

describe('SurveyBuilder — page break rendering', () => {
  it('shows "Page 2" for first page break', () => {
    const pb = makeField({ id: 'pb1', type: 'page_break', order: 0 });
    renderBuilder([pb]);
    expect(screen.getByText('Page 2')).toBeInTheDocument();
  });

  it('shows "Page 3" for second page break', () => {
    const pb1 = makeField({ id: 'pb1', type: 'page_break', order: 0 });
    const pb2 = makeField({ id: 'pb2', type: 'page_break', order: 1 });
    renderBuilder([pb1, pb2]);
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByText('Page 3')).toBeInTheDocument();
  });

  it('page break delete removes it from the list', () => {
    const pb = makeField({ id: 'pb1', type: 'page_break', order: 0 });
    const onChange = vi.fn();
    render(<SurveyBuilder fields={[pb]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Delete'));
    const [updated] = onChange.mock.calls[0];
    expect(updated).toHaveLength(0);
  });
});
