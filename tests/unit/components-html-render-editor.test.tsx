// @vitest-environment jsdom
/**
 * HtmlRenderEditor — settings-panel editor for the `html-render` block.
 *
 * Covers the public `HtmlRenderEditor` + `ImagePickerModal` exports plus the
 * many internal sub-components (HtmlRenderFullJson, HtmlRenderFieldInput,
 * HtmlRenderPostPicker, HtmlRenderUrlAutocomplete, HtmlRenderArrayEditor,
 * HtmlRenderSchemaActions, HtmlRenderAddFieldMenu, HtmlRenderSubFieldsEditor,
 * HtmlRenderTabbedForm).
 *
 * Heavy transitive deps (MediaPicker, HtmlTemplateEditor, dnd-kit, the
 * shared panel-fields wrappers) are mocked to deterministic stubs so the
 * tests focus on this file's own branching logic.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/components/admin/MediaPicker', () => ({
  __esModule: true,
  default: ({ value, onChange, label, apiEndpoint }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'media-picker', 'data-api': apiEndpoint, 'data-label': label || '' },
      React.createElement('span', null, value || ''),
      React.createElement('button', {
        type: 'button',
        'data-testid': 'media-pick',
        onClick: () => onChange('https://cdn.example/picked.png'),
      }, 'pick'),
    ),
}));

vi.mock('@/components/blocks/visual/HtmlTemplateEditor', () => ({
  __esModule: true,
  HtmlTemplateEditor: ({ value, onChange }: any) =>
    React.createElement('textarea', {
      'data-testid': 'html-template-editor',
      value: value || '',
      onChange: (e: any) => onChange(e.target.value),
    }),
}));

vi.mock('@/components/portal/visual-editor/panel-fields', () => ({
  __esModule: true,
  Field: ({ label, value, onChange }: any) =>
    React.createElement(
      'label',
      { 'data-testid': `field-${label}` },
      React.createElement('span', null, label),
      React.createElement('input', {
        type: 'text',
        value: value || '',
        onChange: (e: any) => onChange(e.target.value),
      }),
    ),
  SelectField: ({ label, value, options, onChange }: any) =>
    React.createElement(
      'label',
      { 'data-testid': `select-${label}` },
      React.createElement('span', null, label),
      React.createElement(
        'select',
        { value: value || '', onChange: (e: any) => onChange(e.target.value) },
        options.map((opt: string) =>
          React.createElement('option', { key: opt, value: opt }, opt),
        ),
      ),
    ),
  NumberField: ({ label, value, onChange, min, max, step }: any) =>
    React.createElement(
      'label',
      { 'data-testid': `number-${label}` },
      React.createElement('span', null, label),
      React.createElement('input', {
        type: 'number',
        value: value ?? 0,
        min,
        max,
        step,
        onChange: (e: any) => onChange(Number(e.target.value)),
      }),
    ),
  CheckboxField: ({ label, checked, onChange }: any) =>
    React.createElement(
      'label',
      { 'data-testid': `checkbox-${label}` },
      React.createElement('span', null, label),
      React.createElement('input', {
        type: 'checkbox',
        checked: !!checked,
        onChange: (e: any) => onChange(e.target.checked),
      }),
    ),
  TextareaField: ({ label, value, onChange, rows }: any) =>
    React.createElement(
      'label',
      { 'data-testid': `textarea-${label}` },
      React.createElement('span', null, label),
      React.createElement('textarea', {
        rows,
        value: value || '',
        onChange: (e: any) => onChange(e.target.value),
      }),
    ),
  RichTextField: ({ label, value, onChange }: any) =>
    React.createElement(
      'label',
      { 'data-testid': `richtext-${label}` },
      React.createElement('span', null, label),
      React.createElement('textarea', {
        'data-testid': `richtext-input-${label}`,
        value: value || '',
        onChange: (e: any) => onChange(e.target.value),
      }),
    ),
  ColorField: ({ label, value, onChange }: any) =>
    React.createElement(
      'label',
      { 'data-testid': `color-${label}` },
      React.createElement('span', null, label),
      React.createElement('input', {
        type: 'color',
        value: value || '#000000',
        onChange: (e: any) => onChange(e.target.value),
      }),
    ),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'dnd-context' }, children),
  closestCenter: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  PointerSensor: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'sortable-context' }, children),
  useSortable: ({ id }: { id: string }) => ({
    setNodeRef: () => {},
    attributes: { 'data-sortable-id': id },
    listeners: {},
    transform: null,
    transition: null,
    isDragging: false,
    setActivatorNodeRef: () => {},
  }),
  verticalListSortingStrategy: vi.fn(),
  arrayMove: (arr: any[], from: number, to: number) => {
    const next = arr.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  },
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: { toString: () => '' },
  },
}));

// ─── Imports under test (after mocks) ───────────────────────────────────────

import { HtmlRenderEditor, ImagePickerModal } from '@/components/portal/visual-editor/HtmlRenderEditor';

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeBlock(overrides: Record<string, any> = {}) {
  return {
    id: 'b1',
    type: 'html-render',
    order: 0,
    html: '',
    width: 'full',
    fields: [],
    values: {},
    ...overrides,
  } as any;
}

beforeEach(() => {
  // Reset localStorage so HtmlRenderSchemaActions starts clean.
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── HtmlRenderEditor — top-level shell ─────────────────────────────────────

describe('HtmlRenderEditor', () => {
  it('renders the width selector with the block value', () => {
    const onUpdate = vi.fn();
    const { getByTestId } = render(
      <HtmlRenderEditor block={makeBlock({ width: 'contained' })} onUpdate={onUpdate} />,
    );
    const select = getByTestId('select-Width').querySelector('select');
    expect(select?.value).toBe('contained');
  });

  it('updates width on selection change', () => {
    const onUpdate = vi.fn();
    const { getByTestId } = render(
      <HtmlRenderEditor block={makeBlock()} onUpdate={onUpdate} />,
    );
    const select = getByTestId('select-Width').querySelector('select')!;
    fireEvent.change(select, { target: { value: 'contained' } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ width: 'contained' }));
  });

  it('hides the Content section when there are no fields', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <HtmlRenderEditor block={makeBlock()} onUpdate={onUpdate} />,
    );
    expect(container.textContent).not.toContain('Content');
    expect(container.textContent).not.toContain('Field schema');
  });

  it('shows the Content section once at least one field is present', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [{ name: 'title', type: 'text', label: 'Title' }],
      values: { title: 'Hi' },
    });
    const { container } = render(
      <HtmlRenderEditor block={block} onUpdate={onUpdate} />,
    );
    expect(container.textContent).toContain('Content');
    expect(container.textContent).toContain('Field schema (1)');
  });

  it('emits a values update when a field input changes', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [{ name: 'title', type: 'text', label: 'Title' }],
      values: { title: 'old' },
    });
    const { getByTestId } = render(
      <HtmlRenderEditor block={block} onUpdate={onUpdate} />,
    );
    const input = getByTestId('field-Title').querySelector('input')!;
    fireEvent.change(input, { target: { value: 'new value' } });
    expect(onUpdate).toHaveBeenCalledWith({ values: { title: 'new value' } });
  });

  it('reconciles fields when the HTML template is edited', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({ html: '<h1>{{title}}</h1>', fields: [{ name: 'title', type: 'text' }] });
    const { getByTestId } = render(
      <HtmlRenderEditor block={block} onUpdate={onUpdate} />,
    );
    const textarea = getByTestId('html-template-editor');
    fireEvent.change(textarea, { target: { value: '<h1>{{title}}</h1><p>{{body}}</p>' } });
    expect(onUpdate).toHaveBeenCalled();
    const call = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(call.html).toContain('{{body}}');
    expect(Array.isArray(call.fields)).toBe(true);
  });

  it('shows the loop section when the template contains data-loop="posts"', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      html: '<div data-loop="posts">{{post.title}}</div>',
      fields: [],
    });
    const { container } = render(
      <HtmlRenderEditor block={block} onUpdate={onUpdate} />,
    );
    expect(container.textContent).toContain('Loop source');
  });

  it('shows the loop section when a loop object is set even without data-loop markup, with warning', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      html: '<div>no loop here</div>',
      loop: { source: 'posts', postType: 'blog', limit: 5, orderBy: 'recent' },
    });
    const { container } = render(
      <HtmlRenderEditor block={block} onUpdate={onUpdate} />,
    );
    expect(container.textContent).toContain('Loop source');
    expect(container.textContent).toContain('No');
    expect(container.textContent).toContain('data-loop');
  });

  it('sets a loop default object when post type is typed for the first time', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({ html: '<div data-loop="posts">x</div>' });
    const { getByTestId } = render(
      <HtmlRenderEditor block={block} onUpdate={onUpdate} />,
    );
    const input = getByTestId('field-Post type slug').querySelector('input')!;
    fireEvent.change(input, { target: { value: 'case-study' } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      loop: expect.objectContaining({ source: 'posts', postType: 'case-study', limit: 3, orderBy: 'recent' }),
    }));
  });

  it('updates loop limit and orderBy when changed', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      html: '<div data-loop="posts">x</div>',
      loop: { source: 'posts', postType: 'blog', limit: 3, orderBy: 'recent' },
    });
    const { getByTestId } = render(
      <HtmlRenderEditor block={block} onUpdate={onUpdate} />,
    );
    const limit = getByTestId('number-Limit').querySelector('input')!;
    fireEvent.change(limit, { target: { value: '8' } });
    const order = getByTestId('select-Order').querySelector('select')!;
    fireEvent.change(order, { target: { value: 'title' } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      loop: expect.objectContaining({ limit: 8 }),
    }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      loop: expect.objectContaining({ orderBy: 'title' }),
    }));
  });

  it('disables the loop when "Disable loop" is clicked', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      html: '<div data-loop="posts">x</div>',
      loop: { source: 'posts', postType: 'blog' },
    });
    const { getByText } = render(
      <HtmlRenderEditor block={block} onUpdate={onUpdate} />,
    );
    fireEvent.click(getByText(/Disable loop/));
    expect(onUpdate).toHaveBeenCalledWith({ loop: undefined });
  });

  it('uses the per-site mediaApi when siteId is given', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [{ name: 'img', type: 'image' }],
      values: { img: '' },
    });
    const { container } = render(
      <HtmlRenderEditor block={block} onUpdate={onUpdate} siteId={42} />,
    );
    const picker = container.querySelector('[data-testid="media-picker"]');
    expect(picker?.getAttribute('data-api')).toBe('/api/portal/cms/websites/42/media');
  });

  it('falls back to /api/portal/media when no siteId is given', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({ fields: [{ name: 'img', type: 'image' }], values: {} });
    const { container } = render(
      <HtmlRenderEditor block={block} onUpdate={onUpdate} />,
    );
    const picker = container.querySelector('[data-testid="media-picker"]');
    expect(picker?.getAttribute('data-api')).toBe('/api/portal/media');
  });
});

// ─── Field-type rendering (HtmlRenderFieldInput) ────────────────────────────

describe('HtmlRenderFieldInput dispatch', () => {
  const baseProps = (fields: any[], values: any = {}) => ({
    block: makeBlock({ fields, values }),
    onUpdate: vi.fn(),
  });

  it('renders a textarea for textarea fields', () => {
    const { container } = render(
      <HtmlRenderEditor {...baseProps([{ name: 'body', type: 'textarea', label: 'Body' }])} />,
    );
    expect(container.querySelector('[data-testid="textarea-Body"]')).toBeTruthy();
  });

  it('renders a number input for number fields with min/max/step', () => {
    const { container } = render(
      <HtmlRenderEditor {...baseProps([{ name: 'count', type: 'number', label: 'Count', min: 0, max: 10, step: 2 }], { count: '5' })} />,
    );
    const numInput = container.querySelector('[data-testid="number-Count"] input') as HTMLInputElement;
    expect(numInput).toBeTruthy();
    expect(numInput.value).toBe('5');
  });

  it('renders a checkbox for boolean fields and coerces to "true"/"false"', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [{ name: 'flag', type: 'boolean', label: 'Flag' }],
      values: { flag: 'false' },
    });
    const { container } = render(
      <HtmlRenderEditor block={block} onUpdate={onUpdate} />,
    );
    const cb = container.querySelector('[data-testid="checkbox-Flag"] input') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalledWith({ values: { flag: 'true' } });
  });

  it('renders a richtext editor for richtext fields', () => {
    const { container } = render(
      <HtmlRenderEditor {...baseProps([{ name: 'body', type: 'richtext', label: 'Body' }])} />,
    );
    expect(container.querySelector('[data-testid="richtext-Body"]')).toBeTruthy();
  });

  it('renders a MediaPicker for image fields', () => {
    const { container } = render(
      <HtmlRenderEditor {...baseProps([{ name: 'hero', type: 'image', label: 'Hero' }])} />,
    );
    expect(container.querySelector('[data-testid="media-picker"]')).toBeTruthy();
  });

  it('renders a color picker for color fields', () => {
    const { container } = render(
      <HtmlRenderEditor {...baseProps([{ name: 'accent', type: 'color', label: 'Accent' }])} />,
    );
    expect(container.querySelector('[data-testid="color-Accent"]')).toBeTruthy();
  });

  it('renders a select for select fields when options are present', () => {
    const { container } = render(
      <HtmlRenderEditor
        {...baseProps([{ name: 'mode', type: 'select', label: 'Mode', options: ['a', 'b'] }])}
      />,
    );
    expect(container.querySelector('[data-testid="select-Mode"]')).toBeTruthy();
  });

  it('renders radio buttons for radio fields with options', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [{ name: 'pick', type: 'radio', label: 'Pick', options: ['x', 'y'] }],
      values: { pick: 'x' },
    });
    const { container } = render(
      <HtmlRenderEditor block={block} onUpdate={onUpdate} />,
    );
    const radios = container.querySelectorAll('input[type="radio"][name="field-pick"]');
    expect(radios.length).toBe(2);
    fireEvent.click(radios[1]);
    expect(onUpdate).toHaveBeenCalledWith({ values: { pick: 'y' } });
  });

  it('renders a date input for date fields', () => {
    const { container } = render(
      <HtmlRenderEditor {...baseProps([{ name: 'd', type: 'date', label: 'Day' }])} />,
    );
    const dateInput = container.querySelector('input[type="date"]');
    expect(dateInput).toBeTruthy();
  });

  it('renders a datetime-local input for datetime fields', () => {
    const { container } = render(
      <HtmlRenderEditor {...baseProps([{ name: 'dt', type: 'datetime', label: 'When' }])} />,
    );
    const dtInput = container.querySelector('input[type="datetime-local"]');
    expect(dtInput).toBeTruthy();
  });

  it('marks a required field with an asterisk in the label', () => {
    const { container } = render(
      <HtmlRenderEditor
        {...baseProps([{ name: 'name', type: 'text', label: 'Name', required: true }])}
      />,
    );
    expect(container.textContent).toContain('Name *');
  });

  it('renders help text under a field with .help set', () => {
    const { container } = render(
      <HtmlRenderEditor
        {...baseProps([{ name: 'x', type: 'text', label: 'X', help: 'helpful hint' }])}
      />,
    );
    expect(container.textContent).toContain('helpful hint');
  });

  it('hides a field whose conditional rule fails', () => {
    const block = makeBlock({
      fields: [
        { name: 'toggle', type: 'boolean', label: 'Toggle' },
        { name: 'secret', type: 'text', label: 'Secret', conditional: { field: 'toggle', operator: 'eq', value: 'true' } },
      ],
      values: { toggle: 'false' },
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    // The values form should render Toggle's input but NOT Secret's input
    // (suppressed by the failing conditional). The schema editor below still
    // lists both field names, so we assert on the test-ids the mocks emit.
    expect(container.querySelector('[data-testid="checkbox-Toggle"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="field-Secret"]')).toBeNull();
  });

  it('renders a group field with materialized link sub-fields when type is "link"', () => {
    const block = makeBlock({
      fields: [{ name: 'cta', type: 'link', label: 'CTA' }],
      values: {},
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    expect(container.textContent).toContain('URL');
    expect(container.textContent).toContain('Label');
    expect(container.textContent).toContain('Open in');
  });
});

// ─── Schema editor — rename, delete, type changes ───────────────────────────

describe('HtmlRenderEditor schema editor', () => {
  it('updates a field label when edited in the schema panel', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [{ name: 'title', type: 'text', label: 'Title' }],
    });
    const { getAllByTestId } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    // The "Label" input in the schema editor (1 field). There may be multiple
    // matching elements; the first within the schema panel is what we want.
    const labelInputs = getAllByTestId('field-Label');
    const input = labelInputs[0].querySelector('input')!;
    fireEvent.change(input, { target: { value: 'Headline' } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'title', label: 'Headline' }),
      ]),
    }));
  });

  it('changes a field type when the Type select is changed', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [{ name: 'title', type: 'text', label: 'Title' }],
    });
    const { getByTestId } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    const select = getByTestId('select-Type').querySelector('select')!;
    fireEvent.change(select, { target: { value: 'textarea' } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'title', type: 'textarea' }),
      ]),
    }));
  });

  it('deletes a field and clears its value when the delete icon is clicked', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [{ name: 'gone', type: 'text', label: 'Gone' }],
      values: { gone: 'bye' },
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('title')?.startsWith('Delete field'),
    )!;
    fireEvent.click(deleteBtn);
    expect(onUpdate).toHaveBeenCalledWith({ fields: [], values: {} });
  });

  it('renames a field via the prompt and updates values + template refs', () => {
    const onUpdate = vi.fn();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('renamed');
    const block = makeBlock({
      html: '<h1>{{title}}</h1>',
      fields: [{ name: 'title', type: 'text', label: 'Title' }],
      values: { title: 'Hi' },
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    const renameBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('title')?.startsWith('Rename field key'),
    )!;
    fireEvent.click(renameBtn);
    expect(promptSpy).toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'renamed' }),
      ]),
      values: expect.objectContaining({ renamed: 'Hi' }),
    }));
  });

  it('rejects an invalid field key with an alert and does not update', () => {
    const onUpdate = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValue('123-bad');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const block = makeBlock({
      fields: [{ name: 'good', type: 'text' }],
      values: { good: 'v' },
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    const renameBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('title')?.startsWith('Rename field key'),
    )!;
    fireEvent.click(renameBtn);
    expect(alertSpy).toHaveBeenCalled();
    // No fields update should have been emitted (only the schema-actions
    // initial setClipboard storage handler may have fired — checked indirectly
    // by asserting the rename call argument shape isn't present).
    const calls = onUpdate.mock.calls;
    expect(calls.find((c) => c[0].fields && c[0].fields[0]?.name !== 'good')).toBeFalsy();
  });

  it('rejects a duplicate field key with an alert', () => {
    const onUpdate = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValue('two');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const block = makeBlock({
      fields: [
        { name: 'one', type: 'text' },
        { name: 'two', type: 'text' },
      ],
      values: {},
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    const renameBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('title')?.startsWith('Rename field key'),
    )!;
    fireEvent.click(renameBtn);
    expect(alertSpy).toHaveBeenCalled();
  });

  it('shows the "unused" usage badge when the template lacks the field', () => {
    const block = makeBlock({
      html: '<h1>no refs</h1>',
      fields: [{ name: 'orphan', type: 'text' }],
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    expect(container.textContent).toContain('unused');
  });

  it('shows the "Nx" usage badge with a count when the template references the field', () => {
    const block = makeBlock({
      html: '<h1>{{title}}</h1><p>{{title}}</p>',
      fields: [{ name: 'title', type: 'text' }],
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    expect(container.textContent).toMatch(/2×/);
  });
});

// ─── HtmlRenderAddFieldMenu ────────────────────────────────────────────────

describe('HtmlRenderAddFieldMenu', () => {
  it('toggles the menu open and adds a preset on click', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [{ name: 'existing', type: 'text' }],
    });
    const { container, getByText } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    fireEvent.click(getByText('Add field'));
    // Preset "Text" should now be visible.
    expect(container.textContent).toContain('Text');
    fireEvent.click(getByText('Textarea'));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({ type: 'textarea' }),
      ]),
    }));
  });

  it('disambiguates duplicate names by appending _N', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [{ name: 'text', type: 'text' }],
    });
    const { getByText } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    fireEvent.click(getByText('Add field'));
    fireEvent.click(getByText('Text'));
    const call = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    const added = call.fields[call.fields.length - 1];
    expect(added.name).toMatch(/^text_\d+$/);
  });
});

// ─── HtmlRenderFullJson ─────────────────────────────────────────────────────

describe('HtmlRenderFullJson export/import', () => {
  it('renders the textarea pre-populated with the block JSON', () => {
    const block = makeBlock({
      html: '<h1>{{title}}</h1>',
      fields: [{ name: 'title', type: 'text' }],
      values: { title: 'Hi' },
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    const textareas = container.querySelectorAll('textarea');
    const jsonTextarea = Array.from(textareas).find(
      (t) => (t.value || '').includes('"html-render"') && (t.value || '').includes('"version": 1'),
    );
    expect(jsonTextarea).toBeTruthy();
    expect(jsonTextarea!.value).toContain('{{title}}');
  });

  it('disables Apply when JSON is unchanged and enables it after editing', () => {
    const block = makeBlock({
      html: '<h1>{{title}}</h1>',
      fields: [{ name: 'title', type: 'text' }],
    });
    const { container, getByText } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    const applyBtn = getByText('Apply') as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    // Now edit the JSON textarea.
    const textareas = container.querySelectorAll('textarea');
    const jsonTextarea = Array.from(textareas).find(
      (t) => (t.value || '').includes('"version": 1'),
    )!;
    fireEvent.change(jsonTextarea, { target: { value: '{}' } });
    expect(applyBtn.disabled).toBe(false);
  });

  it('shows an error when applying invalid JSON', () => {
    const block = makeBlock({
      fields: [{ name: 'title', type: 'text' }],
    });
    const { container, getByText } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    const textareas = container.querySelectorAll('textarea');
    const jsonTextarea = Array.from(textareas).find(
      (t) => (t.value || '').includes('"version": 1'),
    )!;
    fireEvent.change(jsonTextarea, { target: { value: 'not json' } });
    fireEvent.click(getByText('Apply'));
    expect(container.textContent).toContain('Invalid JSON');
  });

  it('shows an error when the payload is missing html', () => {
    const block = makeBlock({
      fields: [{ name: 'title', type: 'text' }],
    });
    const { container, getByText } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    const textareas = container.querySelectorAll('textarea');
    const jsonTextarea = Array.from(textareas).find(
      (t) => (t.value || '').includes('"version": 1'),
    )!;
    fireEvent.change(jsonTextarea, { target: { value: JSON.stringify({ fields: [] }) } });
    fireEvent.click(getByText('Apply'));
    expect(container.textContent).toContain('Missing `html`');
  });

  it('shows an error when fields is not an array', () => {
    const block = makeBlock({
      fields: [{ name: 'title', type: 'text' }],
    });
    const { container, getByText } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    const textareas = container.querySelectorAll('textarea');
    const jsonTextarea = Array.from(textareas).find(
      (t) => (t.value || '').includes('"version": 1'),
    )!;
    fireEvent.change(jsonTextarea, { target: { value: JSON.stringify({ html: '<p>x</p>', fields: {} }) } });
    fireEvent.click(getByText('Apply'));
    expect(container.textContent).toContain('Missing `fields`');
  });

  it('applies a valid JSON payload', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [{ name: 'title', type: 'text' }],
    });
    const { container, getByText } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    const textareas = container.querySelectorAll('textarea');
    const jsonTextarea = Array.from(textareas).find(
      (t) => (t.value || '').includes('"version": 1'),
    )!;
    const payload = {
      html: '<p>{{x}}</p>',
      fields: [{ name: 'x', type: 'text' }],
      values: { x: 'y' },
      width: 'contained',
    };
    fireEvent.change(jsonTextarea, { target: { value: JSON.stringify(payload) } });
    fireEvent.click(getByText('Apply'));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      html: '<p>{{x}}</p>',
      width: 'contained',
    }));
  });

  it('resets the JSON textarea to the exported value when Reset is clicked', () => {
    const block = makeBlock({
      fields: [{ name: 'title', type: 'text' }],
    });
    const { container, getByText } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    const textareas = container.querySelectorAll('textarea');
    const jsonTextarea = Array.from(textareas).find(
      (t) => (t.value || '').includes('"version": 1'),
    )! as HTMLTextAreaElement;
    const original = jsonTextarea.value;
    fireEvent.change(jsonTextarea, { target: { value: '{}' } });
    expect(jsonTextarea.value).toBe('{}');
    fireEvent.click(getByText('Reset'));
    expect(jsonTextarea.value).toBe(original);
  });

  it('copies the JSON to clipboard via navigator.clipboard.writeText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const block = makeBlock({ fields: [{ name: 'x', type: 'text' }] });
    const { getByText } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    await act(async () => {
      fireEvent.click(getByText('Copy JSON'));
    });
    expect(writeText).toHaveBeenCalled();
  });

  it('falls back to a copy error when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const block = makeBlock({ fields: [{ name: 'x', type: 'text' }] });
    const { getByText, container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    await act(async () => {
      fireEvent.click(getByText('Copy JSON'));
    });
    expect(container.textContent).toContain('Clipboard write failed');
  });
});

// ─── HtmlRenderSchemaActions ───────────────────────────────────────────────

describe('HtmlRenderSchemaActions', () => {
  it('disables the Paste button when the clipboard is empty', () => {
    const block = makeBlock({ fields: [{ name: 'x', type: 'text' }] });
    const { getByText } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    expect((getByText('Paste') as HTMLButtonElement).disabled).toBe(true);
  });

  it('writes the schema to localStorage when Copy is clicked', () => {
    const block = makeBlock({
      html: '<h1>{{x}}</h1>',
      fields: [{ name: 'x', type: 'text' }],
    });
    const { getAllByText } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    // There are several Copy-style buttons; the schema one is the first
    // labeled exactly "Copy" (not "Copy JSON").
    const copyButtons = getAllByText('Copy');
    fireEvent.click(copyButtons[0]);
    expect(window.localStorage.getItem('sd-html-render-schema-clipboard')).toBeTruthy();
  });

  it('pastes a clipboard schema after confirming the dialog', () => {
    const onUpdate = vi.fn();
    // Pre-populate the clipboard
    window.localStorage.setItem(
      'sd-html-render-schema-clipboard',
      JSON.stringify({
        version: 1,
        copiedAt: Date.now(),
        sourceLabel: 'src',
        html: '<p>{{y}}</p>',
        fields: [{ name: 'y', type: 'text' }],
      }),
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const block = makeBlock({ fields: [{ name: 'x', type: 'text' }] });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    // Find Paste button by its title attribute (which always starts with "Paste"
    // or "No schema in clipboard" — the populated case has the former).
    const pasteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => (b.getAttribute('title') || '').startsWith('Paste'),
    )!;
    fireEvent.click(pasteBtn);
    expect(confirmSpy).toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      html: '<p>{{y}}</p>',
      fields: expect.arrayContaining([expect.objectContaining({ name: 'y' })]),
    }));
  });

  it('does not paste when the confirm dialog is cancelled', () => {
    const onUpdate = vi.fn();
    window.localStorage.setItem(
      'sd-html-render-schema-clipboard',
      JSON.stringify({
        version: 1,
        copiedAt: Date.now(),
        html: '<p>x</p>',
        fields: [{ name: 'y', type: 'text' }],
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const block = makeBlock({ fields: [{ name: 'x', type: 'text' }] });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    const pasteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => (b.getAttribute('title') || '').startsWith('Paste'),
    )!;
    fireEvent.click(pasteBtn);
    // No html replacement should have happened.
    const replaced = onUpdate.mock.calls.find((c) => c[0]?.html === '<p>x</p>');
    expect(replaced).toBeFalsy();
  });

  it('triggers a download when Export is clicked', () => {
    const block = makeBlock({
      html: '<h1>{{x}}</h1>',
      fields: [{ name: 'x', type: 'text' }],
    });
    // jsdom doesn't actually download — but we can intercept the anchor click.
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:mocked');
    URL.revokeObjectURL = vi.fn();
    const { getByText } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    fireEvent.click(getByText('Export'));
    expect(clickSpy).toHaveBeenCalled();
  });
});

// ─── HtmlRenderArrayEditor — array repeaters ───────────────────────────────

describe('HtmlRenderArrayEditor', () => {
  it('renders the empty state when there are no items', () => {
    const block = makeBlock({
      fields: [
        {
          name: 'items',
          type: 'array',
          label: 'Items',
          itemFields: [{ name: 'title', type: 'text' }],
        },
      ],
      values: { items: [] },
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    expect(container.textContent).toContain('No items yet');
  });

  it('adds a new item with sub-field defaults when "Add item" is clicked', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [
        {
          name: 'items',
          type: 'array',
          label: 'Items',
          itemFields: [{ name: 'title', type: 'text', default: 'New' }],
        },
      ],
      values: { items: [] },
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    // There can be multiple "Add item" buttons (one in the values-form array
    // editor, plus matches from sub-field UI). Pick the first.
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => (b.textContent || '').includes('Add item'),
    )!;
    fireEvent.click(addBtn);
    expect(onUpdate).toHaveBeenCalledWith({
      values: { items: [{ title: 'New' }] },
    });
  });

  it('removes an item when its delete button is clicked', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [
        {
          name: 'items',
          type: 'array',
          label: 'Items',
          itemFields: [{ name: 'title', type: 'text' }],
        },
      ],
      values: { items: [{ title: 'one' }, { title: 'two' }] },
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    const removeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('title') === 'Remove',
    )!;
    fireEvent.click(removeBtn);
    expect(onUpdate).toHaveBeenCalledWith({
      values: { items: [{ title: 'two' }] },
    });
  });
});

// ─── HtmlRenderSubFieldsEditor ─────────────────────────────────────────────

describe('HtmlRenderSubFieldsEditor', () => {
  it('shows the empty state when an array/group has no sub-fields', () => {
    const block = makeBlock({
      fields: [{ name: 'items', type: 'array', itemFields: [] }],
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    expect(container.textContent).toContain('No sub-fields yet');
  });

  it('adds a sub-field with default name when "Add sub-field" is clicked', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [{ name: 'items', type: 'array', itemFields: [] }],
    });
    const { getByText } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    fireEvent.click(getByText('+ Add sub-field'));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({
          itemFields: expect.arrayContaining([
            expect.objectContaining({ name: 'newField', type: 'text' }),
          ]),
        }),
      ]),
    }));
  });

  it('removes a sub-field when its trash button is clicked', () => {
    const onUpdate = vi.fn();
    const block = makeBlock({
      fields: [
        {
          name: 'items',
          type: 'array',
          itemFields: [{ name: 'a', type: 'text' }, { name: 'b', type: 'text' }],
        },
      ],
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={onUpdate} />);
    const removeBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.getAttribute('title') === 'Remove sub-field',
    );
    expect(removeBtns.length).toBe(2);
    fireEvent.click(removeBtns[0]);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({
          itemFields: [{ name: 'b', type: 'text' }],
        }),
      ]),
    }));
  });
});

// ─── HtmlRenderTabbedForm ──────────────────────────────────────────────────

describe('HtmlRenderTabbedForm', () => {
  it('renders flat (no tab strip) when there is only one tab', () => {
    const block = makeBlock({
      fields: [
        { name: 'a', type: 'text', label: 'A' },
        { name: 'b', type: 'text', label: 'B' },
      ],
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    expect(container.textContent).toContain('A');
    expect(container.textContent).toContain('B');
    // No tab-strip rendering — General label wouldn't appear without tabs
    // (single-tab → flat).
    expect(container.textContent).not.toContain('General');
  });

  it('renders tab strip when at least one tab field is present', () => {
    const block = makeBlock({
      fields: [
        { name: 'a', type: 'text', label: 'A' },
        { name: 'tab2', type: 'tab', label: 'Settings' },
        { name: 'b', type: 'text', label: 'B' },
      ],
    });
    const { container, getByText } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    expect(container.textContent).toContain('General');
    expect(container.textContent).toContain('Settings');
    // Switching to "Settings" tab should reveal field B.
    fireEvent.click(getByText('Settings'));
    expect(container.querySelector('[data-testid="field-B"]')).toBeTruthy();
  });
});

// ─── HtmlRenderPostPicker ──────────────────────────────────────────────────

describe('HtmlRenderPostPicker', () => {
  it('shows "No site context" when siteId is absent', () => {
    const block = makeBlock({
      fields: [{ name: 'p', type: 'post', label: 'P' }],
    });
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} />);
    expect(container.textContent).toContain('No site context');
  });

  it('shows a Loading state, then renders post options after fetch resolves', async () => {
    const block = makeBlock({
      fields: [{ name: 'p', type: 'post', label: 'P' }],
    });
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: [{ id: 1, title: 'Post A', slug: 'a', postType: 'blog' }],
      }),
    }) as any;
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} siteId={9} />);
    expect(container.textContent).toContain('Loading posts');
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('Post A');
  });

  it('shows the API error message when fetch returns an error envelope', async () => {
    const block = makeBlock({
      fields: [{ name: 'p', type: 'post', label: 'P' }],
    });
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: false, error: 'boom' }),
    }) as any;
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} siteId={9} />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('boom');
  });
});

// ─── HtmlRenderUrlAutocomplete ─────────────────────────────────────────────

describe('HtmlRenderUrlAutocomplete', () => {
  it('renders a URL text input', () => {
    const block = makeBlock({
      fields: [{ name: 'href', type: 'url', label: 'Href' }],
    });
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, data: { posts: [], decks: [], bookings: [], proposals: [] } }),
    }) as any;
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} siteId={9} />);
    const input = container.querySelector('input[placeholder*="pick a link"]') as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('shows suggestion items when groups load and user focuses', async () => {
    const block = makeBlock({
      fields: [{ name: 'href', type: 'url', label: 'Href' }],
    });
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          posts: [{ id: 1, label: 'About', url: '/about' }],
          decks: [],
          bookings: [],
          proposals: [],
        },
      }),
    }) as any;
    const { container } = render(<HtmlRenderEditor block={block} onUpdate={vi.fn()} siteId={9} />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    const input = container.querySelector('input[placeholder*="pick a link"]') as HTMLInputElement;
    fireEvent.focus(input);
    expect(container.textContent).toContain('About');
  });
});

// ─── ImagePickerModal ──────────────────────────────────────────────────────

describe('ImagePickerModal', () => {
  it('renders the dialog with the field name and a MediaPicker', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container, getByText } = render(
      <ImagePickerModal
        target={{ blockId: 'b1', field: 'hero', currentValue: 'https://cdn/x.png' }}
        mediaApi="/api/portal/media"
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    expect(getByText('Replace image')).toBeTruthy();
    expect(container.querySelector('[data-testid="media-picker"]')).toBeTruthy();
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <ImagePickerModal
        target={{ blockId: 'b1', field: 'hero', currentValue: '' }}
        mediaApi="/api/portal/media"
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close when the inner card is clicked', () => {
    const onClose = vi.fn();
    const { getByText } = render(
      <ImagePickerModal
        target={{ blockId: 'b1', field: 'hero', currentValue: '' }}
        mediaApi="/api/portal/media"
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(getByText('Replace image'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the Close button is clicked', () => {
    const onClose = vi.fn();
    const { getByText } = render(
      <ImagePickerModal
        target={{ blockId: 'b1', field: 'hero', currentValue: '' }}
        mediaApi="/api/portal/media"
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('invokes onSelect when the MediaPicker emits a new URL', () => {
    const onSelect = vi.fn();
    const { getByTestId } = render(
      <ImagePickerModal
        target={{ blockId: 'b1', field: 'hero', currentValue: '' }}
        mediaApi="/api/portal/media"
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(getByTestId('media-pick'));
    expect(onSelect).toHaveBeenCalledWith('https://cdn.example/picked.png');
  });
});
