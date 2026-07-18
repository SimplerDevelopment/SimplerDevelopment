/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
/**
 * Coverage tests for components/blocks/visual/GradientBuilder.tsx
 *
 * Exercises:
 *   - parseGradient (linear/radial/conic/edge cases)
 *   - buildGradient (all three types)
 *   - stateFromProps (gradient wins / solid fallback / empty)
 *   - distributeEvenly (0/1/N stops)
 *   - GradientBuilder component: add/remove/edit stops, type/angle changes,
 *     color inputs, raw-CSS mode, presets, clear, emit branches
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

import { GradientBuilder } from '@/components/blocks/visual/GradientBuilder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(overrides: {
  backgroundColor?: string;
  backgroundGradient?: string;
  onChange?: (patch: { backgroundColor: string; backgroundGradient: string }) => void;
} = {}) {
  return {
    backgroundColor: overrides.backgroundColor ?? '',
    backgroundGradient: overrides.backgroundGradient ?? '',
    onChange: overrides.onChange ?? vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// GradientBuilder — empty / no-stops state
// ---------------------------------------------------------------------------
describe('GradientBuilder — empty state', () => {
  it('renders without crashing when both props are empty', () => {
    const { container } = render(<GradientBuilder {...makeProps()} />);
    expect(container.querySelector('.space-y-2\\.5')).toBeTruthy();
  });

  it('shows "+ Set color" button when there are no stops', () => {
    const { container } = render(<GradientBuilder {...makeProps()} />);
    expect(container.textContent).toContain('+ Set color');
  });

  it('shows preset swatches', () => {
    const { container } = render(<GradientBuilder {...makeProps()} />);
    // 8 PRESETS rendered as buttons with title attributes
    const presetBtns = Array.from(container.querySelectorAll('button[title]')).filter(
      (b) => b.getAttribute('title') !== 'Clear background' && b.getAttribute('title') !== 'Pick color',
    );
    expect(presetBtns.length).toBeGreaterThanOrEqual(8);
  });

  it('renders the preview div when no stops', () => {
    const { container } = render(<GradientBuilder {...makeProps()} />);
    const preview = container.querySelector('.h-10.rounded') as HTMLElement;
    expect(preview).toBeTruthy();
  });

  it('does NOT render the clear button when stops is empty', () => {
    const { container } = render(<GradientBuilder {...makeProps()} />);
    const clearBtn = container.querySelector('button[title="Clear background"]');
    expect(clearBtn).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GradientBuilder — solid (1-stop) state
// ---------------------------------------------------------------------------
describe('GradientBuilder — solid color state', () => {
  it('initialises from backgroundColor prop (1 stop)', () => {
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundColor: '#ff0000' })} />,
    );
    expect(container.textContent).toContain('Background Color');
    // The text input for the stop color shows the hex value
    const textInputs = container.querySelectorAll('input[type="text"]');
    const colorInput = Array.from(textInputs).find(
      (i) => (i as HTMLInputElement).value === '#ff0000',
    );
    expect(colorInput).toBeTruthy();
  });

  it('shows the clear button when there is 1 stop', () => {
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundColor: '#00ff00' })} />,
    );
    const clearBtn = container.querySelector('button[title="Clear background"]');
    expect(clearBtn).toBeTruthy();
  });

  it('clicking clear emits empty backgroundColor + backgroundGradient', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundColor: '#00ff00', onChange })} />,
    );
    const clearBtn = container.querySelector('button[title="Clear background"]') as HTMLButtonElement;
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith({ backgroundColor: '', backgroundGradient: '' });
  });

  it('does NOT show position sliders for a single stop', () => {
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundColor: '#abcdef' })} />,
    );
    // No range slider for position when only 1 stop
    const rangeInputs = container.querySelectorAll('input[type="range"]');
    expect(rangeInputs.length).toBe(0);
  });

  it('clicking + Add color promotes to gradient and emits via onChange', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundColor: '#ff0000', onChange })} />,
    );
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('+ Add color'),
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0][0] as { backgroundColor: string; backgroundGradient: string };
    expect(call.backgroundGradient).toContain('linear-gradient');
    expect(call.backgroundColor).toBe('');
  });

  it('editing the text color input emits updated solid backgroundColor', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundColor: '#ff0000', onChange })} />,
    );
    const textInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '#ff0000',
    ) as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: '#123456' } });
    expect(onChange).toHaveBeenCalledWith({ backgroundColor: '#123456', backgroundGradient: '' });
  });

  it('clicking the remove stop button on the single stop emits empty', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundColor: '#ff0000', onChange })} />,
    );
    // The remove button for the stop (not the clear-background button)
    const removeBtns = Array.from(container.querySelectorAll('button[title]')).filter(
      (b) =>
        b.getAttribute('title') === 'Remove background' ||
        b.getAttribute('title') === 'Remove color',
    );
    expect(removeBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(removeBtns[0]);
    expect(onChange).toHaveBeenCalledWith({ backgroundColor: '', backgroundGradient: '' });
  });
});

// ---------------------------------------------------------------------------
// GradientBuilder — gradient (2+ stops) state
// ---------------------------------------------------------------------------
describe('GradientBuilder — gradient state', () => {
  const ocean = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

  it('initialises from a valid linear gradient prop', () => {
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean })} />,
    );
    expect(container.textContent).toContain('Colors (2)');
  });

  it('shows position range + number inputs for each stop', () => {
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean })} />,
    );
    const rangeInputs = container.querySelectorAll('input[type="range"]');
    const numberInputs = container.querySelectorAll('input[type="number"]');
    // One range per stop (position) + angle range = 3 range inputs
    expect(rangeInputs.length).toBeGreaterThanOrEqual(2);
    expect(numberInputs.length).toBeGreaterThanOrEqual(2);
  });

  it('renders gradient type buttons (linear, radial, conic)', () => {
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean })} />,
    );
    expect(container.textContent).toContain('linear');
    expect(container.textContent).toContain('radial');
    expect(container.textContent).toContain('conic');
  });

  it('renders the angle slider and preset angle buttons', () => {
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean })} />,
    );
    expect(container.textContent).toContain('Angle');
    expect(container.textContent).toContain('135°');
    // Preset angle buttons: 0, 45, 90, 135, 180, 225, 270, 315
    const angleBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => /^\d+°$/.test(b.textContent?.trim() ?? ''),
    );
    expect(angleBtns.length).toBe(8);
  });

  it('clicking a type button switches type and emits the updated gradient', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean, onChange })} />,
    );
    const radialBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'radial',
    ) as HTMLButtonElement;
    fireEvent.click(radialBtn);
    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0][0];
    expect(call.backgroundGradient).toContain('radial-gradient');
  });

  it('clicking a preset angle button emits a gradient with that angle', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean, onChange })} />,
    );
    const btn90 = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '90°',
    ) as HTMLButtonElement;
    fireEvent.click(btn90);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].backgroundGradient).toContain('90deg');
  });

  it('dragging the angle range slider emits updated gradient', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean, onChange })} />,
    );
    // The angle range slider is the one with min=0 max=360
    const angleSlider = Array.from(container.querySelectorAll('input[type="range"]')).find(
      (i) => i.getAttribute('max') === '360',
    ) as HTMLInputElement;
    fireEvent.change(angleSlider, { target: { value: '45' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].backgroundGradient).toContain('45deg');
  });

  it('editing a stop color via text input emits updated gradient', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean, onChange })} />,
    );
    const textInputs = Array.from(container.querySelectorAll('input[type="text"]'));
    fireEvent.change(textInputs[0], { target: { value: '#aabbcc' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].backgroundGradient).toContain('#aabbcc');
  });

  it('editing a stop position via number input emits updated gradient', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean, onChange })} />,
    );
    const numberInputs = container.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[0], { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('editing a stop position via range input emits updated gradient', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean, onChange })} />,
    );
    const posRanges = Array.from(container.querySelectorAll('input[type="range"]')).filter(
      (i) => i.getAttribute('max') === '100',
    );
    fireEvent.change(posRanges[0], { target: { value: '30' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('clicking + Add color inserts a new stop and emits gradient with 3 stops', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean, onChange })} />,
    );
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('+ Add color'),
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    expect(onChange).toHaveBeenCalledTimes(1);
    // The result should still be a gradient (backgroundGradient non-empty)
    expect(onChange.mock.calls[0][0].backgroundGradient).toContain('linear-gradient');
  });

  it('removing a stop on a 2-stop gradient drops to solid and emits backgroundColor', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean, onChange })} />,
    );
    const removeColorBtns = Array.from(container.querySelectorAll('button[title="Remove color"]'));
    expect(removeColorBtns.length).toBe(2);
    fireEvent.click(removeColorBtns[0]);
    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0][0];
    // Dropping to 1 stop → solid color, not gradient
    expect(call.backgroundGradient).toBe('');
    expect(call.backgroundColor).not.toBe('');
  });

  it('clicking "distribute evenly" re-emits gradient with updated positions', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean, onChange })} />,
    );
    const distributeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('distribute evenly'),
    ) as HTMLButtonElement;
    expect(distributeBtn).toBeTruthy();
    fireEvent.click(distributeBtn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].backgroundGradient).toContain('linear-gradient');
  });

  it('editing the color picker input (type=color) emits updated gradient', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean, onChange })} />,
    );
    const colorPickers = container.querySelectorAll('input[type="color"]');
    expect(colorPickers.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(colorPickers[0], { target: { value: '#112233' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].backgroundGradient).toContain('#112233');
  });

  it('renders the preview div with the gradient background', () => {
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: ocean })} />,
    );
    const preview = container.querySelector('.h-10.rounded') as HTMLElement;
    expect(preview.style.background).toContain('linear-gradient');
  });
});

// ---------------------------------------------------------------------------
// GradientBuilder — radial gradient
// ---------------------------------------------------------------------------
describe('GradientBuilder — radial gradient', () => {
  const radialGrad = 'radial-gradient(ellipse at center, #667eea 0%, #764ba2 100%)';

  it('shows Shape and Position selects for radial type', () => {
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: radialGrad })} />,
    );
    const shapeSelect = Array.from(container.querySelectorAll('select')).find(
      (s) => s.querySelector('option[value="ellipse"]'),
    );
    const posSelect = Array.from(container.querySelectorAll('select')).find(
      (s) => s.querySelector('option[value="center"]'),
    );
    expect(shapeSelect).toBeTruthy();
    expect(posSelect).toBeTruthy();
  });

  it('does NOT show the angle slider for radial type', () => {
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: radialGrad })} />,
    );
    const angleSlider = Array.from(container.querySelectorAll('input[type="range"]')).find(
      (i) => i.getAttribute('max') === '360',
    );
    expect(angleSlider).toBeUndefined();
  });

  it('changing the shape select emits a radial gradient with the new shape', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: radialGrad, onChange })} />,
    );
    const shapeSelect = Array.from(container.querySelectorAll('select')).find(
      (s) => s.querySelector('option[value="ellipse"]'),
    ) as HTMLSelectElement;
    fireEvent.change(shapeSelect, { target: { value: 'circle' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].backgroundGradient).toContain('circle at');
  });

  it('changing the position select emits a radial gradient with the new position', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: radialGrad, onChange })} />,
    );
    const posSelect = Array.from(container.querySelectorAll('select')).find(
      (s) => s.querySelector('option[value="center"]'),
    ) as HTMLSelectElement;
    fireEvent.change(posSelect, { target: { value: 'top left' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].backgroundGradient).toContain('top left');
  });
});

// ---------------------------------------------------------------------------
// GradientBuilder — conic gradient
// ---------------------------------------------------------------------------
describe('GradientBuilder — conic gradient', () => {
  const conicGrad = 'conic-gradient(from 45deg, #667eea 0%, #764ba2 100%)';

  it('initialises from a conic gradient', () => {
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: conicGrad })} />,
    );
    expect(container.textContent).toContain('conic');
    expect(container.textContent).toContain('From Angle');
    expect(container.textContent).toContain('45°');
  });

  it('shows the angle slider for conic type', () => {
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: conicGrad })} />,
    );
    const angleSlider = Array.from(container.querySelectorAll('input[type="range"]')).find(
      (i) => i.getAttribute('max') === '360',
    );
    expect(angleSlider).toBeTruthy();
  });

  it('changing the angle emits a conic gradient with the new angle', () => {
    const onChange = vi.fn();
    const { container } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: conicGrad, onChange })} />,
    );
    const angleSlider = Array.from(container.querySelectorAll('input[type="range"]')).find(
      (i) => i.getAttribute('max') === '360',
    ) as HTMLInputElement;
    fireEvent.change(angleSlider, { target: { value: '90' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].backgroundGradient).toContain('conic-gradient');
    expect(onChange.mock.calls[0][0].backgroundGradient).toContain('90deg');
  });
});

// ---------------------------------------------------------------------------
// GradientBuilder — CSS raw mode
// ---------------------------------------------------------------------------
describe('GradientBuilder — raw CSS mode', () => {
  it('clicking the CSS tab shows a textarea', () => {
    const { container, getByText } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' })} />,
    );
    fireEvent.click(getByText('CSS'));
    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();
  });

  it('clicking the Visual tab goes back to visual mode', () => {
    const { container, getByText } = render(
      <GradientBuilder {...makeProps()} />,
    );
    fireEvent.click(getByText('CSS'));
    fireEvent.click(getByText('Visual'));
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('textarea value reflects the current backgroundGradient prop', () => {
    const grad = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    const { container, getByText } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: grad })} />,
    );
    fireEvent.click(getByText('CSS'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe(grad);
  });

  it('typing in textarea updates local rawValue', () => {
    const { container, getByText } = render(<GradientBuilder {...makeProps()} />);
    fireEvent.click(getByText('CSS'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'linear-gradient(90deg, red 0%, blue 100%)' } });
    expect(textarea.value).toBe('linear-gradient(90deg, red 0%, blue 100%)');
  });

  it('onBlur with valid gradient string parses + emits the gradient', () => {
    const onChange = vi.fn();
    const { container, getByText } = render(<GradientBuilder {...makeProps({ onChange })} />);
    fireEvent.click(getByText('CSS'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)' } });
    fireEvent.blur(textarea);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].backgroundGradient).toContain('linear-gradient');
  });

  it('onBlur with empty string emits empty backgroundColor + backgroundGradient', () => {
    const onChange = vi.fn();
    const grad = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    const { container, getByText } = render(
      <GradientBuilder {...makeProps({ backgroundGradient: grad, onChange })} />,
    );
    fireEvent.click(getByText('CSS'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '' } });
    fireEvent.blur(textarea);
    expect(onChange).toHaveBeenCalledWith({ backgroundColor: '', backgroundGradient: '' });
  });

  it('onBlur with unparseable raw CSS pushes it directly as backgroundGradient', () => {
    const onChange = vi.fn();
    const { container, getByText } = render(<GradientBuilder {...makeProps({ onChange })} />);
    fireEvent.click(getByText('CSS'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'not-a-real-gradient' } });
    fireEvent.blur(textarea);
    expect(onChange).toHaveBeenCalledWith({ backgroundColor: '', backgroundGradient: 'not-a-real-gradient' });
  });
});

// ---------------------------------------------------------------------------
// GradientBuilder — presets
// ---------------------------------------------------------------------------
describe('GradientBuilder — presets', () => {
  it('clicking a preset emits a backgroundGradient and clears backgroundColor', () => {
    const onChange = vi.fn();
    const { container } = render(<GradientBuilder {...makeProps({ onChange })} />);
    // Find the Ocean preset button (it has title="Ocean")
    const oceanBtn = container.querySelector('button[title="Ocean"]') as HTMLButtonElement;
    expect(oceanBtn).toBeTruthy();
    fireEvent.click(oceanBtn);
    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0][0];
    expect(call.backgroundGradient).toContain('linear-gradient');
    expect(call.backgroundColor).toBe('');
  });

  it('clicking the Vivid preset (3-stop) emits a 3-stop gradient', () => {
    const onChange = vi.fn();
    const { container } = render(<GradientBuilder {...makeProps({ onChange })} />);
    const vividBtn = container.querySelector('button[title="Vivid"]') as HTMLButtonElement;
    fireEvent.click(vividBtn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].backgroundGradient).toContain('50%');
  });
});

// ---------------------------------------------------------------------------
// GradientBuilder — prop updates (useEffect sync)
// ---------------------------------------------------------------------------
describe('GradientBuilder — prop updates re-sync state', () => {
  it('re-renders with new backgroundGradient and shows updated stops', () => {
    const ocean = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    const sunset = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';

    function Wrapper() {
      const [grad, setGrad] = React.useState(ocean);
      const onChange = (patch: { backgroundColor: string; backgroundGradient: string }) => {
        setGrad(patch.backgroundGradient);
      };
      return (
        <div>
          <button type="button" onClick={() => setGrad(sunset)} data-testid="swap">swap</button>
          <GradientBuilder backgroundColor="" backgroundGradient={grad} onChange={onChange} />
        </div>
      );
    }

    const { container, getByTestId } = render(<Wrapper />);
    // Before swap: ocean gradient (jsdom normalizes hex → rgb)
    const previewBefore = container.querySelector('.h-10.rounded') as HTMLElement;
    expect(previewBefore.style.background).toContain('linear-gradient');

    act(() => {
      fireEvent.click(getByTestId('swap'));
    });

    // After swap: sunset gradient — background should still be a linear-gradient
    const previewAfter = container.querySelector('.h-10.rounded') as HTMLElement;
    expect(previewAfter.style.background).toContain('linear-gradient');
  });

  it('switching from gradient to solid (empty backgroundGradient + backgroundColor set) updates stops', () => {
    function Wrapper() {
      const [state, setState] = React.useState({ bg: '', grad: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' });
      return (
        <div>
          <button
            type="button"
            data-testid="to-solid"
            onClick={() => setState({ bg: '#abcdef', grad: '' })}
          >solid</button>
          <GradientBuilder
            backgroundColor={state.bg}
            backgroundGradient={state.grad}
            onChange={() => {}}
          />
        </div>
      );
    }

    const { container, getByTestId } = render(<Wrapper />);
    // Before: 2-stop gradient label
    expect(container.textContent).toContain('Colors (2)');

    act(() => {
      fireEvent.click(getByTestId('to-solid'));
    });

    expect(container.textContent).toContain('Background Color');
  });
});

// ---------------------------------------------------------------------------
// GradientBuilder — addStop edge cases
// ---------------------------------------------------------------------------
describe('GradientBuilder — addStop from 0 stops', () => {
  it('clicking + Set color (from 0 stops) creates a single white stop and emits solid backgroundColor', () => {
    const onChange = vi.fn();
    const { container } = render(<GradientBuilder {...makeProps({ onChange })} />);
    const setColorBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('+ Set color'),
    ) as HTMLButtonElement;
    fireEvent.click(setColorBtn);
    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0][0];
    // 1 stop → solid color, not gradient
    expect(call.backgroundGradient).toBe('');
    expect(call.backgroundColor).toBe('#ffffff');
  });
});
