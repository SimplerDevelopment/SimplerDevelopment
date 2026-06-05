// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Import component (no sub-component mocks needed — pure UI, no heavy deps)
// ---------------------------------------------------------------------------
import { SurveyRecommendationEditor } from '@/components/admin/SurveyRecommendationEditor';
import type {
  SurveyRecommendationConfig,
} from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOffering(overrides: Record<string, string> = {}) {
  return {
    key: overrides.key ?? 'offering-a',
    name: overrides.name ?? 'Offering A',
    tagline: overrides.tagline ?? 'Tagline A',
    youGet: overrides.youGet ?? 'You get A',
    price: overrides.price ?? '$1,000',
    duration: overrides.duration ?? '2 weeks',
  };
}

function makeConfig(overrides: Partial<SurveyRecommendationConfig> = {}): SurveyRecommendationConfig {
  return {
    offerings: [],
    questions: [],
    bookUrl: '',
    ...overrides,
  };
}

const radioField = {
  id: 'q1',
  type: 'radio',
  label: 'Your situation',
  options: ['Option A', 'Option B'],
};

const textField = {
  id: 'q2',
  type: 'text',
  label: 'Your name',
  options: [],
};

const selectField = {
  id: 'q3',
  type: 'select',
  label: 'Your goal',
  options: ['Goal X', 'Goal Y'],
};

function renderEditor(
  config: SurveyRecommendationConfig | undefined,
  surveyFields: typeof radioField[] = [],
  onChange = vi.fn(),
) {
  return {
    onChange,
    ...render(
      <SurveyRecommendationEditor
        config={config}
        surveyFields={surveyFields}
        onChange={onChange}
      />,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Empty / no-config state
// ---------------------------------------------------------------------------

describe('SurveyRecommendationEditor — no config (undefined)', () => {
  it('renders the empty-state message', () => {
    renderEditor(undefined, []);
    expect(screen.getByText(/No recommendation slide configured/i)).toBeInTheDocument();
  });

  it('shows the "Add Recommendation" button', () => {
    renderEditor(undefined, []);
    expect(screen.getByText('Add Recommendation')).toBeInTheDocument();
  });

  it('calls onChange with empty config when "Add Recommendation" is clicked', () => {
    const { onChange } = renderEditor(undefined, []);
    fireEvent.click(screen.getByText('Add Recommendation'));
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.offerings).toEqual([]);
    expect(arg.questions).toEqual([]);
    expect(arg.bookUrl).toBe('');
  });

  it('does not render the full editor when config is undefined', () => {
    renderEditor(undefined, []);
    expect(screen.queryByText('Header & CTA')).toBeNull();
    expect(screen.queryByText(/Offerings/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Header / CTA card
// ---------------------------------------------------------------------------

describe('SurveyRecommendationEditor — Header & CTA card', () => {
  it('renders the Header & CTA section', () => {
    renderEditor(makeConfig(), []);
    expect(screen.getByText('Header & CTA')).toBeInTheDocument();
  });

  it('shows bookUrl input with current value', () => {
    renderEditor(makeConfig({ bookUrl: 'https://calendly.com/test' }), []);
    const input = screen.getByPlaceholderText('https://calendly.com/...');
    expect(input).toHaveValue('https://calendly.com/test');
  });

  it('calls onChange when bookUrl changes', () => {
    const { onChange } = renderEditor(makeConfig({ bookUrl: '' }), []);
    const input = screen.getByPlaceholderText('https://calendly.com/...');
    fireEvent.change(input, { target: { value: 'https://cal.com/new' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.bookUrl).toBe('https://cal.com/new');
  });

  it('calls onChange when eyebrow changes', () => {
    const { onChange } = renderEditor(makeConfig({ eyebrow: '' }), []);
    const input = screen.getByPlaceholderText(/e.g. Here's where this lands/i);
    fireEvent.change(input, { target: { value: 'Here is the result' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.eyebrow).toBe('Here is the result');
  });

  it('calls onChange when narrativeTemplate changes', () => {
    const { onChange } = renderEditor(makeConfig(), []);
    const textarea = screen.getByPlaceholderText(/You're \{\{q1Context\}\}/i);
    fireEvent.change(textarea, { target: { value: 'Custom narrative' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.narrativeTemplate).toBe('Custom narrative');
  });

  it('shows alwaysAlsoOfferingKey select with "None" default', () => {
    renderEditor(makeConfig(), []);
    const select = screen.getByDisplayValue('— None —');
    expect(select).toBeInTheDocument();
  });

  it('renders offering options in the alwaysAlso select', () => {
    const config = makeConfig({ offerings: [makeOffering()] });
    renderEditor(config, []);
    // The select for "Always-also offering" should list the offering
    expect(screen.getByText('Offering A (offering-a)')).toBeInTheDocument();
  });

  it('calls onChange when alwaysAlsoOfferingKey is set', () => {
    const config = makeConfig({ offerings: [makeOffering()] });
    const { onChange } = renderEditor(config, []);
    const select = screen.getByDisplayValue('— None —');
    fireEvent.change(select, { target: { value: 'offering-a' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.alwaysAlsoOfferingKey).toBe('offering-a');
  });

  it('calls onChange with undefined when alwaysAlsoOfferingKey is cleared', () => {
    const config = makeConfig({
      offerings: [makeOffering()],
      alwaysAlsoOfferingKey: 'offering-a',
    });
    const { onChange } = renderEditor(config, []);
    // The select should show the current value; clear it
    const selects = screen.getAllByRole('combobox');
    // First combobox in the Header card is alwaysAlso
    fireEvent.change(selects[0], { target: { value: '' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.alwaysAlsoOfferingKey).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Offerings
// ---------------------------------------------------------------------------

describe('SurveyRecommendationEditor — Offerings', () => {
  it('shows "No offerings yet" when empty', () => {
    renderEditor(makeConfig(), []);
    expect(screen.getByText(/No offerings yet/i)).toBeInTheDocument();
  });

  it('renders the Offerings section title with count', () => {
    const config = makeConfig({ offerings: [makeOffering()] });
    renderEditor(config, []);
    expect(screen.getByText('Offerings (1)')).toBeInTheDocument();
  });

  it('calls onChange with a new offering when "Add Offering" is clicked', () => {
    const { onChange } = renderEditor(makeConfig(), []);
    fireEvent.click(screen.getByText('Add Offering'));
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.offerings).toHaveLength(1);
    expect(arg.offerings[0].name).toBe('New Offering');
  });

  it('renders offering fields (key, name, tagline, youGet, price, duration)', () => {
    const config = makeConfig({ offerings: [makeOffering()] });
    renderEditor(config, []);
    expect(screen.getByDisplayValue('offering-a')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Offering A')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tagline A')).toBeInTheDocument();
    expect(screen.getByDisplayValue('You get A')).toBeInTheDocument();
    expect(screen.getByDisplayValue('$1,000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2 weeks')).toBeInTheDocument();
  });

  it('calls onChange when offering name is edited', () => {
    const config = makeConfig({ offerings: [makeOffering()] });
    const { onChange } = renderEditor(config, []);
    const nameInput = screen.getByDisplayValue('Offering A');
    fireEvent.change(nameInput, { target: { value: 'Renamed' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.offerings[0].name).toBe('Renamed');
  });

  it('calls onChange when offering price is edited', () => {
    const config = makeConfig({ offerings: [makeOffering()] });
    const { onChange } = renderEditor(config, []);
    const priceInput = screen.getByDisplayValue('$1,000');
    fireEvent.change(priceInput, { target: { value: '$2,500' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.offerings[0].price).toBe('$2,500');
  });

  it('removes an offering when delete is clicked (confirm=true)', () => {
    const config = makeConfig({ offerings: [makeOffering()] });
    const { onChange } = renderEditor(config, []);
    const deleteBtn = screen.getByTitle('Remove offering');
    fireEvent.click(deleteBtn);
    expect(window.confirm).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.offerings).toHaveLength(0);
  });

  it('does NOT remove offering when confirm returns false', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const config = makeConfig({ offerings: [makeOffering()] });
    const { onChange } = renderEditor(config, []);
    fireEvent.click(screen.getByTitle('Remove offering'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renames key references in questions/overrides/hybrid when key is changed', () => {
    const offering = makeOffering({ key: 'old-key', name: 'Old' });
    const config = makeConfig({
      offerings: [offering],
      questions: [{ fieldId: 'q1', optionToOffering: { 'Option A': 'old-key' }, context: {} }],
      overrides: [{ whenAnyAnswer: [], forceOfferingKey: 'old-key' }],
      alwaysAlsoOfferingKey: 'old-key',
    });
    const { onChange } = renderEditor(config, []);
    const keyInput = screen.getByDisplayValue('old-key');
    fireEvent.change(keyInput, { target: { value: 'new-key' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.offerings[0].key).toBe('new-key');
    expect(arg.questions[0].optionToOffering['Option A']).toBe('new-key');
    expect(arg.overrides![0].forceOfferingKey).toBe('new-key');
    expect(arg.alwaysAlsoOfferingKey).toBe('new-key');
  });
});

// ---------------------------------------------------------------------------
// Question Routing
// ---------------------------------------------------------------------------

describe('SurveyRecommendationEditor — Question Routing', () => {
  it('shows "No radio/select questions" when only text fields exist', () => {
    renderEditor(makeConfig(), [textField]);
    expect(screen.getByText(/No radio\/select questions/i)).toBeInTheDocument();
  });

  it('renders routable fields (radio and select) but not text fields', () => {
    renderEditor(makeConfig({ offerings: [makeOffering()] }), [radioField, textField, selectField]);
    // Radio and select field labels appear in routing section
    expect(screen.getByText('Your situation')).toBeInTheDocument();
    expect(screen.getByText('Your goal')).toBeInTheDocument();
  });

  it('renders field options inside routing details', () => {
    renderEditor(makeConfig({ offerings: [makeOffering()] }), [radioField]);
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('calls onChange with optionToOffering when a vote select is changed', () => {
    const config = makeConfig({ offerings: [makeOffering()] });
    const { onChange } = renderEditor(config, [radioField]);
    // Vote selects are labelled "— No vote —"
    const voteSelects = screen.getAllByDisplayValue('— No vote —');
    fireEvent.change(voteSelects[0], { target: { value: 'offering-a' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.questions[0].optionToOffering['Option A']).toBe('offering-a');
  });

  it('removes optionToOffering entry when vote is cleared', () => {
    const config = makeConfig({
      offerings: [makeOffering()],
      questions: [{ fieldId: 'q1', optionToOffering: { 'Option A': 'offering-a' }, context: {} }],
    });
    const { onChange } = renderEditor(config, [radioField]);
    // Multiple elements may display "Offering A" (the name input + the vote select).
    // Filter to the <select> element specifically.
    const voteSelect = screen.getAllByDisplayValue('Offering A').find(
      el => el.tagName === 'SELECT',
    ) as HTMLSelectElement;
    expect(voteSelect).toBeDefined();
    fireEvent.change(voteSelect, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.questions[0].optionToOffering['Option A']).toBeUndefined();
  });

  it('calls onChange with context when a context phrase input changes', () => {
    const config = makeConfig({ offerings: [makeOffering()] });
    const { onChange } = renderEditor(config, [radioField]);
    const contextInputs = screen.getAllByPlaceholderText('fills {{q1Context}} etc.');
    fireEvent.change(contextInputs[0], { target: { value: 'a startup founder' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.questions[0].context!['Option A']).toBe('a startup founder');
  });

  it('removes context entry when context phrase is cleared', () => {
    const config = makeConfig({
      offerings: [makeOffering()],
      questions: [{ fieldId: 'q1', optionToOffering: {}, context: { 'Option A': 'a founder' } }],
    });
    const { onChange } = renderEditor(config, [radioField]);
    const contextInput = screen.getByDisplayValue('a founder');
    fireEvent.change(contextInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.questions[0].context!['Option A']).toBeUndefined();
  });

  it('shows routed count per field', () => {
    const config = makeConfig({
      offerings: [makeOffering()],
      questions: [{ fieldId: 'q1', optionToOffering: { 'Option A': 'offering-a' }, context: {} }],
    });
    renderEditor(config, [radioField]);
    // "1/2 routed"
    expect(screen.getByText('1/2 routed')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

describe('SurveyRecommendationEditor — Overrides', () => {
  it('shows "No overrides" when empty', () => {
    renderEditor(makeConfig(), []);
    expect(screen.getByText('No overrides.')).toBeInTheDocument();
  });

  it('shows overrides count in section title', () => {
    const config = makeConfig({
      overrides: [{ whenAnyAnswer: [], forceOfferingKey: 'offering-a' }],
    });
    renderEditor(config, []);
    expect(screen.getByText('Overrides (1)')).toBeInTheDocument();
  });

  it('calls onChange with a new override when "Add Override" is clicked', () => {
    const config = makeConfig({ offerings: [makeOffering()] });
    const { onChange } = renderEditor(config, []);
    fireEvent.click(screen.getByText('Add Override'));
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.overrides).toHaveLength(1);
    expect(arg.overrides![0].forceOfferingKey).toBe('offering-a');
  });

  it('adds override with empty forceOfferingKey when no offerings exist', () => {
    const { onChange } = renderEditor(makeConfig(), []);
    fireEvent.click(screen.getByText('Add Override'));
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.overrides![0].forceOfferingKey).toBe('');
  });

  it('removes an override when delete is clicked', () => {
    const config = makeConfig({
      offerings: [makeOffering()],
      overrides: [{ whenAnyAnswer: [], forceOfferingKey: 'offering-a' }],
    });
    const { onChange } = renderEditor(config, []);
    const removeBtn = screen.getByTitle('Remove');
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.overrides).toHaveLength(0);
  });

  it('calls onChange when forceOfferingKey select changes', () => {
    const config = makeConfig({
      offerings: [makeOffering(), makeOffering({ key: 'offering-b', name: 'Offering B' })],
      overrides: [{ whenAnyAnswer: [], forceOfferingKey: 'offering-a' }],
    });
    const { onChange } = renderEditor(config, []);
    // The override's "Force offering" select starts at offering-a
    const forceSelect = screen.getAllByRole('combobox').find(
      s => s.getAttribute('title') === null && (s as HTMLSelectElement).value === 'offering-a',
    )!;
    fireEvent.change(forceSelect, { target: { value: 'offering-b' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.overrides![0].forceOfferingKey).toBe('offering-b');
  });

  it('adds a whenAnyAnswer entry when a checkbox is checked in an override', () => {
    const config = makeConfig({
      offerings: [makeOffering()],
      overrides: [{ whenAnyAnswer: [], forceOfferingKey: 'offering-a' }],
    });
    const { onChange } = renderEditor(config, [radioField]);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.overrides![0].whenAnyAnswer).toHaveLength(1);
    expect(arg.overrides![0].whenAnyAnswer[0].values).toContain('Option A');
  });

  it('removes a whenAnyAnswer entry when a checkbox is unchecked', () => {
    const config = makeConfig({
      offerings: [makeOffering()],
      overrides: [{
        whenAnyAnswer: [{ fieldId: 'q1', values: ['Option A'] }],
        forceOfferingKey: 'offering-a',
      }],
    });
    const { onChange } = renderEditor(config, [radioField]);
    const checkboxes = screen.getAllByRole('checkbox');
    // Option A checkbox should be checked
    const checkedBox = checkboxes.find(cb => (cb as HTMLInputElement).checked);
    expect(checkedBox).toBeDefined();
    fireEvent.click(checkedBox!);
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    // When last value removed, the fieldId entry is removed entirely
    expect(arg.overrides![0].whenAnyAnswer).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Hybrid Rule
// ---------------------------------------------------------------------------

describe('SurveyRecommendationEditor — Hybrid Rule', () => {
  it('shows "No hybrid rule" when hybrid is not set', () => {
    renderEditor(makeConfig(), []);
    expect(screen.getByText('No hybrid rule.')).toBeInTheDocument();
  });

  it('shows "Enable" button when hybrid is disabled', () => {
    renderEditor(makeConfig(), []);
    expect(screen.getByText('Enable')).toBeInTheDocument();
  });

  it('calls onChange with empty hybrid rule when "Enable" is clicked', () => {
    const { onChange } = renderEditor(makeConfig(), []);
    fireEvent.click(screen.getByText('Enable'));
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.hybrid).toBeDefined();
    expect(arg.hybrid!.offeringKeys).toEqual([]);
    expect(arg.hybrid!.title).toBe('');
    expect(arg.hybrid!.body).toBe('');
  });

  it('shows "Disable" button when hybrid is enabled', () => {
    const config = makeConfig({
      hybrid: { whenAnswers: {}, title: 'Hybrid Title', body: 'Hybrid Body', offeringKeys: [] },
    });
    renderEditor(config, []);
    expect(screen.getByText('Disable')).toBeInTheDocument();
  });

  it('calls onChange with hybrid=undefined when "Disable" is clicked', () => {
    const config = makeConfig({
      hybrid: { whenAnswers: {}, title: 'H', body: 'B', offeringKeys: [] },
    });
    const { onChange } = renderEditor(config, []);
    fireEvent.click(screen.getByText('Disable'));
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.hybrid).toBeUndefined();
  });

  it('renders hybrid title and body inputs when enabled', () => {
    const config = makeConfig({
      hybrid: { whenAnswers: {}, title: 'My Title', body: 'My Body', offeringKeys: [] },
    });
    renderEditor(config, []);
    expect(screen.getByDisplayValue('My Title')).toBeInTheDocument();
    expect(screen.getByDisplayValue('My Body')).toBeInTheDocument();
  });

  it('calls onChange when hybrid title is edited', () => {
    const config = makeConfig({
      hybrid: { whenAnswers: {}, title: '', body: '', offeringKeys: [] },
    });
    const { onChange } = renderEditor(config, []);
    const titleInput = screen.getByPlaceholderText(/A Snapshot into a Roadmap/i);
    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.hybrid!.title).toBe('New Title');
  });

  it('calls onChange when hybrid body is edited', () => {
    // Use non-empty title so the title textarea is distinguishable; body stays empty.
    const config = makeConfig({
      hybrid: { whenAnswers: {}, title: 'FIXED_TITLE', body: '', offeringKeys: [] },
    });
    const { onChange } = renderEditor(config, []);
    // Textareas: narrativeTemplate (global) and hybrid body. Hybrid body has no
    // placeholder and an empty value — find the one that is NOT narrativeTemplate.
    const textareas = screen.getAllByRole('textbox').filter(
      t => t.tagName === 'TEXTAREA' && !(t as HTMLTextAreaElement).placeholder,
    );
    // Should be the hybrid body textarea (narrativeTemplate has a placeholder).
    const bodyTextarea = textareas[0];
    expect(bodyTextarea).toBeDefined();
    fireEvent.change(bodyTextarea, { target: { value: 'Body text here' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.hybrid!.body).toBe('Body text here');
  });

  it('adds offeringKey to hybrid when offering checkbox is checked', () => {
    const config = makeConfig({
      offerings: [makeOffering()],
      hybrid: { whenAnswers: {}, title: '', body: '', offeringKeys: [] },
    });
    const { onChange } = renderEditor(config, []);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.hybrid!.offeringKeys).toContain('offering-a');
  });

  it('removes offeringKey from hybrid when offering checkbox is unchecked', () => {
    const config = makeConfig({
      offerings: [makeOffering()],
      hybrid: { whenAnswers: {}, title: '', body: '', offeringKeys: ['offering-a'] },
    });
    const { onChange } = renderEditor(config, []);
    const checkboxes = screen.getAllByRole('checkbox');
    const checked = checkboxes.find(cb => (cb as HTMLInputElement).checked);
    expect(checked).toBeDefined();
    fireEvent.click(checked!);
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.hybrid!.offeringKeys).not.toContain('offering-a');
  });

  it('calls onChange when a whenAnswers select is changed', () => {
    const config = makeConfig({
      hybrid: { whenAnswers: {}, title: '', body: '', offeringKeys: [] },
    });
    const { onChange } = renderEditor(config, [radioField]);
    // The "— Any —" selects are for whenAnswers per routable field
    const anySelects = screen.getAllByDisplayValue('— Any —');
    fireEvent.change(anySelects[0], { target: { value: 'Option A' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.hybrid!.whenAnswers['q1']).toBe('Option A');
  });

  it('removes whenAnswers entry when select is cleared to empty', () => {
    const config = makeConfig({
      hybrid: { whenAnswers: { q1: 'Option A' }, title: '', body: '', offeringKeys: [] },
    });
    const { onChange } = renderEditor(config, [radioField]);
    const select = screen.getByDisplayValue('Option A');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.hybrid!.whenAnswers['q1']).toBeUndefined();
  });

  it('shows checked position badge (#1, #2) for ordered offeringKeys', () => {
    const config = makeConfig({
      offerings: [makeOffering(), makeOffering({ key: 'offering-b', name: 'Offering B' })],
      hybrid: { whenAnswers: {}, title: '', body: '', offeringKeys: ['offering-a', 'offering-b'] },
    });
    renderEditor(config, []);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Edge cases / multi-offering interactions
// ---------------------------------------------------------------------------

describe('SurveyRecommendationEditor — edge cases', () => {
  it('renders two offerings and shows correct count', () => {
    const config = makeConfig({
      offerings: [
        makeOffering({ key: 'a', name: 'Alpha' }),
        makeOffering({ key: 'b', name: 'Beta' }),
      ],
    });
    renderEditor(config, []);
    expect(screen.getByText('Offerings (2)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Alpha')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Beta')).toBeInTheDocument();
  });

  it('does not mutate original config when updating an offering', () => {
    const original = makeConfig({ offerings: [makeOffering()] });
    const frozen = JSON.parse(JSON.stringify(original)) as SurveyRecommendationConfig;
    const onChange = vi.fn();
    render(
      <SurveyRecommendationEditor
        config={original}
        surveyFields={[]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByDisplayValue('Offering A'), { target: { value: 'Changed' } });
    // Original must be unchanged
    expect(original.offerings[0].name).toBe(frozen.offerings[0].name);
  });

  it('handles existing question context being updated (upsert path)', () => {
    const config = makeConfig({
      offerings: [makeOffering()],
      questions: [{ fieldId: 'q1', optionToOffering: { 'Option A': 'offering-a' }, context: { 'Option A': 'existing phrase' } }],
    });
    const { onChange } = renderEditor(config, [radioField]);
    const contextInput = screen.getByDisplayValue('existing phrase');
    fireEvent.change(contextInput, { target: { value: 'updated phrase' } });
    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as SurveyRecommendationConfig;
    expect(arg.questions[0].context!['Option A']).toBe('updated phrase');
    // Other question data preserved
    expect(arg.questions[0].optionToOffering['Option A']).toBe('offering-a');
  });

  it('enableHybrid is a no-op when hybrid already set', () => {
    // Clicking Enable when hybrid is already enabled should not call onChange again
    // (The button shows "Disable" when hybrid is set — so Enable button is absent)
    const config = makeConfig({
      hybrid: { whenAnswers: {}, title: '', body: '', offeringKeys: [] },
    });
    renderEditor(config, []);
    expect(screen.queryByText('Enable')).toBeNull();
    expect(screen.getByText('Disable')).toBeInTheDocument();
  });

  it('renders overrides count of 0 when overrides is undefined', () => {
    renderEditor(makeConfig(), []);
    expect(screen.getByText('Overrides (0)')).toBeInTheDocument();
  });

  it('renders overrides count of 0 when overrides is empty array', () => {
    renderEditor(makeConfig({ overrides: [] }), []);
    expect(screen.getByText('Overrides (0)')).toBeInTheDocument();
  });
});
