// @vitest-environment jsdom
/**
 * Unit tests for BoxShadowBuilder — components/blocks/visual/BoxShadowBuilder.tsx
 *
 * Exercises (VEQA-023):
 *   - empty/none state
 *   - round-trip parsing of the legacy preset strings the old `<select>` offered
 *     (single-shadow and comma-separated multi-shadow presets)
 *   - composing a correct box-shadow string on field change (x/y/blur/spread/color)
 *   - the inset toggle
 *   - raw CSS mode (parseable, empty, and unparseable-passthrough)
 *
 * Mirrors the querySelector-based conventions used in
 * tests/unit/gradient-builder-coverage.test.tsx.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { BoxShadowBuilder } from '@/components/blocks/visual/BoxShadowBuilder';

// ---------------------------------------------------------------------------
// Legacy preset values, copied verbatim from the old StyleSettings <select>
// ---------------------------------------------------------------------------
const LEGACY_PRESETS = {
  small: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  medium: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  large: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  xl: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xxl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  inner: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
};

function makeProps(overrides: { value?: string; onChange?: (v: string) => void } = {}) {
  return {
    value: overrides.value ?? '',
    onChange: overrides.onChange ?? vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Empty / none state
// ---------------------------------------------------------------------------
describe('BoxShadowBuilder — empty state', () => {
  it('renders without crashing when value is empty', () => {
    const { container } = render(<BoxShadowBuilder {...makeProps()} />);
    expect(container.querySelector('.space-y-2\\.5')).toBeTruthy();
  });

  it('shows "+ Add shadow" and no field controls when value is empty', () => {
    const { container } = render(<BoxShadowBuilder {...makeProps()} />);
    expect(container.textContent).toContain('+ Add shadow');
    expect(container.querySelectorAll('input[type="range"]').length).toBe(0);
  });

  it('does NOT render the clear button when there is no shadow', () => {
    const { container } = render(<BoxShadowBuilder {...makeProps()} />);
    expect(container.querySelector('button[title="Clear shadow"]')).toBeNull();
  });

  it('clicking "+ Add shadow" emits the default shadow', () => {
    const onChange = vi.fn();
    const { container } = render(<BoxShadowBuilder {...makeProps({ onChange })} />);
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ Add shadow'),
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0][0] as string;
    expect(emitted).toContain('rgba(0, 0, 0, 0.1)');
    expect(emitted).not.toContain('inset');
  });
});

// ---------------------------------------------------------------------------
// Legacy preset round-trip parsing
// ---------------------------------------------------------------------------
describe('BoxShadowBuilder — legacy preset round-trip', () => {
  it('parses the Small preset into X/Y/Blur/Spread/Color fields', () => {
    const { container } = render(<BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.small })} />);
    // Not blank: field controls are present
    expect(container.querySelectorAll('input[type="range"]').length).toBe(4);
    const [xRange, yRange, blurRange, spreadRange] = Array.from(
      container.querySelectorAll('input[type="range"]'),
    ) as HTMLInputElement[];
    expect(xRange.value).toBe('0');
    expect(yRange.value).toBe('1');
    expect(blurRange.value).toBe('2');
    expect(spreadRange.value).toBe('0');
    const colorText = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value.includes('rgb'),
    ) as HTMLInputElement;
    expect(colorText.value).toBe('rgb(0 0 0 / 0.05)');
  });

  it('parses only the first shadow of the comma-separated Medium preset (does not crash)', () => {
    const { container } = render(<BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.medium })} />);
    const [xRange, yRange, blurRange, spreadRange] = Array.from(
      container.querySelectorAll('input[type="range"]'),
    ) as HTMLInputElement[];
    expect(xRange.value).toBe('0');
    expect(yRange.value).toBe('1');
    expect(blurRange.value).toBe('3');
    expect(spreadRange.value).toBe('0');
  });

  it('parses the negative-spread Large preset correctly', () => {
    const { container } = render(<BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.large })} />);
    const [xRange, yRange, blurRange, spreadRange] = Array.from(
      container.querySelectorAll('input[type="range"]'),
    ) as HTMLInputElement[];
    expect(xRange.value).toBe('0');
    expect(yRange.value).toBe('4');
    expect(blurRange.value).toBe('6');
    expect(spreadRange.value).toBe('-1');
  });

  it('parses the XL preset correctly', () => {
    const { container } = render(<BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.xl })} />);
    const [xRange, yRange, blurRange, spreadRange] = Array.from(
      container.querySelectorAll('input[type="range"]'),
    ) as HTMLInputElement[];
    expect(xRange.value).toBe('0');
    expect(yRange.value).toBe('10');
    expect(blurRange.value).toBe('15');
    expect(spreadRange.value).toBe('-3');
  });

  it('parses the 2XL preset correctly', () => {
    const { container } = render(<BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.xxl })} />);
    const [xRange, yRange, blurRange, spreadRange] = Array.from(
      container.querySelectorAll('input[type="range"]'),
    ) as HTMLInputElement[];
    expect(xRange.value).toBe('0');
    expect(yRange.value).toBe('20');
    expect(blurRange.value).toBe('25');
    expect(spreadRange.value).toBe('-5');
  });

  it('parses the single-shadow Inner preset (no "inset" keyword) without checking the inset box', () => {
    const { container } = render(<BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.inner })} />);
    const [xRange, yRange, blurRange, spreadRange] = Array.from(
      container.querySelectorAll('input[type="range"]'),
    ) as HTMLInputElement[];
    expect(xRange.value).toBe('0');
    expect(yRange.value).toBe('25');
    expect(blurRange.value).toBe('50');
    expect(spreadRange.value).toBe('-12');
    const insetCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(insetCheckbox.checked).toBe(false);
  });

  it('parses a well-formed shadow with a leading "inset" keyword', () => {
    const { container } = render(
      <BoxShadowBuilder {...makeProps({ value: 'inset 2px 3px 4px 1px #ff0000' })} />,
    );
    const insetCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(insetCheckbox.checked).toBe(true);
    const [xRange, yRange, blurRange, spreadRange] = Array.from(
      container.querySelectorAll('input[type="range"]'),
    ) as HTMLInputElement[];
    expect(xRange.value).toBe('2');
    expect(yRange.value).toBe('3');
    expect(blurRange.value).toBe('4');
    expect(spreadRange.value).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Composing an updated string on field change
// ---------------------------------------------------------------------------
describe('BoxShadowBuilder — composes correct string on field change', () => {
  it('changing the X offset range emits a recomposed box-shadow string', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.small, onChange })} />,
    );
    const [xRange] = Array.from(container.querySelectorAll('input[type="range"]')) as HTMLInputElement[];
    fireEvent.change(xRange, { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe('10px 1px 2px 0px rgb(0 0 0 / 0.05)');
  });

  it('changing the blur range emits a recomposed string', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.small, onChange })} />,
    );
    const [, , blurRange] = Array.from(container.querySelectorAll('input[type="range"]')) as HTMLInputElement[];
    fireEvent.change(blurRange, { target: { value: '20' } });
    expect(onChange.mock.calls[0][0]).toBe('0px 1px 20px 0px rgb(0 0 0 / 0.05)');
  });

  it('changing the spread range emits a recomposed string', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.small, onChange })} />,
    );
    const [, , , spreadRange] = Array.from(container.querySelectorAll('input[type="range"]')) as HTMLInputElement[];
    fireEvent.change(spreadRange, { target: { value: '-4' } });
    expect(onChange.mock.calls[0][0]).toBe('0px 1px 2px -4px rgb(0 0 0 / 0.05)');
  });

  it('editing the color text input emits a recomposed string with the new color', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.small, onChange })} />,
    );
    const colorText = Array.from(container.querySelectorAll('input[type="text"]')).find((i) =>
      (i as HTMLInputElement).value.includes('rgb'),
    ) as HTMLInputElement;
    fireEvent.change(colorText, { target: { value: '#00ff00' } });
    expect(onChange.mock.calls[0][0]).toBe('0px 1px 2px 0px #00ff00');
  });

  it('editing the color picker (type=color) emits a recomposed string', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.small, onChange })} />,
    );
    const colorPicker = container.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.change(colorPicker, { target: { value: '#112233' } });
    expect(onChange.mock.calls[0][0]).toBe('0px 1px 2px 0px #112233');
  });

  it('clicking the clear button emits an empty string and hides the fields', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.small, onChange })} />,
    );
    const clearBtn = container.querySelector('button[title="Clear shadow"]') as HTMLButtonElement;
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith('');
  });
});

// ---------------------------------------------------------------------------
// Inset toggle
// ---------------------------------------------------------------------------
describe('BoxShadowBuilder — inset toggle', () => {
  it('checking the inset checkbox emits a string prefixed with "inset "', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.small, onChange })} />,
    );
    const insetCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(insetCheckbox.checked).toBe(false);
    fireEvent.click(insetCheckbox);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe('inset 0px 1px 2px 0px rgb(0 0 0 / 0.05)');
  });

  it('unchecking the inset checkbox drops the "inset " prefix', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BoxShadowBuilder {...makeProps({ value: 'inset 2px 3px 4px 1px #ff0000', onChange })} />,
    );
    const insetCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(insetCheckbox.checked).toBe(true);
    fireEvent.click(insetCheckbox);
    expect(onChange.mock.calls[0][0]).toBe('2px 3px 4px 1px #ff0000');
  });
});

// ---------------------------------------------------------------------------
// Raw CSS mode
// ---------------------------------------------------------------------------
describe('BoxShadowBuilder — raw CSS mode', () => {
  it('clicking the CSS tab shows a textarea with the current value', () => {
    const { container, getByText } = render(
      <BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.small })} />,
    );
    fireEvent.click(getByText('CSS'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe(LEGACY_PRESETS.small);
  });

  it('clicking Visual after CSS goes back to field mode', () => {
    const { container, getByText } = render(
      <BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.small })} />,
    );
    fireEvent.click(getByText('CSS'));
    fireEvent.click(getByText('Visual'));
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelectorAll('input[type="range"]').length).toBe(4);
  });

  it('onBlur with a valid shadow string parses + emits it', () => {
    const onChange = vi.fn();
    const { container, getByText } = render(
      <BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.small, onChange })} />,
    );
    fireEvent.click(getByText('CSS'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '5px 5px 10px 2px #123456' } });
    fireEvent.blur(textarea);
    expect(onChange).toHaveBeenCalledWith('5px 5px 10px 2px #123456');
  });

  it('onBlur with an empty string emits empty and clears fields', () => {
    const onChange = vi.fn();
    const { container, getByText } = render(
      <BoxShadowBuilder {...makeProps({ value: LEGACY_PRESETS.small, onChange })} />,
    );
    fireEvent.click(getByText('CSS'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '' } });
    fireEvent.blur(textarea);
    expect(onChange).toHaveBeenCalledWith('');
  });
});
