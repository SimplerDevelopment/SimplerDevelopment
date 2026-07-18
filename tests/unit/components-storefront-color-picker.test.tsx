// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// canvasStore mock — brandColors is the only piece ColorPicker reads.
// ---------------------------------------------------------------------------

let mockBrandColors: string[] = [];

vi.mock('@/lib/designer/canvasStore', () => ({
  useCanvasStore: (selector: (s: any) => any) =>
    selector({ brandColors: mockBrandColors }),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import ColorPicker, { DEFAULT_SWATCHES } from '@/components/storefront/designer/ColorPicker';

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const RECENT_KEY = 'designer:recentColors';

function clearRecent() {
  window.localStorage.removeItem(RECENT_KEY);
}

function setRecent(colors: string[]) {
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(colors));
}

// ---------------------------------------------------------------------------
// Helper — render ColorPicker and open the popover
// ---------------------------------------------------------------------------

function renderOpen(value = '#FF0000', onChange = vi.fn(), props: any = {}) {
  const result = render(
    <ColorPicker value={value} onChange={onChange} {...props} />,
  );
  const trigger = screen.getByRole('button', { name: /choose color/i });
  fireEvent.click(trigger);
  return { ...result, onChange };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ColorPicker', () => {
  beforeEach(() => {
    mockBrandColors = [];
    clearRecent();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Closed state
  // -------------------------------------------------------------------------

  it('renders the trigger button with the current color swatch and hex text', () => {
    render(<ColorPicker value="#3B82F6" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /choose color/i })).toBeInTheDocument();
    expect(screen.getByText('#3B82F6')).toBeInTheDocument();
  });

  it('renders label when label prop is provided', () => {
    render(<ColorPicker value="#000000" onChange={vi.fn()} label="Background Color" />);
    expect(screen.getByText('Background Color')).toBeInTheDocument();
  });

  it('does not render label when label prop is omitted', () => {
    render(<ColorPicker value="#000000" onChange={vi.fn()} />);
    // No <label> element rendered
    expect(screen.queryByRole('label')).not.toBeInTheDocument();
  });

  it('popover is hidden by default', () => {
    render(<ColorPicker value="#000000" onChange={vi.fn()} />);
    expect(screen.queryByText(/swatches/i)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Open / close
  // -------------------------------------------------------------------------

  it('opens the popover when the trigger is clicked', () => {
    render(<ColorPicker value="#000000" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /choose color/i }));
    expect(screen.getByText(/swatches/i)).toBeInTheDocument();
  });

  it('closes the popover on Escape key', () => {
    renderOpen();
    expect(screen.getByText(/swatches/i)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(/swatches/i)).not.toBeInTheDocument();
  });

  it('closes the popover on outside mousedown', () => {
    renderOpen();
    expect(screen.getByText(/swatches/i)).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText(/swatches/i)).not.toBeInTheDocument();
  });

  it('toggles closed when trigger is clicked again', () => {
    render(<ColorPicker value="#000000" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /choose color/i });
    fireEvent.click(trigger);
    expect(screen.getByText(/swatches/i)).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByText(/swatches/i)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Swatches grid
  // -------------------------------------------------------------------------

  it('renders all DEFAULT_SWATCHES as buttons', () => {
    renderOpen();
    // Each swatch has the hex as its title attribute
    for (const hex of DEFAULT_SWATCHES) {
      const btn = screen.getByTitle(hex);
      expect(btn).toBeInTheDocument();
    }
  });

  it('calls onChange with the chosen swatch hex', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#000000" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /choose color/i }));
    // Click the pure-white swatch (#FFFFFF)
    fireEvent.click(screen.getByTitle('#FFFFFF'));
    expect(onChange).toHaveBeenCalledWith('#ffffff');
  });

  it('marks the active swatch with a ring class', () => {
    // The active swatch must have the ring class applied
    renderOpen('#3B82F6');
    const activeBtn = screen.getByTitle('#3B82F6');
    expect(activeBtn.className).toContain('ring-2');
  });

  it('does not mark non-active swatches with the unconditional active ring', () => {
    renderOpen('#3B82F6');
    const otherBtn = screen.getByTitle('#000000');
    // Active swatch has `ring-2 ring-foreground/40` (no hover prefix).
    // Inactive swatch only has `hover:ring-2` — check the non-hover ring is absent.
    expect(otherBtn.className).not.toContain('ring-foreground/40');
    // And the active class `border-foreground` is not applied
    expect(otherBtn.className).not.toContain('border-foreground');
  });

  // -------------------------------------------------------------------------
  // Hex text input
  // -------------------------------------------------------------------------

  it('updates hexDraft as the user types in the text input', () => {
    renderOpen('#000000');
    const textInput: HTMLInputElement = screen.getByPlaceholderText('#000000');
    fireEvent.change(textInput, { target: { value: '#ABCDEF' } });
    expect(textInput.value).toBe('#ABCDEF');
  });

  it('calls onChange when a valid 6-digit hex is typed', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#000000" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /choose color/i }));
    const textInput = screen.getByPlaceholderText('#000000');
    fireEvent.change(textInput, { target: { value: '#1A2B3C' } });
    expect(onChange).toHaveBeenCalledWith('#1a2b3c');
  });

  it('does not call onChange for invalid hex strings', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#000000" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /choose color/i }));
    const textInput = screen.getByPlaceholderText('#000000');
    fireEvent.change(textInput, { target: { value: 'invalid' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts hex without leading # and normalizes it', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#000000" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /choose color/i }));
    const textInput = screen.getByPlaceholderText('#000000');
    fireEvent.change(textInput, { target: { value: 'aabbcc' } });
    expect(onChange).toHaveBeenCalledWith('#aabbcc');
  });

  // -------------------------------------------------------------------------
  // Native color input
  // -------------------------------------------------------------------------

  it('renders a native color input inside the popover', () => {
    renderOpen();
    const colorInput: HTMLInputElement = screen.getByLabelText(/pick custom color/i);
    expect(colorInput.type).toBe('color');
  });

  it('calls onChange when native color input changes', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#FF0000" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /choose color/i }));
    const colorInput = screen.getByLabelText(/pick custom color/i);
    fireEvent.change(colorInput, { target: { value: '#00FF00' } });
    expect(onChange).toHaveBeenCalledWith('#00ff00');
  });

  it('falls back native color input value to #000000 when value is invalid hex', () => {
    render(<ColorPicker value="not-a-hex" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /choose color/i }));
    const colorInput: HTMLInputElement = screen.getByLabelText(/pick custom color/i);
    expect(colorInput.value).toBe('#000000');
  });

  // -------------------------------------------------------------------------
  // Recents
  // -------------------------------------------------------------------------

  it('shows Recent section when localStorage has saved colors', () => {
    setRecent(['#AABBCC', '#001122']);
    renderOpen();
    expect(screen.getByText(/recent/i)).toBeInTheDocument();
    expect(screen.getByTitle('#AABBCC')).toBeInTheDocument();
    expect(screen.getByTitle('#001122')).toBeInTheDocument();
  });

  it('does not show Recent section when no recent colors exist', () => {
    clearRecent();
    renderOpen();
    expect(screen.queryByText(/^recent$/i)).not.toBeInTheDocument();
  });

  it('adds a chosen swatch to Recent (written to localStorage)', () => {
    clearRecent();
    const onChange = vi.fn();
    render(<ColorPicker value="#000000" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /choose color/i }));
    fireEvent.click(screen.getByTitle('#DC2626'));
    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
    expect(stored).toContain('#dc2626');
  });

  it('skips localStorage entries that are not valid hex', () => {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(['bad', '#AABBCC', 42]));
    renderOpen();
    // Only #AABBCC should appear, not "bad" or 42
    expect(screen.getByTitle('#AABBCC')).toBeInTheDocument();
    expect(screen.queryByTitle('bad')).not.toBeInTheDocument();
  });

  it('recent clicking calls onChange with that color', () => {
    setRecent(['#336699']);
    const onChange = vi.fn();
    render(<ColorPicker value="#000000" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /choose color/i }));
    fireEvent.click(screen.getByTitle('#336699'));
    expect(onChange).toHaveBeenCalledWith('#336699');
  });

  // -------------------------------------------------------------------------
  // Brand colors
  // -------------------------------------------------------------------------

  it('does not show Brand section when brandColors is empty', () => {
    mockBrandColors = [];
    renderOpen();
    expect(screen.queryByText('Brand')).not.toBeInTheDocument();
  });

  it('shows Brand section with brand color swatches', () => {
    mockBrandColors = ['#FACADE', '#C0FFEE'];
    renderOpen();
    expect(screen.getByText('Brand')).toBeInTheDocument();
    expect(screen.getByTitle('#facade (brand)')).toBeInTheDocument();
    expect(screen.getByTitle('#c0ffee (brand)')).toBeInTheDocument();
  });

  it('filters out malformed brand colors', () => {
    mockBrandColors = ['not-a-hex', '#AABBCC', ''];
    renderOpen();
    // #AABBCC normalized
    expect(screen.getByTitle('#aabbcc (brand)')).toBeInTheDocument();
    expect(screen.queryByTitle('not-a-hex (brand)')).not.toBeInTheDocument();
  });

  it('de-dupes brand colors', () => {
    mockBrandColors = ['#AABBCC', '#aabbcc', '#AABBCC'];
    renderOpen();
    const brandBtns = screen.getAllByTitle('#aabbcc (brand)');
    expect(brandBtns).toHaveLength(1);
  });

  it('marks active brand color swatch with ring', () => {
    mockBrandColors = ['#3B82F6'];
    renderOpen('#3B82F6');
    const brandBtn = screen.getByTitle('#3b82f6 (brand)');
    expect(brandBtn.className).toContain('ring-2');
  });

  it('calls onChange when brand swatch is clicked', () => {
    mockBrandColors = ['#3B82F6'];
    const onChange = vi.fn();
    render(<ColorPicker value="#000000" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /choose color/i }));
    fireEvent.click(screen.getByTitle('#3b82f6 (brand)'));
    expect(onChange).toHaveBeenCalledWith('#3b82f6');
  });

  // -------------------------------------------------------------------------
  // hexDraft syncs when value prop changes
  // -------------------------------------------------------------------------

  it('syncs hexDraft state when the value prop changes', () => {
    const { rerender } = render(<ColorPicker value="#000000" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /choose color/i }));
    const textInput: HTMLInputElement = screen.getByPlaceholderText('#000000');
    expect(textInput.value).toBe('#000000');

    rerender(<ColorPicker value="#FF5733" onChange={vi.fn()} />);
    expect(textInput.value).toBe('#FF5733');
  });

  // -------------------------------------------------------------------------
  // className prop forwarded
  // -------------------------------------------------------------------------

  it('forwards className prop to the root div', () => {
    const { container } = render(
      <ColorPicker value="#000000" onChange={vi.fn()} className="my-custom-class" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('my-custom-class');
  });
});
