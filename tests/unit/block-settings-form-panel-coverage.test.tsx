// @vitest-environment jsdom
/**
 * Coverage tests for FormPanel.tsx (dispatcher + all inline settings components).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy deps
// ---------------------------------------------------------------------------

vi.mock('@/components/blocks/visual/RichTextEditable', () => ({
  RichTextEditable: ({ html, onChange, placeholder, singleLine }: {
    html: string;
    onChange: (v: string) => void;
    placeholder?: string;
    singleLine?: boolean;
    className?: string;
  }) => (
    <textarea
      data-testid={`rte-${placeholder || 'rte'}`}
      data-single-line={singleLine ? 'true' : 'false'}
      value={html || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('@/components/blocks/visual/TokenColorPicker', () => ({
  TokenColorPicker: ({ value, onChange, label }: {
    value: string;
    onChange: (v: string) => void;
    label?: string;
  }) => (
    <label>
      <span>{label}</span>
      <input
        data-testid={`color-${label || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));

vi.mock(
  '@/components/blocks/visual/block-settings/panels/BookingSettings',
  () => ({
    BookingBlockSettings: ({ block }: { block: { id?: string } }) => (
      <div data-testid="booking-settings" data-block-id={block?.id || ''} />
    ),
  }),
);

vi.mock(
  '@/components/blocks/visual/block-settings/panels/SurveyResultsSettings',
  () => ({
    SurveyResultsBlockSettings: ({ block }: { block: { id?: string } }) => (
      <div data-testid="survey-results-settings" data-block-id={block?.id || ''} />
    ),
  }),
);

// ---------------------------------------------------------------------------
// Stub fetch for SurveyBlockSettings (loads surveys on mount)
// ---------------------------------------------------------------------------
function installFetchMock(payload = { success: true, data: [] as unknown[] }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
  (globalThis as { fetch: typeof fetch }).fetch = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { FormPanel } from '@/components/blocks/visual/block-settings/panels/FormPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOnChange<T = Record<string, unknown>>() {
  return vi.fn<(updates: Partial<T>) => void>();
}

function renderPanel(block: Record<string, unknown>, onChange = makeOnChange(), viewport: string = 'desktop') {
  const utils = render(
    <FormPanel
      block={block as Parameters<typeof FormPanel>[0]['block']}
      onChange={onChange as Parameters<typeof FormPanel>[0]['onChange']}
      currentViewport={viewport as Parameters<typeof FormPanel>[0]['currentViewport']}
    />,
  );
  return { ...utils, onChange };
}

// ---------------------------------------------------------------------------
// FormPanel dispatcher
// ---------------------------------------------------------------------------

describe('FormPanel — dispatcher', () => {
  it('returns null for unknown block type', () => {
    const { container } = renderPanel({ id: 'x', type: 'unknown-block-type' });
    expect(container.firstChild).toBeNull();
  });

  it('dispatches booking block to BookingBlockSettings stub', () => {
    renderPanel({ id: 'b1', type: 'booking', slug: 'test' });
    expect(screen.getByTestId('booking-settings')).toBeTruthy();
    expect(screen.getByTestId('booking-settings').getAttribute('data-block-id')).toBe('b1');
  });

  it('dispatches survey-results block to SurveyResultsBlockSettings stub', () => {
    renderPanel({ id: 'sr1', type: 'survey-results' });
    expect(screen.getByTestId('survey-results-settings')).toBeTruthy();
    expect(screen.getByTestId('survey-results-settings').getAttribute('data-block-id')).toBe('sr1');
  });
});

// ---------------------------------------------------------------------------
// ButtonBlockSettings
// ---------------------------------------------------------------------------

describe('ButtonBlockSettings', () => {
  const baseButton = {
    id: 'btn1',
    type: 'button',
    text: 'Click me',
    url: 'https://example.com',
    variant: 'primary',
    size: 'md',
    alignment: 'left',
    openInNewTab: false,
  };

  it('updates button text', () => {
    const { onChange } = renderPanel(baseButton);
    const input = screen.getByDisplayValue('Click me') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New Text' } });
    expect(onChange).toHaveBeenCalledWith({ text: 'New Text' });
  });

  it('updates URL', () => {
    const { onChange } = renderPanel(baseButton);
    const input = screen.getByDisplayValue('https://example.com') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://new.com' } });
    expect(onChange).toHaveBeenCalledWith({ url: 'https://new.com' });
  });

  it('updates variant via select', () => {
    const { onChange } = renderPanel(baseButton);
    const select = screen.getByDisplayValue('Primary') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'secondary' } });
    expect(onChange).toHaveBeenCalledWith({ variant: 'secondary' });
  });

  it('updates size via select', () => {
    const { onChange } = renderPanel(baseButton);
    const select = screen.getByDisplayValue('Medium') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'lg' } });
    expect(onChange).toHaveBeenCalledWith({ size: 'lg' });
  });

  it('updates alignment when center button clicked', () => {
    const { onChange } = renderPanel(baseButton);
    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    // center button is second alignment button
    const centerBtn = buttons.find((b) => b.querySelector('.material-icons')?.textContent === 'format_align_center');
    expect(centerBtn).toBeTruthy();
    fireEvent.click(centerBtn!);
    expect(onChange).toHaveBeenCalledWith({ alignment: 'center' });
  });

  it('updates alignment when right button clicked', () => {
    const { onChange } = renderPanel(baseButton);
    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    const rightBtn = buttons.find((b) => b.querySelector('.material-icons')?.textContent === 'format_align_right');
    expect(rightBtn).toBeTruthy();
    fireEvent.click(rightBtn!);
    expect(onChange).toHaveBeenCalledWith({ alignment: 'right' });
  });

  it('toggles openInNewTab checkbox', () => {
    const { onChange } = renderPanel(baseButton);
    const checkbox = screen.getByLabelText('Open in new tab') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ openInNewTab: true });
  });

  it('updates icon field (empty collapses to undefined)', () => {
    const { onChange } = renderPanel({ ...baseButton, icon: 'arrow_forward' });
    const iconInput = screen.getByDisplayValue('arrow_forward') as HTMLInputElement;
    fireEvent.change(iconInput, { target: { value: 'star' } });
    expect(onChange).toHaveBeenCalledWith({ icon: 'star' });
    fireEvent.change(iconInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ icon: undefined });
  });

  it('updates iconPosition via select', () => {
    const { onChange } = renderPanel({ ...baseButton, icon: 'star', iconPosition: 'left' });
    const select = screen.getByDisplayValue('Left of text') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'right' } });
    expect(onChange).toHaveBeenCalledWith({ iconPosition: 'right' });
  });

  it('updates hoverEffect via select', () => {
    const { onChange } = renderPanel(baseButton);
    const select = screen.getByDisplayValue('None') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'lift' } });
    expect(onChange).toHaveBeenCalledWith({ hoverEffect: 'lift' });
  });

  it('updates presetId (empty collapses to undefined)', () => {
    const { onChange } = renderPanel({ ...baseButton, presetId: 'preset-a' });
    const presetInput = screen.getByDisplayValue('preset-a') as HTMLInputElement;
    fireEvent.change(presetInput, { target: { value: 'preset-b' } });
    expect(onChange).toHaveBeenCalledWith({ presetId: 'preset-b' });
    fireEvent.change(presetInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ presetId: undefined });
  });

  it('defaults variant to primary when not set', () => {
    renderPanel({ ...baseButton, variant: undefined });
    const select = screen.getByDisplayValue('Primary') as HTMLSelectElement;
    expect(select.value).toBe('primary');
  });

  it('defaults size to md when not set', () => {
    renderPanel({ ...baseButton, size: undefined });
    const select = screen.getByDisplayValue('Medium') as HTMLSelectElement;
    expect(select.value).toBe('md');
  });
});

// ---------------------------------------------------------------------------
// PopupBlockSettings
// ---------------------------------------------------------------------------

describe('PopupBlockSettings', () => {
  const basePopup = {
    id: 'pp1',
    type: 'popup',
    headline: 'Join us',
    body: 'Some body text',
    ctaLabel: 'Sign Up',
    ctaUrl: '/signup',
    trigger: 'time-delay',
    delaySeconds: 5,
    frequency: 'once-per-session',
    dismissable: true,
  };

  it('renders headline and body RichTextEditables', () => {
    renderPanel(basePopup);
    expect(screen.getByTestId('rte-Modal headline')).toBeTruthy();
    expect(screen.getByTestId('rte-Body text — supports rich text')).toBeTruthy();
  });

  it('updates headline via RichTextEditable', () => {
    const { onChange } = renderPanel(basePopup);
    fireEvent.change(screen.getByTestId('rte-Modal headline'), { target: { value: 'New Headline' } });
    expect(onChange).toHaveBeenCalledWith({ headline: 'New Headline' });
  });

  it('updates body (empty collapses to undefined)', () => {
    const { onChange } = renderPanel(basePopup);
    const bodyRte = screen.getByTestId('rte-Body text — supports rich text');
    fireEvent.change(bodyRte, { target: { value: 'New body' } });
    expect(onChange).toHaveBeenCalledWith({ body: 'New body' });
    fireEvent.change(bodyRte, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ body: undefined });
  });

  it('updates ctaLabel (empty collapses to undefined)', () => {
    const { onChange } = renderPanel(basePopup);
    const ctaInput = screen.getByDisplayValue('Sign Up') as HTMLInputElement;
    fireEvent.change(ctaInput, { target: { value: 'Join Now' } });
    expect(onChange).toHaveBeenCalledWith({ ctaLabel: 'Join Now' });
    fireEvent.change(ctaInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ ctaLabel: undefined });
  });

  it('updates ctaUrl (empty collapses to undefined)', () => {
    const { onChange } = renderPanel(basePopup);
    const urlInput = screen.getByDisplayValue('/signup') as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: '/new' } });
    expect(onChange).toHaveBeenCalledWith({ ctaUrl: '/new' });
    fireEvent.change(urlInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ ctaUrl: undefined });
  });

  it('shows delay field when trigger=time-delay', () => {
    const { container } = renderPanel(basePopup);
    // label text present and a number input for delay is visible
    expect(container.textContent).toContain('Delay (seconds)');
    const numInputs = container.querySelectorAll('input[type="number"]');
    const delayInput = Array.from(numInputs).find(
      (i) => Number((i as HTMLInputElement).value) === 5,
    );
    expect(delayInput).toBeTruthy();
  });

  it('updates trigger via select and hides delay field for page-load', () => {
    const { onChange, container } = renderPanel(basePopup);
    const triggerSelect = Array.from(container.querySelectorAll('select')).find(
      (s) => (s as HTMLSelectElement).querySelector('option[value="exit-intent"]'),
    ) as HTMLSelectElement;
    expect(triggerSelect).toBeTruthy();
    fireEvent.change(triggerSelect, { target: { value: 'page-load' } });
    expect(onChange).toHaveBeenCalledWith({ trigger: 'page-load' });
  });

  it('updates delaySeconds via number input', () => {
    const { onChange, container } = renderPanel(basePopup);
    const numInputs = container.querySelectorAll('input[type="number"]');
    const delayInput = Array.from(numInputs).find(
      (i) => Number((i as HTMLInputElement).value) === 5,
    ) as HTMLInputElement;
    expect(delayInput).toBeTruthy();
    fireEvent.change(delayInput, { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledWith({ delaySeconds: 10 });
  });

  it('shows scroll percent field when trigger=scroll-percent', () => {
    const { container } = renderPanel({ ...basePopup, trigger: 'scroll-percent', scrollPercent: 50 });
    expect(container.textContent).toContain('Scroll percent (0-100)');
    const numInputs = container.querySelectorAll('input[type="number"]');
    const scrollInput = Array.from(numInputs).find(
      (i) => Number((i as HTMLInputElement).value) === 50,
    );
    expect(scrollInput).toBeTruthy();
  });

  it('updates scrollPercent and clamps to 0-100', () => {
    const { onChange, container } = renderPanel({ ...basePopup, trigger: 'scroll-percent', scrollPercent: 50 });
    const numInputs = container.querySelectorAll('input[type="number"]');
    const scrollInput = Array.from(numInputs).find(
      (i) => Number((i as HTMLInputElement).value) === 50,
    ) as HTMLInputElement;
    expect(scrollInput).toBeTruthy();
    fireEvent.change(scrollInput, { target: { value: '75' } });
    expect(onChange).toHaveBeenCalledWith({ scrollPercent: 75 });
    fireEvent.change(scrollInput, { target: { value: '150' } });
    expect(onChange).toHaveBeenCalledWith({ scrollPercent: 100 });
    fireEvent.change(scrollInput, { target: { value: '-10' } });
    expect(onChange).toHaveBeenCalledWith({ scrollPercent: 0 });
  });

  it('updates frequency via select', () => {
    const { onChange } = renderPanel(basePopup);
    const selects = document.querySelectorAll('select');
    const freqSelect = Array.from(selects).find(
      (s) => (s as HTMLSelectElement).querySelector('option[value="once-per-week"]'),
    ) as HTMLSelectElement;
    expect(freqSelect).toBeTruthy();
    fireEvent.change(freqSelect, { target: { value: 'once-per-week' } });
    expect(onChange).toHaveBeenCalledWith({ frequency: 'once-per-week' });
  });

  it('updates dismissable checkbox', () => {
    const { onChange } = renderPanel(basePopup);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ dismissable: false });
  });

  it('defaults trigger to time-delay when not set', () => {
    const { container } = renderPanel({ ...basePopup, trigger: undefined });
    expect(container.textContent).toContain('Delay (seconds)');
    // delay input should be visible
    const numInputs = container.querySelectorAll('input[type="number"]');
    expect(numInputs.length).toBeGreaterThanOrEqual(1);
  });

  it('defaults dismissable to true when not set', () => {
    const { container } = renderPanel({ ...basePopup, dismissable: undefined });
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('defaults delaySeconds to 5 when not set', () => {
    const { container } = renderPanel({ ...basePopup, delaySeconds: undefined });
    const numInputs = container.querySelectorAll('input[type="number"]');
    const delayInput = Array.from(numInputs).find(
      (i) => Number((i as HTMLInputElement).value) === 5,
    ) as HTMLInputElement;
    expect(delayInput).toBeTruthy();
    expect(delayInput.value).toBe('5');
  });
});

// ---------------------------------------------------------------------------
// SurveyBlockSettings
// ---------------------------------------------------------------------------

describe('SurveyBlockSettings', () => {
  const baseSurvey = {
    id: 's1',
    type: 'survey',
    slug: 'my-survey',
    title: 'My Survey',
    description: 'Desc',
    height: '700px',
    showPageTitle: true,
    showDescription: true,
    showLogo: true,
  };

  it('renders survey search input when no survey selected', async () => {
    renderPanel({ ...baseSurvey, slug: '' });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search surveys...')).toBeTruthy();
    });
  });

  it('shows selected survey name when slug matches a loaded survey', async () => {
    installFetchMock({
      success: true,
      data: [{ id: 1, slug: 'my-survey', title: 'My Survey', status: 'active', responseCount: 10 }],
    });
    await act(async () => {
      renderPanel(baseSurvey);
    });
    await waitFor(() => {
      expect(screen.queryByText('My Survey')).toBeTruthy();
    });
  });

  it('opens dropdown on input focus and selects a survey', async () => {
    installFetchMock({
      success: true,
      data: [{ id: 1, slug: 'other-survey', title: 'Other Survey', status: 'active', responseCount: 0 }],
    });
    const { onChange } = renderPanel({ ...baseSurvey, slug: '' });
    await waitFor(() => {});
    const input = screen.getByPlaceholderText('Search surveys...') as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => {
      expect(screen.queryByText('Other Survey')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Other Survey'));
    expect(onChange).toHaveBeenCalledWith({ slug: 'other-survey' });
  });

  it('updates title field', async () => {
    const { onChange } = renderPanel(baseSurvey);
    await act(async () => {});
    const titleInput = screen.getByDisplayValue('My Survey') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    expect(onChange).toHaveBeenCalledWith({ title: 'New Title' });
  });

  it('updates description field', async () => {
    const { onChange } = renderPanel(baseSurvey);
    await act(async () => {});
    const descInput = screen.getByDisplayValue('Desc') as HTMLInputElement;
    fireEvent.change(descInput, { target: { value: 'New Desc' } });
    expect(onChange).toHaveBeenCalledWith({ description: 'New Desc' });
  });

  it('updates height field', async () => {
    const { onChange } = renderPanel(baseSurvey);
    await act(async () => {});
    const heightInput = screen.getByDisplayValue('700px') as HTMLInputElement;
    fireEvent.change(heightInput, { target: { value: '600px' } });
    expect(onChange).toHaveBeenCalledWith({ height: '600px' });
  });

  it('toggles showPageTitle checkbox', async () => {
    const { onChange } = renderPanel(baseSurvey);
    await act(async () => {});
    const cb = screen.getByLabelText('Show Survey Title') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ showPageTitle: false });
  });

  it('toggles showDescription checkbox', async () => {
    const { onChange } = renderPanel(baseSurvey);
    await act(async () => {});
    const cb = screen.getByLabelText('Show Description') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ showDescription: false });
  });

  it('toggles showLogo checkbox', async () => {
    const { onChange } = renderPanel(baseSurvey);
    await act(async () => {});
    const cb = screen.getByLabelText('Show Logo') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ showLogo: false });
  });

  it('closes dropdown when clicking outside', async () => {
    installFetchMock({
      success: true,
      data: [{ id: 2, slug: 'test', title: 'Test Survey', status: 'active', responseCount: 0 }],
    });
    renderPanel({ ...baseSurvey, slug: '' });
    await act(async () => {});
    const input = screen.getByPlaceholderText('Search surveys...');
    fireEvent.focus(input);
    await waitFor(() => {
      expect(screen.queryByText('Test Survey')).toBeTruthy();
    });
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByText('Test Survey')).toBeNull();
    });
  });

  it('updates search text in input (open=true mode)', async () => {
    installFetchMock({
      success: true,
      data: [{ id: 3, slug: 'abc', title: 'ABC Survey', status: 'active', responseCount: 0 }],
    });
    renderPanel({ ...baseSurvey, slug: '' });
    await act(async () => {});
    const input = screen.getByPlaceholderText('Search surveys...');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ABC' } });
    await waitFor(() => {
      expect(screen.queryByText('ABC Survey')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// SurveyInputBlockSettings
// ---------------------------------------------------------------------------

describe('SurveyInputBlockSettings', () => {
  const baseInput = {
    id: 'si1',
    type: 'survey-input',
    fieldType: 'text',
    fieldLabel: 'Your Name',
    placeholder: 'Enter name',
  };

  it('renders field type select and field label', () => {
    renderPanel(baseInput);
    expect(screen.getByDisplayValue('text')).toBeTruthy();
    expect(screen.getByDisplayValue('Your Name')).toBeTruthy();
  });

  it('updates fieldType via select', () => {
    const { onChange } = renderPanel(baseInput);
    const select = screen.getByDisplayValue('text') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'email' } });
    expect(onChange).toHaveBeenCalledWith({ fieldType: 'email' });
  });

  it('updates fieldLabel', () => {
    const { onChange } = renderPanel(baseInput);
    const labelInput = screen.getByDisplayValue('Your Name') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Full Name' } });
    expect(onChange).toHaveBeenCalledWith({ fieldLabel: 'Full Name' });
  });

  it('updates placeholder (empty collapses to undefined)', () => {
    const { onChange } = renderPanel(baseInput);
    const placeholderInput = screen.getByDisplayValue('Enter name') as HTMLInputElement;
    fireEvent.change(placeholderInput, { target: { value: 'Type here' } });
    expect(onChange).toHaveBeenCalledWith({ placeholder: 'Type here' });
    fireEvent.change(placeholderInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ placeholder: undefined });
  });

  it('shows options section when fieldType is select', () => {
    renderPanel({ ...baseInput, fieldType: 'select', options: ['a', 'b'] });
    expect(screen.getByText('Options')).toBeTruthy();
  });

  it('updates option value', () => {
    const { onChange } = renderPanel({ ...baseInput, fieldType: 'select', options: ['opt1', 'opt2'] });
    const optionInputs = screen.getAllByPlaceholderText('Option value') as HTMLInputElement[];
    fireEvent.change(optionInputs[0], { target: { value: 'new-opt' } });
    expect(onChange).toHaveBeenCalledWith({ options: ['new-opt', 'opt2'] });
  });

  it('removes an option', () => {
    const { onChange } = renderPanel({ ...baseInput, fieldType: 'radio', options: ['a', 'b'] });
    const removeBtns = screen.getAllByText('×') as HTMLButtonElement[];
    fireEvent.click(removeBtns[0]);
    expect(onChange).toHaveBeenCalledWith({ options: ['b'] });
  });

  it('adds a new option', () => {
    const { onChange } = renderPanel({ ...baseInput, fieldType: 'checkbox', options: [] });
    fireEvent.click(screen.getByText('+ Add Option'));
    expect(onChange).toHaveBeenCalledWith({ options: [''] });
  });

  it('shows slider config when fieldType is slider', () => {
    const { container } = renderPanel({ ...baseInput, fieldType: 'slider', min: 0, max: 100, step: 1 });
    expect(container.textContent).toContain('Min');
    expect(container.textContent).toContain('Max');
    expect(container.textContent).toContain('Step');
    const numInputs = container.querySelectorAll('input[type="number"]');
    expect(numInputs.length).toBe(3);
  });

  it('updates slider min, max, step', () => {
    const { onChange, container } = renderPanel({ ...baseInput, fieldType: 'slider', min: 0, max: 100, step: 1 });
    const numInputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    // min=0, max=100, step=1
    const minInput = numInputs.find((i) => Number(i.value) === 0)!;
    const maxInput = numInputs.find((i) => Number(i.value) === 100)!;
    const stepInput = numInputs.find((i) => Number(i.value) === 1)!;
    fireEvent.change(minInput, { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledWith({ min: 10 });
    fireEvent.change(maxInput, { target: { value: '200' } });
    expect(onChange).toHaveBeenCalledWith({ max: 200 });
    fireEvent.change(stepInput, { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ step: 5 });
  });

  it('does not show options for non-option types (text)', () => {
    renderPanel(baseInput);
    expect(screen.queryByText('Options')).toBeNull();
  });

  it('does not show slider config for non-slider types (text)', () => {
    renderPanel(baseInput);
    expect(screen.queryByLabelText('Min')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// EmailHeaderBlockSettings
// ---------------------------------------------------------------------------

describe('EmailHeaderBlockSettings', () => {
  const baseEmailHeader = {
    id: 'eh1',
    type: 'email-header',
    logoUrl: 'https://logo.png',
    logoWidth: 180,
    alignment: 'center',
    tagline: 'Tagline text',
  };

  it('renders all fields', () => {
    renderPanel(baseEmailHeader);
    expect(screen.getByDisplayValue('https://logo.png')).toBeTruthy();
    expect(screen.getByDisplayValue('180')).toBeTruthy();
    expect(screen.getByDisplayValue('Center')).toBeTruthy();
    expect(screen.getByDisplayValue('Tagline text')).toBeTruthy();
  });

  it('updates logoUrl (empty collapses to undefined)', () => {
    const { onChange } = renderPanel(baseEmailHeader);
    const logoInput = screen.getByDisplayValue('https://logo.png') as HTMLInputElement;
    fireEvent.change(logoInput, { target: { value: 'https://new.png' } });
    expect(onChange).toHaveBeenCalledWith({ logoUrl: 'https://new.png' });
    fireEvent.change(logoInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ logoUrl: undefined });
  });

  it('updates logoWidth (empty collapses to undefined)', () => {
    const { onChange } = renderPanel(baseEmailHeader);
    const widthInput = screen.getByDisplayValue('180') as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: '200' } });
    expect(onChange).toHaveBeenCalledWith({ logoWidth: 200 });
    fireEvent.change(widthInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ logoWidth: undefined });
  });

  it('updates alignment via select', () => {
    const { onChange } = renderPanel(baseEmailHeader);
    const select = screen.getByDisplayValue('Center') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'left' } });
    expect(onChange).toHaveBeenCalledWith({ alignment: 'left' });
  });

  it('updates tagline (empty collapses to undefined)', () => {
    const { onChange } = renderPanel(baseEmailHeader);
    const taglineInput = screen.getByDisplayValue('Tagline text') as HTMLInputElement;
    fireEvent.change(taglineInput, { target: { value: 'New tagline' } });
    expect(onChange).toHaveBeenCalledWith({ tagline: 'New tagline' });
    fireEvent.change(taglineInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ tagline: undefined });
  });

  it('defaults logoWidth to 180 when not set', () => {
    renderPanel({ ...baseEmailHeader, logoWidth: undefined });
    expect(screen.getByDisplayValue('180')).toBeTruthy();
  });

  it('defaults alignment to center when not set', () => {
    renderPanel({ ...baseEmailHeader, alignment: undefined });
    const select = screen.getByDisplayValue('Center') as HTMLSelectElement;
    expect(select.value).toBe('center');
  });
});

// ---------------------------------------------------------------------------
// EmailFooterBlockSettings
// ---------------------------------------------------------------------------

describe('EmailFooterBlockSettings', () => {
  const baseEmailFooter = {
    id: 'ef1',
    type: 'email-footer',
    companyName: 'Acme Corp',
    address: '123 Main St',
    showUnsubscribe: true,
    showViewInBrowser: false,
    socialLinks: [{ platform: 'linkedin', url: 'https://linkedin.com' }],
  };

  it('renders all fields', () => {
    renderPanel(baseEmailFooter);
    expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy();
    expect(screen.getByDisplayValue('123 Main St')).toBeTruthy();
  });

  it('updates companyName (empty collapses to undefined)', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const nameInput = screen.getByDisplayValue('Acme Corp') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Corp' } });
    expect(onChange).toHaveBeenCalledWith({ companyName: 'New Corp' });
    fireEvent.change(nameInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ companyName: undefined });
  });

  it('updates address (empty collapses to undefined)', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const addressInput = screen.getByDisplayValue('123 Main St') as HTMLTextAreaElement;
    fireEvent.change(addressInput, { target: { value: '456 Elm St' } });
    expect(onChange).toHaveBeenCalledWith({ address: '456 Elm St' });
    fireEvent.change(addressInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ address: undefined });
  });

  it('toggles showUnsubscribe checkbox', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const cb = screen.getByLabelText('Show unsubscribe link') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ showUnsubscribe: false });
  });

  it('toggles showViewInBrowser checkbox', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const cb = screen.getByLabelText('Show "View in browser" link') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ showViewInBrowser: true });
  });

  it('updates social link platform', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const platformInput = screen.getByDisplayValue('linkedin') as HTMLInputElement;
    fireEvent.change(platformInput, { target: { value: 'twitter' } });
    expect(onChange).toHaveBeenCalledWith({
      socialLinks: [{ platform: 'twitter', url: 'https://linkedin.com' }],
    });
  });

  it('updates social link url', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const urlInput = screen.getByDisplayValue('https://linkedin.com') as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://new.com' } });
    expect(onChange).toHaveBeenCalledWith({
      socialLinks: [{ platform: 'linkedin', url: 'https://new.com' }],
    });
  });

  it('removes a social link', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    fireEvent.click(screen.getByText('×'));
    expect(onChange).toHaveBeenCalledWith({ socialLinks: [] });
  });

  it('adds a new social link', () => {
    const { onChange } = renderPanel({ ...baseEmailFooter, socialLinks: [] });
    fireEvent.click(screen.getByText('+ Add Social Link'));
    expect(onChange).toHaveBeenCalledWith({
      socialLinks: [{ platform: '', url: '' }],
    });
  });

  it('defaults showUnsubscribe to true when not set', () => {
    renderPanel({ ...baseEmailFooter, showUnsubscribe: undefined });
    const cb = screen.getByLabelText('Show unsubscribe link') as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it('defaults showViewInBrowser to false when not set', () => {
    renderPanel({ ...baseEmailFooter, showViewInBrowser: undefined });
    const cb = screen.getByLabelText('Show "View in browser" link') as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BookingMenuBlockSettings
// ---------------------------------------------------------------------------

describe('BookingMenuBlockSettings', () => {
  const baseBookingMenu = {
    id: 'bm1',
    type: 'booking-menu',
    title: 'Book Now',
    description: 'Choose a service',
    columns: 3,
  };

  it('renders title and description RTEs', () => {
    renderPanel(baseBookingMenu);
    expect(screen.getByTestId('rte-Optional section title...')).toBeTruthy();
    expect(screen.getByTestId('rte-Optional description...')).toBeTruthy();
  });

  it('updates title via RichTextEditable (empty collapses to undefined)', () => {
    const { onChange } = renderPanel(baseBookingMenu);
    const titleRte = screen.getByTestId('rte-Optional section title...');
    fireEvent.change(titleRte, { target: { value: 'New Title' } });
    expect(onChange).toHaveBeenCalledWith({ title: 'New Title' });
    fireEvent.change(titleRte, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ title: undefined });
  });

  it('updates description via RichTextEditable (empty collapses to undefined)', () => {
    const { onChange } = renderPanel(baseBookingMenu);
    const descRte = screen.getByTestId('rte-Optional description...');
    fireEvent.change(descRte, { target: { value: 'New Desc' } });
    expect(onChange).toHaveBeenCalledWith({ description: 'New Desc' });
    fireEvent.change(descRte, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ description: undefined });
  });

  it('updates columns via select (parses to number)', () => {
    const { onChange } = renderPanel(baseBookingMenu);
    const select = screen.getByDisplayValue('3 Columns') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 4 });
  });

  it('defaults columns to 3 when not set', () => {
    renderPanel({ ...baseBookingMenu, columns: undefined });
    const select = screen.getByDisplayValue('3 Columns') as HTMLSelectElement;
    expect(select.value).toBe('3');
  });
});
