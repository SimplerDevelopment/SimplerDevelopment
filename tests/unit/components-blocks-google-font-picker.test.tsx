// @vitest-environment jsdom
/**
 * Unit tests for components/blocks/visual/GoogleFontPicker.tsx
 *
 * Covers:
 *   - Renders closed trigger button showing current value or "Default"
 *   - Opens / closes the dropdown on button click
 *   - Closes on outside click
 *   - Loads fonts from /api/google-fonts on open
 *   - Search input filters fonts (debounced re-fetch)
 *   - Clear search button resets to ''
 *   - Selecting a font calls onChange and closes the picker
 *   - Selecting "Default (inherit)" calls onChange('') and closes
 *   - Loading spinner shown while fetching
 *   - "No fonts found" message when list is empty and not loading
 *   - Injects Google Fonts link tag for the current value on mount
 *   - Infinite scroll: fetches more when scrolled near bottom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// FontFace stub — jsdom doesn't implement it
// ---------------------------------------------------------------------------

class MockFontFace {
  family: string;
  src: string;
  constructor(family: string, src: string) {
    this.family = family;
    this.src = src;
  }
  load() {
    return Promise.resolve(this);
  }
}

// ---------------------------------------------------------------------------
// Global stubs
// ---------------------------------------------------------------------------

beforeEach(() => {
  // FontFace API
  vi.stubGlobal('FontFace', MockFontFace);

  // document.fonts
  Object.defineProperty(document, 'fonts', {
    value: { add: vi.fn() },
    writable: true,
    configurable: true,
  });

  // fetch
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  // Clear any link tags injected by the component
  document.head.querySelectorAll('link[rel="stylesheet"]').forEach((el) => el.remove());
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FontItem {
  family: string;
  category: string;
  variants: string[];
  files: Record<string, string>;
}

function makeFontItem(family: string): FontItem {
  return {
    family,
    category: 'sans-serif',
    variants: ['regular'],
    files: { regular: `https://fonts.gstatic.com/${family}.ttf` },
  };
}

function makeFontResponse(families: string[], total?: number, extra = {}) {
  const items = families.map(makeFontItem);
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      success: true,
      data: items,
      pagination: { total: total ?? items.length, ...extra },
    }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Import component (after stubs are wired)
// ---------------------------------------------------------------------------

import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GoogleFontPicker — closed state', () => {
  it('shows "Default" when value is empty', () => {
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Default/i })).toBeTruthy();
  });

  it('shows the current font family when value is set', () => {
    render(<GoogleFontPicker value="Roboto" onChange={vi.fn()} />);
    expect(screen.getByText('Roboto')).toBeTruthy();
  });

  it('does not render the dropdown when closed', () => {
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    expect(screen.queryByPlaceholderText('Search fonts...')).toBeNull();
  });
});

describe('GoogleFontPicker — open / close', () => {
  it('opens the dropdown on toggle button click', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Roboto', 'Lato']));
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search fonts...')).toBeTruthy();
    });
  });

  it('closes the dropdown on second toggle click', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Roboto']));
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    const toggleBtn = screen.getByRole('button', { name: /Default/i });
    fireEvent.click(toggleBtn);
    await waitFor(() => expect(screen.getByPlaceholderText('Search fonts...')).toBeTruthy());
    fireEvent.click(toggleBtn);
    await waitFor(() => expect(screen.queryByPlaceholderText('Search fonts...')).toBeNull());
  });

  it('closes on outside click', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Roboto']));
    render(
      <div>
        <GoogleFontPicker value="" onChange={vi.fn()} />
        <div data-testid="outside">outside</div>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    await waitFor(() => expect(screen.getByPlaceholderText('Search fonts...')).toBeTruthy());
    fireEvent.mouseDown(screen.getByTestId('outside'));
    await waitFor(() => expect(screen.queryByPlaceholderText('Search fonts...')).toBeNull());
  });
});

describe('GoogleFontPicker — font list loading', () => {
  it('calls /api/google-fonts when opened for the first time', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Roboto', 'Lato']));
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/google-fonts'),
      );
    });
  });

  it('renders font items returned from the API', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Open Sans', 'Nunito']));
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    await waitFor(() => {
      expect(screen.getByText('Open Sans')).toBeTruthy();
      expect(screen.getByText('Nunito')).toBeTruthy();
    });
  });

  it('shows loading indicator while fetching', async () => {
    // Never resolves during this assertion
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    // loading spinner uses material icon text
    await waitFor(() => {
      const icons = document.querySelectorAll('.material-icons');
      const spinners = Array.from(icons).filter((el) =>
        el.classList.contains('animate-spin'),
      );
      expect(spinners.length).toBeGreaterThan(0);
    });
  });

  it('shows "No fonts found" when list is empty and not loading', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFontResponse([], 0));
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    await waitFor(() => {
      expect(screen.getByText('No fonts found')).toBeTruthy();
    });
  });

  it('handles fetch errors gracefully (no crash)', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    // should settle to not-loading without crashing
    await waitFor(() => {
      expect(screen.getByText('No fonts found')).toBeTruthy();
    });
  });
});

describe('GoogleFontPicker — search', () => {
  it('sends search query in the API call after debounce', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Roboto']));

    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));

    // initial open triggers a fetch at offset 0 — advance past that debounce
    await act(async () => { vi.advanceTimersByTime(400); });
    vi.mocked(fetch).mockClear();

    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Montserrat']));

    const input = screen.getByPlaceholderText('Search fonts...');
    fireEvent.change(input, { target: { value: 'Mont' } });

    await act(async () => { vi.advanceTimersByTime(400); });
    await Promise.resolve();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('search=Mont'),
    );

    vi.useRealTimers();
  });

  it('shows clear button when search has text and clears on click', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Roboto']));
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    await waitFor(() => screen.getByPlaceholderText('Search fonts...'));

    const input = screen.getByPlaceholderText('Search fonts...');
    fireEvent.change(input, { target: { value: 'abc' } });

    // The clear button contains a material icon with text "close"
    await waitFor(() => {
      const icons = Array.from(document.querySelectorAll('.material-icons'));
      expect(icons.some((el) => el.textContent === 'close')).toBe(true);
    });

    // Click the clear button (the button wrapping the close icon)
    const closeButtons = Array.from(document.querySelectorAll('button')).filter((btn) =>
      btn.querySelector('.material-icons')?.textContent === 'close',
    );
    expect(closeButtons.length).toBeGreaterThan(0);
    fireEvent.click(closeButtons[0]);

    expect(input).toHaveValue('');
  });

  it('does not show clear button when search is empty', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Roboto']));
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    await waitFor(() => screen.getByPlaceholderText('Search fonts...'));

    const icons = Array.from(document.querySelectorAll('.material-icons'));
    expect(icons.some((el) => el.textContent === 'close')).toBe(false);
  });
});

describe('GoogleFontPicker — selection', () => {
  it('calls onChange with the font family and closes on font select', async () => {
    const onChange = vi.fn();
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Playfair Display']));
    render(<GoogleFontPicker value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    await waitFor(() => screen.getByText('Playfair Display'));

    fireEvent.click(screen.getByText('Playfair Display').closest('button')!);
    expect(onChange).toHaveBeenCalledWith('Playfair Display');
    expect(screen.queryByPlaceholderText('Search fonts...')).toBeNull();
  });

  it('calls onChange("") and closes when "Default (inherit)" is selected', async () => {
    const onChange = vi.fn();
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Roboto']));
    render(<GoogleFontPicker value="Roboto" onChange={onChange} />);
    fireEvent.click(screen.getByText('Roboto'));
    await waitFor(() => screen.getByText('Default (inherit)'));

    fireEvent.click(screen.getByText('Default (inherit)'));
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.queryByPlaceholderText('Search fonts...')).toBeNull();
  });

  it('applies active styles to the currently selected font', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Merriweather', 'Oswald']));
    render(<GoogleFontPicker value="Merriweather" onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('Merriweather'));
    await waitFor(() => screen.getAllByText('Merriweather'));

    // The font button in the list should have the active class
    const fontButtons = Array.from(document.querySelectorAll('button')).filter(
      (btn) => btn.textContent?.includes('Merriweather') && btn.type === 'button',
    );
    const activeBtn = fontButtons.find((btn) => btn.className.includes('bg-primary'));
    expect(activeBtn).toBeTruthy();
  });
});

describe('GoogleFontPicker — font injection on mount', () => {
  it('injects a Google Fonts link tag for the current value', () => {
    render(<GoogleFontPicker value="Raleway" onChange={vi.fn()} />);
    const links = Array.from(document.head.querySelectorAll('link'));
    const fontLink = links.find((l) => l.href.includes('Raleway'));
    expect(fontLink).toBeTruthy();
    expect(fontLink?.rel).toBe('stylesheet');
  });

  it('does not inject a link tag when value is empty', () => {
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    const links = Array.from(document.head.querySelectorAll('link'));
    const fontLink = links.find((l) => l.href.includes('fonts.googleapis'));
    expect(fontLink).toBeUndefined();
  });
});

describe('GoogleFontPicker — pagination display', () => {
  it('shows font count summary when total > 0', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['Roboto', 'Lato'], 100));
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    await waitFor(() => {
      // Should show "2 of 100 fonts" (2 returned in this page, total=100)
      expect(screen.getByText(/of 100 fonts/)).toBeTruthy();
    });
  });

  it('shows nothing in count area when total is 0', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFontResponse([], 0));
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    await waitFor(() => screen.getByText('No fonts found'));
    // The count div should be empty (no "0 of 0 fonts" text)
    const countEl = document.querySelector('.text-\\[10px\\].text-muted-foreground');
    // It's present but textContent is '' when total === 0
    expect(countEl?.textContent?.trim()).toBe('');
  });
});

describe('GoogleFontPicker — infinite scroll', () => {
  it('fetches more fonts when scrolled near the bottom', async () => {
    // First page: 2 fonts, total 10
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['FontA', 'FontB'], 10));
    render(<GoogleFontPicker value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Default/i }));
    await waitFor(() => screen.getByText('FontA'));

    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValue(makeFontResponse(['FontC'], 10));

    // Find the scrollable list container (the div with max-h-64 overflow-y-auto)
    const listEl = document.querySelector('.max-h-64.overflow-y-auto') as HTMLElement;
    expect(listEl).toBeTruthy();

    // Simulate scrolled near bottom
    Object.defineProperty(listEl, 'scrollTop', { value: 900, configurable: true });
    Object.defineProperty(listEl, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(listEl, 'scrollHeight', { value: 1000, configurable: true });

    fireEvent.scroll(listEl);

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('offset=2'),
      );
    });
  });
});
