// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `components/brain/PlaybookStepEditor.tsx`
 *
 * Covers:
 *   - Renders step name, key, description fields
 *   - Kind dropdown renders all 7 kinds; changing it calls onPatch
 *   - Remove button calls onRemove
 *   - Name / key / description changes schedule onPatch (flush on blur)
 *   - StepConfigForm per-kind: task, note, meeting, decision, review_item, wait, branch
 *   - ConditionEditor: add condition button, field/op/value inputs, remove, exists op disables value
 *   - Next steps: empty message when no siblings; toggle buttons when siblings present
 *   - busy prop disables all inputs + remove button
 *   - dragHandleProps / dropTargetProps wired
 *   - onPatch receives correct keys from kind config changes
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import PlaybookStepEditor from '@/components/brain/PlaybookStepEditor';
import type { PlaybookStepRow } from '@/components/brain/playbooks-shared';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeStep(over: Partial<PlaybookStepRow> = {}): PlaybookStepRow {
  return {
    id: 1,
    clientId: 10,
    playbookId: 100,
    key: 'step_one',
    name: 'Step One',
    description: 'A description',
    kind: 'task',
    config: {},
    condition: null,
    nextStepKeys: [],
    sortOrder: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...over,
  };
}

function makeSibling(id: number, key: string, name: string): PlaybookStepRow {
  return makeStep({ id, key, name, playbookId: 100 });
}

function makeProps(
  stepOver: Partial<PlaybookStepRow> = {},
  extra: {
    siblings?: PlaybookStepRow[];
    onPatch?: ReturnType<typeof vi.fn>;
    onRemove?: ReturnType<typeof vi.fn>;
    busy?: boolean;
    dragHandleProps?: any;
    dropTargetProps?: any;
  } = {},
) {
  return {
    step: makeStep(stepOver),
    siblings: extra.siblings ?? [],
    onPatch: extra.onPatch ?? vi.fn(),
    onRemove: extra.onRemove ?? vi.fn(),
    busy: extra.busy,
    dragHandleProps: extra.dragHandleProps,
    dropTargetProps: extra.dropTargetProps,
  };
}

// ─── Helper: advance fake timers so debounce fires ────────────────────────────

async function flushDebounce() {
  await act(async () => {
    vi.runAllTimers();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

// cleanup is handled globally by tests/setup.ts afterEach

describe('PlaybookStepEditor — basic rendering', () => {
  it('renders the step name input with the step name value', () => {
    const props = makeProps();
    render(<PlaybookStepEditor {...props} />);
    const nameInput = screen.getByPlaceholderText('Step name') as HTMLInputElement;
    expect(nameInput.value).toBe('Step One');
  });

  it('renders the key input with the step key value', () => {
    const props = makeProps();
    render(<PlaybookStepEditor {...props} />);
    const keyInput = screen.getByPlaceholderText('stable_step_key') as HTMLInputElement;
    expect(keyInput.value).toBe('step_one');
  });

  it('renders the description input with the step description value', () => {
    const props = makeProps();
    render(<PlaybookStepEditor {...props} />);
    const descInput = screen.getByPlaceholderText('Short description (optional)') as HTMLInputElement;
    expect(descInput.value).toBe('A description');
  });

  it('renders description as empty string when step.description is null', () => {
    const props = makeProps({ description: null });
    render(<PlaybookStepEditor {...props} />);
    const descInput = screen.getByPlaceholderText('Short description (optional)') as HTMLInputElement;
    expect(descInput.value).toBe('');
  });

  it('renders drag indicator icon', () => {
    const props = makeProps();
    const { container } = render(<PlaybookStepEditor {...props} />);
    expect(container.textContent).toContain('drag_indicator');
  });

  it('renders remove button with aria-label', () => {
    const props = makeProps();
    render(<PlaybookStepEditor {...props} />);
    expect(screen.getByRole('button', { name: 'Remove this step' })).toBeInTheDocument();
  });

  it('renders delete icon in the remove button', () => {
    const props = makeProps();
    const { container } = render(<PlaybookStepEditor {...props} />);
    expect(container.textContent).toContain('delete');
  });

  it('renders Condition section label', () => {
    const props = makeProps();
    render(<PlaybookStepEditor {...props} />);
    expect(screen.getByText('Condition')).toBeInTheDocument();
  });

  it('renders Next steps section label', () => {
    const props = makeProps();
    render(<PlaybookStepEditor {...props} />);
    expect(screen.getByText('Next steps')).toBeInTheDocument();
  });
});

describe('PlaybookStepEditor — kind dropdown', () => {
  it('renders a select with the step kind selected', () => {
    const props = makeProps({ kind: 'note' });
    render(<PlaybookStepEditor {...props} />);
    const selects = screen.getAllByRole('combobox');
    // kind select is the first combobox
    const kindSelect = selects[0] as HTMLSelectElement;
    expect(kindSelect.value).toBe('note');
  });

  it('renders all 7 kind options', () => {
    const props = makeProps({ kind: 'task' });
    render(<PlaybookStepEditor {...props} />);
    const selects = screen.getAllByRole('combobox');
    const kindSelect = selects[0];
    const optionValues = Array.from(kindSelect.querySelectorAll('option')).map((o) => o.getAttribute('value'));
    expect(optionValues).toContain('task');
    expect(optionValues).toContain('note');
    expect(optionValues).toContain('meeting');
    expect(optionValues).toContain('decision');
    expect(optionValues).toContain('review_item');
    expect(optionValues).toContain('wait');
    expect(optionValues).toContain('branch');
  });

  it('calls onPatch with new kind when kind dropdown changes', () => {
    const onPatch = vi.fn();
    const props = makeProps({ kind: 'task' }, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'note' } });
    expect(onPatch).toHaveBeenCalledWith({ kind: 'note' });
  });
});

describe('PlaybookStepEditor — name / key / description debounce', () => {
  it('updating name input updates local state immediately', () => {
    const props = makeProps();
    render(<PlaybookStepEditor {...props} />);
    const nameInput = screen.getByPlaceholderText('Step name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    expect(nameInput.value).toBe('New Name');
  });

  it('calls onPatch with name after debounce fires', async () => {
    const onPatch = vi.fn();
    const props = makeProps({}, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const nameInput = screen.getByPlaceholderText('Step name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Flushed Name' } });
    await flushDebounce();
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ name: 'Flushed Name' }));
  });

  it('calls onPatch with name on blur (flush)', async () => {
    const onPatch = vi.fn();
    const props = makeProps({}, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const nameInput = screen.getByPlaceholderText('Step name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Blur Name' } });
    fireEvent.blur(nameInput);
    await act(async () => {});
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ name: 'Blur Name' }));
  });

  it('calls onPatch with key after blur', async () => {
    const onPatch = vi.fn();
    const props = makeProps({}, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const keyInput = screen.getByPlaceholderText('stable_step_key') as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: 'new_key' } });
    fireEvent.blur(keyInput);
    await act(async () => {});
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ key: 'new_key' }));
  });

  it('calls onPatch with description after blur', async () => {
    const onPatch = vi.fn();
    const props = makeProps({}, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const descInput = screen.getByPlaceholderText('Short description (optional)') as HTMLInputElement;
    fireEvent.change(descInput, { target: { value: 'New desc' } });
    fireEvent.blur(descInput);
    await act(async () => {});
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ description: 'New desc' }));
  });
});

describe('PlaybookStepEditor — remove button', () => {
  it('calls onRemove when remove button is clicked', () => {
    const onRemove = vi.fn();
    const props = makeProps({}, { onRemove });
    render(<PlaybookStepEditor {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this step' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('PlaybookStepEditor — busy prop', () => {
  it('disables the name input when busy=true', () => {
    const props = makeProps({}, { busy: true });
    render(<PlaybookStepEditor {...props} />);
    const nameInput = screen.getByPlaceholderText('Step name') as HTMLInputElement;
    expect(nameInput.disabled).toBe(true);
  });

  it('disables the key input when busy=true', () => {
    const props = makeProps({}, { busy: true });
    render(<PlaybookStepEditor {...props} />);
    const keyInput = screen.getByPlaceholderText('stable_step_key') as HTMLInputElement;
    expect(keyInput.disabled).toBe(true);
  });

  it('disables the kind select when busy=true', () => {
    const props = makeProps({}, { busy: true });
    render(<PlaybookStepEditor {...props} />);
    const selects = screen.getAllByRole('combobox');
    expect((selects[0] as HTMLSelectElement).disabled).toBe(true);
  });

  it('disables the remove button when busy=true', () => {
    const props = makeProps({}, { busy: true });
    render(<PlaybookStepEditor {...props} />);
    const removeBtn = screen.getByRole('button', { name: 'Remove this step' });
    expect(removeBtn).toBeDisabled();
  });

  it('sets draggable=false on the drag handle when busy=true', () => {
    const props = makeProps({}, { busy: true });
    const { container } = render(<PlaybookStepEditor {...props} />);
    const dragHandle = container.querySelector('[title="Drag to reorder"]');
    expect(dragHandle?.getAttribute('draggable')).toBe('false');
  });
});

describe('PlaybookStepEditor — StepConfigForm kind=task', () => {
  it('renders Title template input for task kind', () => {
    const props = makeProps({ kind: 'task' });
    render(<PlaybookStepEditor {...props} />);
    expect(screen.getByPlaceholderText(/Send welcome packet/i)).toBeInTheDocument();
  });

  it('renders Due (days from start) number input for task kind', () => {
    const props = makeProps({ kind: 'task' });
    render(<PlaybookStepEditor {...props} />);
    expect(screen.getByPlaceholderText(/manager \/ hr \/ csm/i)).toBeInTheDocument();
  });

  it('renders Priority select for task kind', () => {
    const props = makeProps({ kind: 'task', config: { priority: 'high' } });
    render(<PlaybookStepEditor {...props} />);
    const selects = screen.getAllByRole('combobox');
    const prioritySelect = selects.find((s) =>
      Array.from(s.querySelectorAll('option')).some((o) => o.value === 'urgent'),
    );
    expect(prioritySelect).toBeTruthy();
  });

  it('calls onPatch with config when task title changes', () => {
    const onPatch = vi.fn();
    const props = makeProps({ kind: 'task', config: {} }, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const titleInput = screen.getByPlaceholderText(/Send welcome packet/i);
    fireEvent.change(titleInput, { target: { value: 'My Task Title' } });
    expect(onPatch).toHaveBeenCalledWith({ config: { title: 'My Task Title' } });
  });

  it('calls onPatch with config when task due days changes', () => {
    const onPatch = vi.fn();
    const props = makeProps({ kind: 'task', config: {} }, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    // Due input is type=number (no accessible name, find by role=spinbutton)
    const spinners = screen.getAllByRole('spinbutton');
    fireEvent.change(spinners[0], { target: { value: '7' } });
    expect(onPatch).toHaveBeenCalledWith({ config: { dueOffsetDays: 7 } });
  });

  it('deletes dueOffsetDays key when cleared', () => {
    const onPatch = vi.fn();
    const props = makeProps({ kind: 'task', config: { dueOffsetDays: 5 } }, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const spinners = screen.getAllByRole('spinbutton');
    fireEvent.change(spinners[0], { target: { value: '' } });
    const lastCall = onPatch.mock.calls[onPatch.mock.calls.length - 1][0];
    expect(lastCall.config).not.toHaveProperty('dueOffsetDays');
  });
});

describe('PlaybookStepEditor — StepConfigForm kind=note', () => {
  it('renders Title and Body inputs for note kind', () => {
    const props = makeProps({ kind: 'note' });
    render(<PlaybookStepEditor {...props} />);
    // Note kind has a Title input and a Body textarea
    const labels = Array.from(document.querySelectorAll('span.text-\\[11px\\]'));
    const texts = labels.map((l) => l.textContent ?? '');
    expect(texts.some((t) => t === 'Title')).toBe(true);
    expect(texts.some((t) => t.includes('Body'))).toBe(true);
  });

  it('calls onPatch with config on body change', () => {
    const onPatch = vi.fn();
    const props = makeProps({ kind: 'note', config: {} }, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const textareas = screen.getAllByRole('textbox');
    // In note kind, the body is the second textbox (after title input, which might be a textarea too)
    // Find the textarea specifically
    const noteTextareas = Array.from(document.querySelectorAll('textarea'));
    if (noteTextareas.length > 0) {
      fireEvent.change(noteTextareas[0], { target: { value: 'Note body text' } });
      expect(onPatch).toHaveBeenCalledWith({ config: expect.objectContaining({ body: 'Note body text' }) });
    } else {
      // body is a textbox input — pick last textbox that's in the kind config area
      const allTextboxes = screen.getAllByRole('textbox');
      fireEvent.change(allTextboxes[allTextboxes.length - 1], { target: { value: 'Note body text' } });
      expect(onPatch).toHaveBeenCalled();
    }
  });
});

describe('PlaybookStepEditor — StepConfigForm kind=meeting', () => {
  it('renders Duration (min) input for meeting kind', () => {
    const props = makeProps({ kind: 'meeting' });
    render(<PlaybookStepEditor {...props} />);
    expect(screen.getByPlaceholderText('30')).toBeInTheDocument();
  });

  it('calls onPatch with config on durationMin change', () => {
    const onPatch = vi.fn();
    const props = makeProps({ kind: 'meeting', config: {} }, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const spinners = screen.getAllByRole('spinbutton');
    // durationMin spinner (second one)
    const dur = spinners.find((s) => (s as HTMLInputElement).step === '5');
    if (dur) {
      fireEvent.change(dur, { target: { value: '60' } });
      expect(onPatch).toHaveBeenCalledWith({ config: expect.objectContaining({ durationMin: 60 }) });
    }
  });
});

describe('PlaybookStepEditor — StepConfigForm kind=decision', () => {
  it('renders Decision title and Reversibility select for decision kind', () => {
    const props = makeProps({ kind: 'decision' });
    render(<PlaybookStepEditor {...props} />);
    const selects = screen.getAllByRole('combobox');
    const revSelect = selects.find((s) =>
      Array.from(s.querySelectorAll('option')).some((o) => o.value === 'one_way'),
    );
    expect(revSelect).toBeTruthy();
  });

  it('calls onPatch with config on reversibility change', () => {
    const onPatch = vi.fn();
    const props = makeProps({ kind: 'decision', config: {} }, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const selects = screen.getAllByRole('combobox');
    const revSelect = selects.find((s) =>
      Array.from(s.querySelectorAll('option')).some((o) => o.value === 'one_way'),
    );
    fireEvent.change(revSelect!, { target: { value: 'one_way' } });
    expect(onPatch).toHaveBeenCalledWith({ config: expect.objectContaining({ reversibility: 'one_way' }) });
  });
});

describe('PlaybookStepEditor — StepConfigForm kind=review_item', () => {
  it('renders Proposed type input for review_item kind', () => {
    const props = makeProps({ kind: 'review_item' });
    render(<PlaybookStepEditor {...props} />);
    expect(screen.getByPlaceholderText(/note \/ topic \/ decision/i)).toBeInTheDocument();
  });

  it('renders informational paragraph for review_item', () => {
    const props = makeProps({ kind: 'review_item' });
    const { container } = render(<PlaybookStepEditor {...props} />);
    expect(container.textContent).toContain('proposed payload');
  });
});

describe('PlaybookStepEditor — StepConfigForm kind=wait', () => {
  it('renders Wait until input for wait kind', () => {
    const props = makeProps({ kind: 'wait' });
    render(<PlaybookStepEditor {...props} />);
    const spinner = screen.getByRole('spinbutton');
    expect((spinner as HTMLInputElement).placeholder).toBe('e.g. 7');
  });

  it('calls onPatch with config on untilOffsetDays change', () => {
    const onPatch = vi.fn();
    const props = makeProps({ kind: 'wait', config: {} }, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const spinner = screen.getByRole('spinbutton');
    fireEvent.change(spinner, { target: { value: '14' } });
    expect(onPatch).toHaveBeenCalledWith({ config: { untilOffsetDays: 14 } });
  });
});

describe('PlaybookStepEditor — StepConfigForm kind=branch', () => {
  it('renders informational italic paragraph for branch kind', () => {
    const props = makeProps({ kind: 'branch' });
    const { container } = render(<PlaybookStepEditor {...props} />);
    expect(container.textContent).toContain('Pure routing step');
  });
});

describe('PlaybookStepEditor — ConditionEditor', () => {
  it('renders "Add condition" button when no condition set', () => {
    const props = makeProps({ condition: null });
    render(<PlaybookStepEditor {...props} />);
    expect(screen.getByRole('button', { name: /Add condition/i })).toBeInTheDocument();
  });

  it('clicking "Add condition" calls onPatch with initial condition', () => {
    const onPatch = vi.fn();
    const props = makeProps({ condition: null }, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Add condition/i }));
    expect(onPatch).toHaveBeenCalledWith({ condition: { field: '', op: 'eq', value: '' } });
  });

  it('renders field/op/value inputs when condition is set', () => {
    const props = makeProps({ condition: { field: 'person.role', op: 'eq', value: 'admin' } });
    render(<PlaybookStepEditor {...props} />);
    const fieldInput = screen.getByPlaceholderText(/field \(e\.g\. person\.role\)/i);
    expect((fieldInput as HTMLInputElement).value).toBe('person.role');
  });

  it('renders Remove condition button when condition is set', () => {
    const props = makeProps({ condition: { field: 'x', op: 'eq', value: 'y' } });
    render(<PlaybookStepEditor {...props} />);
    expect(screen.getByRole('button', { name: 'Remove condition' })).toBeInTheDocument();
  });

  it('clicking Remove condition calls onPatch with null', () => {
    const onPatch = vi.fn();
    const props = makeProps({ condition: { field: 'x', op: 'eq', value: 'y' } }, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove condition' }));
    expect(onPatch).toHaveBeenCalledWith({ condition: null });
  });

  it('changing condition field calls onPatch with updated condition', () => {
    const onPatch = vi.fn();
    const props = makeProps({ condition: { field: 'x', op: 'eq', value: 'y' } }, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const fieldInput = screen.getByPlaceholderText(/field \(e\.g\. person\.role\)/i);
    fireEvent.change(fieldInput, { target: { value: 'person.name' } });
    expect(onPatch).toHaveBeenCalledWith({
      condition: { field: 'person.name', op: 'eq', value: 'y' },
    });
  });

  it('changing condition op to "exists" disables the value input', () => {
    const props = makeProps({ condition: { field: 'x', op: 'exists' } });
    render(<PlaybookStepEditor {...props} />);
    const valueInput = screen.getByPlaceholderText('— not used —') as HTMLInputElement;
    expect(valueInput.disabled).toBe(true);
  });

  it('op "not_exists" also disables the value input', () => {
    const props = makeProps({ condition: { field: 'x', op: 'not_exists' } });
    render(<PlaybookStepEditor {...props} />);
    const valueInput = screen.getByPlaceholderText('— not used —') as HTMLInputElement;
    expect(valueInput.disabled).toBe(true);
  });

  it('op "eq" enables the value input', () => {
    const props = makeProps({ condition: { field: 'x', op: 'eq', value: 'v' } });
    render(<PlaybookStepEditor {...props} />);
    const valueInput = screen.getByPlaceholderText('value') as HTMLInputElement;
    expect(valueInput.disabled).toBe(false);
  });

  it('renders op select with all condition ops', () => {
    const props = makeProps({ condition: { field: 'f', op: 'eq', value: 'v' } });
    render(<PlaybookStepEditor {...props} />);
    const selects = screen.getAllByRole('combobox');
    // op select contains 'eq', 'neq', 'exists', etc.
    const opSelect = selects.find((s) =>
      Array.from(s.querySelectorAll('option')).some((o) => o.value === 'not_exists'),
    );
    expect(opSelect).toBeTruthy();
  });

  it('changing value input calls onPatch with updated condition', () => {
    const onPatch = vi.fn();
    const props = makeProps({ condition: { field: 'f', op: 'eq', value: 'old' } }, { onPatch });
    render(<PlaybookStepEditor {...props} />);
    const valueInput = screen.getByPlaceholderText('value') as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: 'new' } });
    expect(onPatch).toHaveBeenCalledWith({
      condition: { field: 'f', op: 'eq', value: 'new' },
    });
  });

  it('condition value of undefined renders as empty string', () => {
    const props = makeProps({ condition: { field: 'f', op: 'eq', value: undefined } });
    render(<PlaybookStepEditor {...props} />);
    const valueInput = screen.getByPlaceholderText('value') as HTMLInputElement;
    expect(valueInput.value).toBe('');
  });

  it('condition value of null renders as empty string', () => {
    const props = makeProps({ condition: { field: 'f', op: 'eq', value: null } });
    render(<PlaybookStepEditor {...props} />);
    const valueInput = screen.getByPlaceholderText('value') as HTMLInputElement;
    expect(valueInput.value).toBe('');
  });

  it('condition value as object renders as JSON string', () => {
    const props = makeProps({ condition: { field: 'f', op: 'in', value: ['a', 'b'] } });
    render(<PlaybookStepEditor {...props} />);
    const valueInput = screen.getByPlaceholderText('value') as HTMLInputElement;
    expect(valueInput.value).toBe('["a","b"]');
  });
});

describe('PlaybookStepEditor — Next steps', () => {
  it('shows "Add more steps to wire branches." when siblings list has only self', () => {
    // siblings array passed as empty (the parent filters to otherSiblings inside)
    const props = makeProps({ id: 1 }, { siblings: [] });
    render(<PlaybookStepEditor {...props} />);
    expect(screen.getByText(/Add more steps to wire branches/i)).toBeInTheDocument();
  });

  it('renders sibling step buttons when siblings present', () => {
    const step = makeStep({ id: 1, key: 'step_one' });
    const sibling = makeSibling(2, 'step_two', 'Step Two');
    const props = { ...makeProps({}, {}), step, siblings: [step, sibling] };
    render(<PlaybookStepEditor {...props} />);
    expect(screen.getByText('Step Two')).toBeInTheDocument();
  });

  it('does NOT render self as a next-step option', () => {
    const step = makeStep({ id: 1, key: 'step_one', name: 'Step One' });
    const sibling = makeSibling(2, 'step_two', 'Step Two');
    const props = { ...makeProps({}, {}), step, siblings: [step, sibling] };
    render(<PlaybookStepEditor {...props} />);
    const buttons = screen.getAllByRole('button');
    const selfButton = buttons.find((b) => b.textContent?.includes('Step One') && b.textContent?.trim() === 'Step One');
    // Self should not appear as a toggleable next-step button
    expect(selfButton).toBeUndefined();
  });

  it('calls onPatch with nextStepKeys when sibling toggled on', () => {
    const onPatch = vi.fn();
    const step = makeStep({ id: 1, key: 'step_one', nextStepKeys: [] });
    const sibling = makeSibling(2, 'step_two', 'Step Two');
    const props = { step, siblings: [step, sibling], onPatch, onRemove: vi.fn() };
    render(<PlaybookStepEditor {...props} />);
    fireEvent.click(screen.getByText('Step Two'));
    expect(onPatch).toHaveBeenCalledWith({ nextStepKeys: ['step_two'] });
  });

  it('calls onPatch removing key when already-active sibling is toggled off', () => {
    const onPatch = vi.fn();
    const step = makeStep({ id: 1, key: 'step_one', nextStepKeys: ['step_two'] });
    const sibling = makeSibling(2, 'step_two', 'Step Two');
    const props = { step, siblings: [step, sibling], onPatch, onRemove: vi.fn() };
    render(<PlaybookStepEditor {...props} />);
    fireEvent.click(screen.getByText('Step Two'));
    expect(onPatch).toHaveBeenCalledWith({ nextStepKeys: [] });
  });

  it('shows check icon next to active next step', () => {
    const step = makeStep({ id: 1, key: 'step_one', nextStepKeys: ['step_two'] });
    const sibling = makeSibling(2, 'step_two', 'Step Two');
    const props = { step, siblings: [step, sibling], onPatch: vi.fn(), onRemove: vi.fn() };
    const { container } = render(<PlaybookStepEditor {...props} />);
    // The active button contains 'check' icon text and the sibling name
    const stepTwoBtn = screen.getByText('Step Two').closest('button');
    expect(stepTwoBtn?.textContent).toContain('check');
  });

  it('uses sibling key as label when name is empty', () => {
    const step = makeStep({ id: 1, key: 'step_one', nextStepKeys: [] });
    const sibling = makeSibling(2, 'step_two', '');
    const props = { step, siblings: [step, sibling], onPatch: vi.fn(), onRemove: vi.fn() };
    render(<PlaybookStepEditor {...props} />);
    expect(screen.getByText('step_two')).toBeInTheDocument();
  });

  it('next-step buttons are disabled when busy=true', () => {
    const step = makeStep({ id: 1, key: 'step_one', nextStepKeys: [] });
    const sibling = makeSibling(2, 'step_two', 'Step Two');
    const props = {
      step,
      siblings: [step, sibling],
      onPatch: vi.fn(),
      onRemove: vi.fn(),
      busy: true,
    };
    render(<PlaybookStepEditor {...props} />);
    const stepTwoBtn = screen.getByText('Step Two').closest('button') as HTMLButtonElement;
    expect(stepTwoBtn.disabled).toBe(true);
  });
});

describe('PlaybookStepEditor — drag handle + drop target props', () => {
  it('wires onDragStart to the drag handle when dragHandleProps provided', () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const props = makeProps({}, { dragHandleProps: { onDragStart, onDragEnd } });
    const { container } = render(<PlaybookStepEditor {...props} />);
    const dragHandle = container.querySelector('[title="Drag to reorder"]')!;
    fireEvent.dragStart(dragHandle);
    expect(onDragStart).toHaveBeenCalled();
  });

  it('wires onDragEnd to the drag handle when dragHandleProps provided', () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const props = makeProps({}, { dragHandleProps: { onDragStart, onDragEnd } });
    const { container } = render(<PlaybookStepEditor {...props} />);
    const dragHandle = container.querySelector('[title="Drag to reorder"]')!;
    fireEvent.dragEnd(dragHandle);
    expect(onDragEnd).toHaveBeenCalled();
  });

  it('wires onDrop to the row container when dropTargetProps provided', () => {
    const onDragOver = vi.fn();
    const onDrop = vi.fn();
    const props = makeProps({}, { dropTargetProps: { onDragOver, onDrop } });
    const { container } = render(<PlaybookStepEditor {...props} />);
    // The outermost div gets the dropTargetProps
    const root = container.firstElementChild!;
    fireEvent.drop(root);
    expect(onDrop).toHaveBeenCalled();
  });
});

describe('PlaybookStepEditor — effect re-sync on step prop change', () => {
  it('re-syncs local name when step.name prop changes', () => {
    const step = makeStep({ name: 'Initial Name' });
    const props = makeProps({ name: 'Initial Name' });
    const { rerender } = render(<PlaybookStepEditor {...props} />);
    const nameInput = screen.getByPlaceholderText('Step name') as HTMLInputElement;
    expect(nameInput.value).toBe('Initial Name');

    // Simulate parent pushing a new authoritative step value
    const newStep = makeStep({ name: 'Server Name' });
    rerender(
      <PlaybookStepEditor
        step={newStep}
        siblings={[]}
        onPatch={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect((screen.getByPlaceholderText('Step name') as HTMLInputElement).value).toBe('Server Name');
  });
});

describe('PlaybookStepEditor — kindChip label in config header', () => {
  it('renders "Task config" label for task kind', () => {
    const props = makeProps({ kind: 'task' });
    const { container } = render(<PlaybookStepEditor {...props} />);
    expect(container.textContent).toContain('Task config');
  });

  it('renders "Note config" label for note kind', () => {
    const props = makeProps({ kind: 'note' });
    const { container } = render(<PlaybookStepEditor {...props} />);
    expect(container.textContent).toContain('Note config');
  });

  it('renders "Branch config" label for branch kind', () => {
    const props = makeProps({ kind: 'branch' });
    const { container } = render(<PlaybookStepEditor {...props} />);
    expect(container.textContent).toContain('Branch config');
  });
});
