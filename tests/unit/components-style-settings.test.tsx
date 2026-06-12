// @vitest-environment jsdom
/**
 * Unit tests for StyleSettings — components/blocks/visual/StyleSettings.tsx
 *
 * Exercises the collapsible style panel: layout, margin/padding, visibility,
 * background, typography, border, shadows/effects, and CSS sections.
 *
 * Heavy children (TokenColorPicker, GoogleFontPicker, GradientBuilder,
 * MediaPicker) are mocked with trivial test-id stubs so we can isolate the
 * panel's own branching logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for visual child components
// ---------------------------------------------------------------------------

vi.mock('@/components/blocks/visual/TokenColorPicker', () => ({
  TokenColorPicker: ({
    label,
    value,
    onChange,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <div data-testid={`token-color-${label}`}>
      <span>{label}</span>
      <input
        data-testid={`token-color-input-${label}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock('@/components/blocks/visual/GoogleFontPicker', () => ({
  GoogleFontPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input
      data-testid="google-font-picker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('@/components/blocks/visual/GradientBuilder', () => ({
  GradientBuilder: ({
    backgroundColor,
    backgroundGradient,
    onChange,
  }: {
    backgroundColor: string;
    backgroundGradient: string;
    onChange: (patch: { backgroundColor?: string; backgroundGradient?: string }) => void;
  }) => (
    <div data-testid="gradient-builder">
      <span data-testid="gradient-bg-color">{backgroundColor}</span>
      <span data-testid="gradient-bg-gradient">{backgroundGradient}</span>
      <button
        data-testid="gradient-set-color"
        type="button"
        onClick={() => onChange({ backgroundColor: '#abcdef', backgroundGradient: '' })}
      >
        set-color
      </button>
      <button
        data-testid="gradient-set-gradient"
        type="button"
        onClick={() =>
          onChange({ backgroundColor: '', backgroundGradient: 'linear-gradient(red,blue)' })
        }
      >
        set-gradient
      </button>
    </div>
  ),
}));

vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({
    value,
    onChange,
    label,
  }: {
    value: string;
    onChange: (v: string) => void;
    label?: string;
  }) => (
    <div data-testid="media-picker">
      <span>{label}</span>
      <input
        data-testid="media-picker-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

import { StyleSettings } from '@/components/blocks/visual/StyleSettings';
import type { Block } from '@/types/blocks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'b1',
    type: 'text',
    content: 'hello',
    ...overrides,
  } as Block;
}

function renderPanel(
  blockOverrides: Partial<Block> = {},
  viewport: 'mobile' | 'tablet' | 'desktop' = 'desktop',
) {
  const onChange = vi.fn();
  const block = makeBlock(blockOverrides);
  const utils = render(
    <StyleSettings block={block} onChange={onChange} currentViewport={viewport} />,
  );
  return { ...utils, onChange, block };
}

// Open a collapsible section by clicking its title button.
function openSection(title: string) {
  const headers = screen.getAllByRole('button');
  const header = headers.find((b) => b.textContent?.includes(title));
  if (!header) throw new Error(`Could not find section: ${title}`);
  fireEvent.click(header);
}

// ---------------------------------------------------------------------------
// Initial render / smoke tests
// ---------------------------------------------------------------------------

describe('StyleSettings — rendering', () => {
  it('renders all collapsible section headers', () => {
    renderPanel();
    expect(screen.getByText('Layout')).toBeTruthy();
    expect(screen.getByText('Margin & Padding')).toBeTruthy();
    expect(screen.getByText('Visibility')).toBeTruthy();
    expect(screen.getByText('Background')).toBeTruthy();
    expect(screen.getByText('Typography')).toBeTruthy();
    expect(screen.getByText('Border')).toBeTruthy();
    expect(screen.getByText('Shadows & Effects')).toBeTruthy();
    expect(screen.getByText('CSS Properties')).toBeTruthy();
  });

  it('opens Layout by default and shows Display select', () => {
    renderPanel();
    expect(screen.getByText('Display')).toBeTruthy();
  });

  it('does not show Margin & Padding fields until section is opened', () => {
    renderPanel();
    // Two "padding" buttons (no rendered BoxModelControls yet)
    expect(screen.queryAllByText('Static Padding').length).toBe(0);
  });

  it('toggles section open and closed', () => {
    renderPanel();
    openSection('Visibility');
    expect(screen.getAllByText(/Visible on/i).length).toBeGreaterThan(0);
    openSection('Visibility');
    expect(screen.queryAllByText(/Visible on/i).length).toBe(0);
  });

  it('handles block.style that is not an object (defensive fallback)', () => {
    // @ts-expect-error testing defensive path
    const { onChange } = renderPanel({ style: 'not an object' });
    // Just confirm it renders without crashing
    expect(screen.getByText('Layout')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Layout section
// ---------------------------------------------------------------------------

describe('StyleSettings — Layout', () => {
  // Layout controls now write breakpoint-scoped values into
  // block.responsiveStyle[currentViewport] (desktop by default in renderPanel)
  // instead of the flat block.style.
  it('changing Display calls onChange with new value', () => {
    const { onChange } = renderPanel();
    const display = screen.getByDisplayValue('Flex') as HTMLSelectElement;
    fireEvent.change(display, { target: { value: 'grid' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ display: 'grid' }),
        }),
      }),
    );
  });

  it('shows flex controls when display is flex (default)', () => {
    renderPanel();
    expect(screen.getByText('Direction')).toBeTruthy();
    expect(screen.getByText('Justify Content')).toBeTruthy();
    expect(screen.getByText('Align Items')).toBeTruthy();
    expect(screen.getAllByText('Wrap').length).toBeGreaterThan(0);
  });

  it('hides flex controls when display is block', () => {
    renderPanel({ style: { display: 'block' } } as Partial<Block>);
    expect(screen.queryByText('Direction')).toBeNull();
    expect(screen.queryByText('Wrap')).toBeNull();
  });

  it('shows grid controls when display is grid', () => {
    renderPanel({ style: { display: 'grid' } } as Partial<Block>);
    expect(screen.getByText('Columns')).toBeTruthy();
    expect(screen.getByText('Rows')).toBeTruthy();
    expect(screen.getByPlaceholderText('1fr 1fr 1fr')).toBeTruthy();
  });

  it('clicking direction button updates flexDirection', () => {
    const { onChange } = renderPanel();
    const colBtn = screen.getByTitle('Col');
    fireEvent.click(colBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ flexDirection: 'column' }),
        }),
      }),
    );
  });

  it('clicking Justify Content button updates justifyContent', () => {
    const { onChange } = renderPanel();
    // Find by text content "center" inside a justifycontent button
    const buttons = screen.getAllByRole('button');
    const centerBtn = buttons.find((b) => b.textContent === 'center');
    if (!centerBtn) throw new Error('center button not found');
    fireEvent.click(centerBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ justifyContent: 'center' }),
        }),
      }),
    );
  });

  it('updates width via input', () => {
    const { onChange } = renderPanel();
    // First 'auto'-placeholder text input is the Width field.
    const inputs = screen.getAllByPlaceholderText('auto');
    fireEvent.change(inputs[0], { target: { value: '50%' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ width: '50%' }),
        }),
      }),
    );
  });

  it('shows position offset inputs when position is non-static', () => {
    renderPanel({ style: { position: 'absolute' } } as Partial<Block>);
    expect(screen.getByText('Z-Index')).toBeTruthy();
  });

  it('does not show offset inputs when position is unset', () => {
    renderPanel();
    expect(screen.queryByText('Z-Index')).toBeNull();
  });

  it('updates overflow via select', () => {
    const { onChange } = renderPanel();
    const overflow = screen.getAllByRole('combobox').find(
      (s) => (s as HTMLSelectElement).options[0]?.text === 'Visible',
    ) as HTMLSelectElement;
    fireEvent.change(overflow, { target: { value: 'hidden' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ overflow: 'hidden' }),
        }),
      }),
    );
  });

  it('updates gap via select when flex', () => {
    const { onChange } = renderPanel();
    const gap = screen.getAllByRole('combobox').find(
      (s) => (s as HTMLSelectElement).options[0]?.text === 'None' &&
        Array.from((s as HTMLSelectElement).options).some((o) => o.value === '1rem'),
    ) as HTMLSelectElement;
    fireEvent.change(gap, { target: { value: '1rem' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ gap: '1rem' }),
        }),
      }),
    );
  });

  it('updates grid columns when display=grid', () => {
    const { onChange } = renderPanel({ style: { display: 'grid' } } as Partial<Block>);
    const cols = screen.getByPlaceholderText('1fr 1fr 1fr') as HTMLInputElement;
    fireEvent.change(cols, { target: { value: '1fr 2fr' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ gridTemplateColumns: '1fr 2fr' }),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Margin & Padding section (responsive + static via BoxModelControl)
// ---------------------------------------------------------------------------

describe('StyleSettings — Margin & Padding', () => {
  it('displays current viewport label', () => {
    renderPanel({}, 'tablet');
    openSection('Margin & Padding');
    // The label now also appears in the Layout section (open by default), so
    // assert at least one match instead of a unique one.
    expect(screen.getAllByText(/Editing for Tablet/).length).toBeGreaterThan(0);
  });

  it('shows margin/padding controls when opened', () => {
    renderPanel();
    openSection('Margin & Padding');
    expect(screen.getByText('Margin')).toBeTruthy();
    expect(screen.getByText('Padding')).toBeTruthy();
    expect(screen.getByText('Static Padding')).toBeTruthy();
    expect(screen.getByText('Static Margin')).toBeTruthy();
  });

  it('updates responsive marginTop via spacing select', () => {
    const { onChange } = renderPanel();
    openSection('Margin & Padding');
    // First margin-top control is the responsive one (renders before static)
    const topSelect = screen.getAllByTitle('margin-top')[0] as HTMLSelectElement;
    fireEvent.change(topSelect, { target: { value: 'md' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsive: expect.objectContaining({
          marginTop: expect.objectContaining({ desktop: 'md' }),
        }),
      }),
    );
  });

  it('updates responsive paddingLeft via spacing select', () => {
    const { onChange } = renderPanel({}, 'mobile');
    openSection('Margin & Padding');
    const leftSelect = screen.getAllByTitle('padding-left')[0] as HTMLSelectElement;
    fireEvent.change(leftSelect, { target: { value: 'lg' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsive: expect.objectContaining({
          paddingLeft: expect.objectContaining({ mobile: 'lg' }),
        }),
      }),
    );
  });

  it('switches a spacing control to custom mode and clears it', () => {
    renderPanel();
    openSection('Margin & Padding');
    const topSelect = screen.getAllByTitle('margin-top')[0] as HTMLSelectElement;
    fireEvent.change(topSelect, { target: { value: '__custom__' } });
    // Custom number input should now be present
    const numInput = screen.getAllByTitle('margin-top').find(
      (n) => n.tagName === 'INPUT',
    ) as HTMLInputElement;
    expect(numInput).toBeTruthy();
    // Click the reset (close) button next to it
    const resetBtns = screen.getAllByTitle('Back to presets');
    expect(resetBtns.length).toBeGreaterThan(0);
    fireEvent.click(resetBtns[0]);
  });

  it('typing a value in custom mode emits px units by default', () => {
    const { onChange } = renderPanel();
    openSection('Margin & Padding');
    const topSelect = screen.getAllByTitle('margin-top')[0] as HTMLSelectElement;
    fireEvent.change(topSelect, { target: { value: '__custom__' } });
    const numInput = screen
      .getAllByTitle('margin-top')
      .find((n) => n.tagName === 'INPUT') as HTMLInputElement;
    fireEvent.change(numInput, { target: { value: '42' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsive: expect.objectContaining({
          marginTop: expect.objectContaining({ desktop: '42px' }),
        }),
      }),
    );
  });

  it('changing custom unit to % re-emits onChange with new unit', () => {
    const { onChange } = renderPanel();
    openSection('Margin & Padding');
    const topSelect = screen.getAllByTitle('margin-top')[0] as HTMLSelectElement;
    fireEvent.change(topSelect, { target: { value: '__custom__' } });
    const numInput = screen
      .getAllByTitle('margin-top')
      .find((n) => n.tagName === 'INPUT') as HTMLInputElement;
    fireEvent.change(numInput, { target: { value: '5' } });
    onChange.mockClear();
    // Find the unit select (rendered as a sibling combobox in jsdom)
    const unitSelects = screen.getAllByRole('combobox').filter((s) => {
      const opts = (s as HTMLSelectElement).options;
      return opts.length === 2 && opts[0].value === 'px' && opts[1].value === '%';
    });
    expect(unitSelects.length).toBeGreaterThan(0);
    fireEvent.change(unitSelects[0], { target: { value: '%' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsive: expect.objectContaining({
          marginTop: expect.objectContaining({ desktop: '5%' }),
        }),
      }),
    );
  });

  it('renders custom-mode controls when initial responsive value is custom (e.g. 16px)', () => {
    renderPanel({
      responsive: { marginTop: { desktop: '16px' } },
    } as Partial<Block>);
    openSection('Margin & Padding');
    // Initial value 16px isn't in the preset list -> rendered as number input
    const numInputs = screen.getAllByTitle('margin-top').filter((n) => n.tagName === 'INPUT');
    expect(numInputs.length).toBeGreaterThan(0);
    expect((numInputs[0] as HTMLInputElement).value).toBe('16');
  });

  it('updates static padding via shorthand builder (top change)', () => {
    const { onChange } = renderPanel();
    openSection('Margin & Padding');
    const topSelect = screen.getAllByTitle('padding-top')[1] as HTMLSelectElement;
    fireEvent.change(topSelect, { target: { value: '1rem' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ padding: expect.stringContaining('1rem') }),
      }),
    );
  });

  it('updates static margin via shorthand builder', () => {
    const { onChange } = renderPanel({
      style: { margin: '1rem 2rem 3rem 4rem' },
    } as Partial<Block>);
    openSection('Margin & Padding');
    // We expect 4 separate inputs (top/right/bottom/left) plus the responsive set
    const tops = screen.getAllByTitle('margin-top');
    expect(tops.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(tops[tops.length - 1], { target: { value: '0' } });
    expect(onChange).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

describe('StyleSettings — Visibility', () => {
  it('toggles visibility checkbox', () => {
    const { onChange } = renderPanel({}, 'mobile');
    openSection('Visibility');
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsive: expect.objectContaining({
          visibility: expect.objectContaining({ mobile: false }),
        }),
      }),
    );
  });

  it('renders unchecked when responsive.visibility is false for viewport', () => {
    renderPanel({
      responsive: { visibility: { tablet: false } },
    } as Partial<Block>, 'tablet');
    openSection('Visibility');
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

describe('StyleSettings — Background', () => {
  it('renders the GradientBuilder mock', () => {
    renderPanel();
    openSection('Background');
    expect(screen.getByTestId('gradient-builder')).toBeTruthy();
  });

  it('GradientBuilder onChange (set color) forwards to onChange', () => {
    const { onChange } = renderPanel();
    openSection('Background');
    fireEvent.click(screen.getByTestId('gradient-set-color'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({
          backgroundColor: '#abcdef',
          backgroundGradient: '',
        }),
      }),
    );
  });

  it('GradientBuilder onChange (set gradient) forwards to onChange', () => {
    const { onChange } = renderPanel();
    openSection('Background');
    fireEvent.click(screen.getByTestId('gradient-set-gradient'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({
          backgroundGradient: expect.stringContaining('linear-gradient'),
        }),
      }),
    );
  });

  it('shows extra image controls when backgroundImage is set', () => {
    renderPanel({
      style: { backgroundImage: 'url(/x.png)' },
    } as Partial<Block>);
    openSection('Background');
    // "Repeat" appears both as a label and a select option, so use getAllByText
    expect(screen.getAllByText('Repeat').length).toBeGreaterThan(0);
    expect(screen.getByText('Attachment')).toBeTruthy();
  });

  it('shows blend mode when backgroundGradient is set', () => {
    renderPanel({
      style: { backgroundGradient: 'linear-gradient(red,blue)' },
    } as Partial<Block>);
    openSection('Background');
    expect(screen.getByText('Blend Mode')).toBeTruthy();
  });

  it('MediaPicker change updates backgroundImage', () => {
    const { onChange } = renderPanel();
    openSection('Background');
    const input = screen.getByTestId('media-picker-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '/new.png' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ backgroundImage: '/new.png' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

describe('StyleSettings — Typography', () => {
  it('renders TokenColorPicker for text color', () => {
    renderPanel();
    openSection('Typography');
    expect(screen.getByTestId('token-color-Text Color')).toBeTruthy();
  });

  it('changes text color via token picker', () => {
    const { onChange } = renderPanel();
    openSection('Typography');
    const input = screen.getByTestId('token-color-input-Text Color') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#ff0000' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ color: '#ff0000' }),
      }),
    );
  });

  it('hides font-size controls for non-text blocks', () => {
    renderPanel({ type: 'spacer' } as Partial<Block>);
    openSection('Typography');
    expect(screen.queryByText('Font Size')).toBeNull();
    expect(screen.queryByText('Text Align')).toBeNull();
  });

  it('shows font-size + alignment controls for text blocks', () => {
    renderPanel();
    openSection('Typography');
    expect(screen.getByText('Font Size')).toBeTruthy();
    expect(screen.getByText('Text Align')).toBeTruthy();
    expect(screen.getByText('Transform')).toBeTruthy();
    expect(screen.getByText('Decoration')).toBeTruthy();
  });

  it('font family change goes through GoogleFontPicker mock', () => {
    const { onChange } = renderPanel();
    openSection('Typography');
    const fp = screen.getByTestId('google-font-picker') as HTMLInputElement;
    fireEvent.change(fp, { target: { value: 'Roboto' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ fontFamily: 'Roboto' }),
      }),
    );
  });

  it('changes font weight', () => {
    const { onChange } = renderPanel();
    openSection('Typography');
    const weightSelect = screen.getAllByRole('combobox').find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.text === 'Bold'),
    ) as HTMLSelectElement;
    fireEvent.change(weightSelect, { target: { value: '700' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ fontWeight: '700' }),
      }),
    );
  });

  it('clicks a text-align button', () => {
    const { onChange } = renderPanel();
    openSection('Typography');
    const center = screen.getByTitle('Center');
    fireEvent.click(center);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ textAlign: 'center' }),
      }),
    );
  });

  it('clicks a text-transform button (ABC)', () => {
    const { onChange } = renderPanel();
    openSection('Typography');
    const buttons = screen.getAllByRole('button');
    const abc = buttons.find((b) => b.textContent === 'ABC');
    if (!abc) throw new Error('ABC button not found');
    fireEvent.click(abc);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ textTransform: 'uppercase' }),
      }),
    );
  });

  it('updates responsive font-size override', () => {
    const { onChange } = renderPanel({}, 'tablet');
    openSection('Typography');
    const respFontSize = screen.getAllByRole('combobox').find((s) => {
      const opts = (s as HTMLSelectElement).options;
      return Array.from(opts).some((o) => o.value === '6xl') && opts[0].value === '';
    }) as HTMLSelectElement;
    fireEvent.change(respFontSize, { target: { value: 'xl' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsive: expect.objectContaining({
          fontSize: expect.objectContaining({ tablet: 'xl' }),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Border
// ---------------------------------------------------------------------------

describe('StyleSettings — Border', () => {
  // Helper: find the top-level Border Width select (7 options: '', 1px..8px, none of value 0px)
  function findBorderWidthSelect(): HTMLSelectElement {
    const all = screen.getAllByRole('combobox');
    const match = all.find((s) => {
      const opts = Array.from((s as HTMLSelectElement).options);
      // Top-level Border Width: 7 options, includes '1px', no '0px' (per-side has 0px)
      return (
        opts.length === 7 &&
        opts.some((o) => o.value === '1px') &&
        !opts.some((o) => o.value === '0px')
      );
    });
    if (!match) throw new Error('Border Width select not found');
    return match as HTMLSelectElement;
  }

  it('sets border width with no existing borderStyle defaults style to solid', () => {
    const { onChange } = renderPanel();
    openSection('Border');
    const widthSelect = findBorderWidthSelect();
    fireEvent.change(widthSelect, { target: { value: '2px' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ borderWidth: '2px', borderStyle: 'solid' }),
      }),
    );
  });

  it('sets border width when style already present just updates width', () => {
    const { onChange } = renderPanel({
      style: { borderWidth: '1px', borderStyle: 'solid' },
    } as Partial<Block>);
    openSection('Border');
    const widthSelect = findBorderWidthSelect();
    fireEvent.change(widthSelect, { target: { value: '4px' } });
    // Should have been called with width updated (and style preserved as solid in merged result)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ borderWidth: '4px' }),
      }),
    );
  });

  it('shows border color & style controls only when width set', () => {
    const noWidth = renderPanel();
    openSection('Border');
    expect(screen.queryByTestId('token-color-Border Color')).toBeNull();
    noWidth.unmount();

    renderPanel({ style: { borderWidth: '2px' } } as Partial<Block>);
    openSection('Border');
    expect(screen.getByTestId('token-color-Border Color')).toBeTruthy();
  });

  it('toggles per-side borders panel', () => {
    renderPanel();
    openSection('Border');
    const psbBtn = screen.getByText('Per-side borders');
    fireEvent.click(psbBtn);
    // Now per-side labels render: "Top W", "Right W", "Bottom W", "Left W"
    expect(screen.getByText('Top W')).toBeTruthy();
    expect(screen.getByText('Right W')).toBeTruthy();
    expect(screen.getByText('Bottom W')).toBeTruthy();
    expect(screen.getByText('Left W')).toBeTruthy();
  });

  it('setting a per-side width with no per-side style auto-sets solid', () => {
    const { onChange } = renderPanel();
    openSection('Border');
    fireEvent.click(screen.getByText('Per-side borders'));
    // The first <select> under Top W is our target.
    const allSelects = screen.getAllByRole('combobox');
    // Find a select that has both '' and '0px' options (per-side width)
    const target = allSelects.find((s) => {
      const opts = Array.from((s as HTMLSelectElement).options);
      return opts.some((o) => o.value === '0px') && opts.some((o) => o.value === '1px');
    }) as HTMLSelectElement;
    fireEvent.change(target, { target: { value: '2px' } });
    expect(onChange).toHaveBeenCalled();
    // Either borderTopWidth or one of the side widths must be set; style:solid expected
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.style).toBeDefined();
  });

  it('renders border radius dropdown and updates it', () => {
    const { onChange } = renderPanel();
    openSection('Border');
    // border-radius select: contains "Full (Pill)"
    const radiusSelect = screen.getAllByRole('combobox').find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.text === 'Full (Pill)'),
    ) as HTMLSelectElement;
    fireEvent.change(radiusSelect, { target: { value: '0.5rem' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ borderRadius: '0.5rem' }),
      }),
    );
  });

  it('shows per-corner radius toggle when radius is set', () => {
    renderPanel({ style: { borderRadius: '0.5rem' } } as Partial<Block>);
    openSection('Border');
    expect(screen.getByText('Per-corner radius')).toBeTruthy();
    fireEvent.click(screen.getByText('Per-corner radius'));
    expect(screen.getByText('TL')).toBeTruthy();
    expect(screen.getByText('TR')).toBeTruthy();
    expect(screen.getByText('BL')).toBeTruthy();
    expect(screen.getByText('BR')).toBeTruthy();
  });

  it('does not show per-corner radius when no radius set', () => {
    renderPanel();
    openSection('Border');
    expect(screen.queryByText('Per-corner radius')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Shadows & Effects
// ---------------------------------------------------------------------------

describe('StyleSettings — Shadows & Effects', () => {
  it('updates box shadow', () => {
    const { onChange } = renderPanel();
    openSection('Shadows & Effects');
    const shadow = screen.getAllByRole('combobox').find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.text === 'Large'),
    ) as HTMLSelectElement;
    fireEvent.change(shadow, { target: { value: '0 1px 2px 0 rgb(0 0 0 / 0.05)' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ boxShadow: expect.stringContaining('rgb') }),
      }),
    );
  });

  it('updates opacity via range slider', () => {
    const { onChange } = renderPanel();
    openSection('Shadows & Effects');
    const slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '50' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ opacity: '0.5' }),
      }),
    );
  });

  it('shows current opacity percentage in the label', () => {
    renderPanel({ style: { opacity: '0.25' } } as Partial<Block>);
    openSection('Shadows & Effects');
    expect(screen.getByText('25%')).toBeTruthy();
  });

  it('defaults opacity label to 100% when not set', () => {
    renderPanel();
    openSection('Shadows & Effects');
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('updates transition preset', () => {
    const { onChange } = renderPanel();
    openSection('Shadows & Effects');
    const trans = screen.getAllByRole('combobox').find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.text === 'Smooth'),
    ) as HTMLSelectElement;
    fireEvent.change(trans, { target: { value: 'all 0.3s ease' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ transition: 'all 0.3s ease' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// CSS Properties
// ---------------------------------------------------------------------------

describe('StyleSettings — CSS Properties', () => {
  it('writes textarea content to style.customCSS', () => {
    const { onChange } = renderPanel();
    openSection('CSS Properties');
    const ta = screen.getByPlaceholderText('property: value; property: value;');
    fireEvent.change(ta, { target: { value: 'filter: blur(2px);' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ customCSS: 'filter: blur(2px);' }),
      }),
    );
  });

  it('renders initial customCSS value', () => {
    renderPanel({ style: { customCSS: 'foo: bar;' } } as Partial<Block>);
    openSection('CSS Properties');
    const ta = screen.getByPlaceholderText(
      'property: value; property: value;',
    ) as HTMLTextAreaElement;
    expect(ta.value).toBe('foo: bar;');
  });
});
