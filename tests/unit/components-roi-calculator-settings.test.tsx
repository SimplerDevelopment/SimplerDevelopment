// @vitest-environment jsdom
/**
 * Unit tests for RoiCalculatorBlockSettings (PUX-117 part B).
 * Every field on RoiCalculatorBlock (types/blocks/components.ts) must have a
 * settings input that round-trips through onChange with the right key/value.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';

// ─── Mock heavy dependencies ──────────────────────────────────────────────────

vi.mock('@/components/blocks/visual/TokenColorPicker', () => ({
  TokenColorPicker: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) => (
    <label>
      <span>{label || 'Accent Color'}</span>
      <input
        data-testid={`color-${label || 'Accent Color'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────
import { RoiCalculatorBlockSettings } from '@/components/blocks/visual/block-settings/panels/RoiCalculatorSettings';
import type { RoiCalculatorBlock } from '@/types/blocks';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBlock(overrides: Partial<RoiCalculatorBlock> = {}): RoiCalculatorBlock {
  return {
    id: 'block-roi-1',
    type: 'roi-calculator',
    ...overrides,
  };
}

function renderSettings(block = makeBlock(), onChange = vi.fn()) {
  const utils = render(<RoiCalculatorBlockSettings block={block} onChange={onChange} />);
  return { ...utils, onChange };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RoiCalculatorBlockSettings', () => {
  it('renders without crashing', () => {
    renderSettings();
    expect(screen.getByText('Title')).toBeInTheDocument();
  });

  // ── Text fields ──────────────────────────────────────────────────────────
  describe.each([
    { label: 'Title', field: 'title', value: 'New Title' },
    { label: 'Description', field: 'description', value: 'New description' },
    { label: 'Label', field: 'unitLabel', value: 'Reps' }, // first "Label" — primary slider
    { label: 'Text', field: 'ctaText', value: 'Book Now' },
  ])('$field text field', ({ label, field, value }) => {
    it(`calls onChange with { ${field}: value } when changed`, () => {
      const onChange = vi.fn();
      render(<RoiCalculatorBlockSettings block={makeBlock()} onChange={onChange} />);
      const input = screen.getAllByLabelText(label)[0];
      fireEvent.change(input, { target: { value } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ [field]: value }));
    });
  });

  it('calls onChange with { minutesLabel } when the secondary slider label changes', () => {
    const onChange = vi.fn();
    render(<RoiCalculatorBlockSettings block={makeBlock()} onChange={onChange} />);
    const labelInputs = screen.getAllByLabelText('Label');
    // [0] = unitLabel (Primary Slider), [1] = minutesLabel (Secondary Slider)
    fireEvent.change(labelInputs[1], { target: { value: 'Minutes saved' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ minutesLabel: 'Minutes saved' }));
  });

  it('calls onChange with { ctaLink } when the CTA link input changes', () => {
    const onChange = vi.fn();
    render(<RoiCalculatorBlockSettings block={makeBlock()} onChange={onChange} />);
    const input = screen.getByPlaceholderText('https://...');
    fireEvent.change(input, { target: { value: 'https://example.com/book' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ctaLink: 'https://example.com/book' }));
  });

  // ── Number fields ────────────────────────────────────────────────────────
  describe.each([
    { label: 'Default', field: 'unitDefault', index: 0, value: 200 },
    { label: 'Min', field: 'unitMin', index: 0, value: 5 },
    { label: 'Max', field: 'unitMax', index: 0, value: 2000 },
    { label: 'Step', field: 'unitStep', index: 0, value: 20 },
    { label: 'Default', field: 'minutesDefault', index: 1, value: 60 },
    { label: 'Min', field: 'minutesMin', index: 1, value: 10 },
    { label: 'Max', field: 'minutesMax', index: 1, value: 120 },
    { label: 'Step', field: 'minutesStep', index: 1, value: 10 },
    { label: 'Visits Per Unit / Week', field: 'visitsPerUnitPerWeek', index: 0, value: 30 },
    { label: 'Weeks Per Year', field: 'weeksPerYear', index: 0, value: 50 },
    { label: 'Capture Rate', field: 'captureRate', index: 0, value: 0.1 },
    { label: 'Hours Per Admission', field: 'hoursPerAdmission', index: 0, value: 6 },
    { label: 'Revenue Per Admission', field: 'revenuePerAdmission', index: 0, value: 3000 },
  ])('$field number field', ({ label, field, index, value }) => {
    it(`calls onChange with { ${field}: ${value} } when changed`, () => {
      const onChange = vi.fn();
      render(<RoiCalculatorBlockSettings block={makeBlock()} onChange={onChange} />);
      const inputs = screen.getAllByLabelText(label);
      fireEvent.change(inputs[index], { target: { value: String(value) } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ [field]: value }));
    });
  });

  // ── Boolean field ────────────────────────────────────────────────────────
  it('calls onChange with { ctaNewTab: true } when "Open in new tab" is checked', () => {
    const onChange = vi.fn();
    render(<RoiCalculatorBlockSettings block={makeBlock({ ctaNewTab: false })} onChange={onChange} />);
    const checkbox = screen.getByLabelText('Open in new tab');
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ctaNewTab: true }));
  });

  // ── Color field ───────────────────────────────────────────────────────────
  it('calls onChange with { accentColor } when the accent color picker changes', () => {
    const onChange = vi.fn();
    render(<RoiCalculatorBlockSettings block={makeBlock()} onChange={onChange} />);
    const colorInput = screen.getByTestId('color-Accent Color');
    fireEvent.change(colorInput, { target: { value: '#2563eb' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ accentColor: '#2563eb' }));
  });
});
