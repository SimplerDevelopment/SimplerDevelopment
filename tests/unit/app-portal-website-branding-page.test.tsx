// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/websites/[siteId]/branding/page.tsx`.
 *
 * Covers:
 *   - Loading spinner shown while fetch is pending
 *   - Happy-path render: header, back link, tabs (Logos / Colors / Typography / Style)
 *   - Save button disabled when form is clean; enabled after a field change
 *   - Save flow: PUT request fired, button returns to "Save Changes" after save
 *   - Tab switching: each tab label appears and switching shows correct content
 *   - Colors tab: default hex values rendered in text inputs
 *   - Style tab: border radius presets, custom value input, link color inputs, button style
 *   - Logo tab: Brand Name text input, logo alt text input
 *   - AI Brand Generator: collapsed by default; expands on click; error for short prompt;
 *     success path applying generated values; network error path
 *   - API load: merges server data over DEFAULTS; handles success=false gracefully
 *
 * Mocks: next/navigation (useParams), next/link, MediaPicker, GoogleFontPicker, global fetch.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ─────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({ siteId: 'site-99' }),
  usePathname: () => '/portal/websites/site-99/branding',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) =>
    React.createElement('a', { href, ...rest }, children),
}));

// MediaPicker — heavy child with file-upload logic; stub to a simple button.
vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({
    value,
    onChange,
    label,
  }: {
    value: string;
    onChange: (url: string) => void;
    label: string;
    mimeTypeFilter?: string;
    apiEndpoint?: string;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': `media-picker-${label}` },
      React.createElement('span', {}, value || ''),
      React.createElement(
        'button',
        {
          'data-testid': `media-picker-trigger-${label}`,
          onClick: () => onChange(`https://cdn.example.com/${label.toLowerCase().replace(/\s/g, '-')}.png`),
        },
        `Pick ${label}`,
      ),
    ),
}));

// GoogleFontPicker — renders a stub select-like widget.
vi.mock('@/components/blocks/visual/GoogleFontPicker', () => ({
  GoogleFontPicker: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (font: string) => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'google-font-picker' },
      React.createElement('span', {}, value || ''),
      React.createElement(
        'button',
        {
          'data-testid': 'google-font-picker-select',
          onClick: () => onChange('Inter'),
        },
        'Select Font',
      ),
    ),
}));

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function brandingData(overrides: Record<string, unknown> = {}) {
  return {
    logoUrl: '',
    logoAlt: 'Acme Corp',
    logoSquareUrl: '',
    logoRectUrl: '',
    logoText: 'Acme',
    logoIconUrl: '',
    primaryColor: '#ff0000',
    secondaryColor: '#00ff00',
    accentColor: '#0000ff',
    backgroundColor: '#ffffff',
    textColor: '#111111',
    headingFont: 'Roboto',
    bodyFont: 'Open Sans',
    typography: {},
    darkMode: {},
    navTemplate: 'classic',
    navPosition: 'top',
    navBackground: '#ffffff',
    navTextColor: '#111111',
    borderRadius: '4px',
    linkColor: '#ff0000',
    linkHoverColor: '#cc0000',
    buttonStyle: {},
    faviconUrl: '',
    ogImageUrl: '',
    ...overrides,
  };
}

function defaultFetch(url: string, init?: RequestInit): FetchResp {
  const method = (init as RequestInit | undefined)?.method;
  if (/\/branding\/generate$/.test(url) && method === 'POST') {
    return makeRes({ success: true, data: { primaryColor: '#123456', tone: 'Professional and bold' } });
  }
  if (/\/branding$/.test(url) && method === 'PUT') {
    return makeRes({ success: true });
  }
  if (/\/branding$/.test(url) && !method) {
    return makeRes({ success: true, data: brandingData() });
  }
  return makeRes({ success: true });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url, init) => defaultFetch(url, init));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import BrandingPage from '@/app/portal/websites/[siteId]/branding/page';

// ─── Loading state ─────────────────────────────────────────────────────────────

describe('BrandingPage — loading state', () => {
  it('shows a spinner while the branding fetch is pending', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = render(React.createElement(BrandingPage));
    // The loading branch renders a material icon "refresh" + animate-spin
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('does not render tabs while loading', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = render(React.createElement(BrandingPage));
    expect(container.textContent).not.toContain('Logos');
  });
});

// ─── Happy-path render ─────────────────────────────────────────────────────────

describe('BrandingPage — happy-path render', () => {
  it('renders "Brand Guidelines" heading after load', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Brand Guidelines');
    });
  });

  it('renders "Website" eyebrow context label (site navigation context from PortalPageHeader)', async () => {
    // The back-to-site link was moved to the shared WebsiteSubNav layout component
    // (components/portal/WebsiteSubNav.tsx) during the portal redesign. The page
    // itself no longer renders an inline anchor; instead it shows a "Website" eyebrow
    // via PortalPageHeader so users know they are in a per-website context.
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Website');
    });
  });

  it('renders the four tabs: Logos, Colors, Typography, Style', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Logos');
      expect(container.textContent).toContain('Colors');
      expect(container.textContent).toContain('Typography');
      expect(container.textContent).toContain('Style');
    });
  });

  it('defaults to the Logos tab', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Square Logo');
    });
  });

  it('renders Save Changes button', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save Changes'),
      );
      expect(btn).toBeTruthy();
    });
  });
});

// ─── Save button state ─────────────────────────────────────────────────────────

describe('BrandingPage — save button', () => {
  it('Save button is disabled initially (form clean)', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save Changes'),
      ) as HTMLButtonElement | undefined;
      expect(btn).toBeTruthy();
      expect(btn!.disabled).toBe(true);
    });
  });

  it('Save button becomes enabled after editing the logo alt text field', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Logos');
    });

    // The logo alt text input has placeholder="Company name"
    const input = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (el) => (el as HTMLInputElement).placeholder === 'Company name',
    ) as HTMLInputElement | undefined;

    expect(input).toBeTruthy();
    act(() => {
      fireEvent.change(input!, { target: { value: 'New Corp' } });
    });

    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save Changes'),
      ) as HTMLButtonElement | undefined;
      expect(btn!.disabled).toBe(false);
    });
  });

  it('Save button fires a PUT request when clicked', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Logos');
    });

    // Make dirty
    const input = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (el) => (el as HTMLInputElement).placeholder === 'Company name',
    ) as HTMLInputElement;
    act(() => { fireEvent.change(input, { target: { value: 'Updated' } }); });

    // Click save
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save Changes'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(btn); });

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        ([u, i]) =>
          /\/branding$/.test(String(u)) && (i as RequestInit)?.method === 'PUT',
      );
      expect(putCalls.length).toBeGreaterThan(0);
    });
  });

  it('Save button is disabled again after a successful save (dirty reset)', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Logos');
    });

    const input = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (el) => (el as HTMLInputElement).placeholder === 'Company name',
    ) as HTMLInputElement;
    act(() => { fireEvent.change(input, { target: { value: 'Dirty' } }); });

    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save Changes'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(btn); });

    await waitFor(() => {
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save Changes'),
      ) as HTMLButtonElement | undefined;
      expect(saveBtn?.disabled).toBe(true);
    });
  });
});

// ─── Tab switching ─────────────────────────────────────────────────────────────

describe('BrandingPage — tab switching', () => {
  async function renderAndLoad() {
    const result = render(React.createElement(BrandingPage));
    await waitFor(() => {
      expect(result.container.textContent).toContain('Brand Guidelines');
    });
    return result;
  }

  function clickTab(container: HTMLElement, label: string) {
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label || b.textContent?.includes(label),
    );
    if (btn) act(() => { fireEvent.click(btn); });
  }

  it('switches to Colors tab and shows color fields', async () => {
    const { container } = await renderAndLoad();
    clickTab(container, 'Colors');
    await waitFor(() => {
      expect(container.textContent).toContain('Primary');
      expect(container.textContent).toContain('Secondary');
      expect(container.textContent).toContain('Accent');
    });
  });

  it('switches to Typography tab and shows font pickers', async () => {
    const { container } = await renderAndLoad();
    clickTab(container, 'Typography');
    await waitFor(() => {
      expect(container.textContent).toContain('Default Heading Font');
      expect(container.textContent).toContain('Default Body Font');
    });
  });

  it('switches to Style tab and shows Border Radius section', async () => {
    const { container } = await renderAndLoad();
    clickTab(container, 'Style');
    await waitFor(() => {
      expect(container.textContent).toContain('Border Radius');
    });
  });

  it('switching back to Logos shows logo content', async () => {
    const { container } = await renderAndLoad();
    clickTab(container, 'Colors');
    clickTab(container, 'Logos');
    await waitFor(() => {
      expect(container.textContent).toContain('Square Logo');
    });
  });
});

// ─── Colors tab ───────────────────────────────────────────────────────────────

describe('BrandingPage — Colors tab', () => {
  async function renderColors() {
    const result = render(React.createElement(BrandingPage));
    await waitFor(() => { expect(result.container.textContent).toContain('Brand Guidelines'); });
    const colorsBtn = Array.from(result.container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Colors'),
    );
    act(() => { fireEvent.click(colorsBtn!); });
    await waitFor(() => { expect(result.container.textContent).toContain('Primary'); });
    return result;
  }

  it('populates primary color text input from loaded data', async () => {
    const { container } = await renderColors();
    const inputs = Array.from(container.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    const primaryText = inputs.find((i) => i.value === '#ff0000');
    expect(primaryText).toBeTruthy();
  });

  it('color text input is editable and marks form dirty', async () => {
    const { container } = await renderColors();
    const inputs = Array.from(container.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    const primaryText = inputs.find((i) => i.value === '#ff0000')!;
    act(() => { fireEvent.change(primaryText, { target: { value: '#abcdef' } }); });
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save Changes'),
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });

  it('renders Light Mode and Dark Mode color preview sections', async () => {
    const { container } = await renderColors();
    await waitFor(() => {
      expect(container.textContent).toContain('Light Mode');
      expect(container.textContent).toContain('Dark Mode');
    });
  });

  it('renders Dark Mode Color Overrides section', async () => {
    const { container } = await renderColors();
    await waitFor(() => {
      expect(container.textContent).toContain('Dark Mode Color Overrides');
    });
  });
});

// ─── Style tab ────────────────────────────────────────────────────────────────

describe('BrandingPage — Style tab', () => {
  async function renderStyle() {
    const result = render(React.createElement(BrandingPage));
    await waitFor(() => { expect(result.container.textContent).toContain('Brand Guidelines'); });
    const styleBtn = Array.from(result.container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim().includes('Style') && !b.textContent?.includes('Button Style'),
    );
    act(() => { fireEvent.click(styleBtn!); });
    await waitFor(() => { expect(result.container.textContent).toContain('Border Radius'); });
    return result;
  }

  it('renders border radius preset buttons: Sharp, Subtle, Rounded, Pill', async () => {
    const { container } = await renderStyle();
    expect(container.textContent).toContain('Sharp');
    expect(container.textContent).toContain('Subtle');
    expect(container.textContent).toContain('Rounded');
    expect(container.textContent).toContain('Pill');
  });

  it('clicking a border radius preset marks form dirty', async () => {
    const { container } = await renderStyle();
    const sharpBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Sharp',
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(sharpBtn); });
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save Changes'),
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });

  it('renders custom border radius input with current value', async () => {
    const { container } = await renderStyle();
    const customInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (el) => (el as HTMLInputElement).value === '4px',
    ) as HTMLInputElement | undefined;
    expect(customInput).toBeTruthy();
  });

  it('renders Link Colors section', async () => {
    const { container } = await renderStyle();
    expect(container.textContent).toContain('Link Colors');
    expect(container.textContent).toContain('Link Color');
    expect(container.textContent).toContain('Link Hover Color');
  });

  it('renders Button Style section with filled/outline variants', async () => {
    const { container } = await renderStyle();
    expect(container.textContent).toContain('Button Style');
    expect(container.textContent).toContain('filled');
    expect(container.textContent).toContain('outline');
  });

  it('clicking filled variant marks form dirty', async () => {
    const { container } = await renderStyle();
    const filledBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'filled',
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(filledBtn); });
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save Changes'),
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });

  it('renders Favicon section', async () => {
    const { container } = await renderStyle();
    expect(container.textContent).toContain('Favicon');
  });

  it('renders Social / OG Image section', async () => {
    const { container } = await renderStyle();
    expect(container.textContent).toContain('Social / OG Image');
  });
});

// ─── Logo tab ─────────────────────────────────────────────────────────────────

describe('BrandingPage — Logos tab', () => {
  it('loads logo alt text from API response into the input', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      const input = Array.from(container.querySelectorAll('input[type="text"]')).find(
        (el) => (el as HTMLInputElement).value === 'Acme Corp',
      ) as HTMLInputElement | undefined;
      expect(input).toBeTruthy();
    });
  });

  it('loads logoText from API response and shows preview', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      // logoText is 'Acme', which renders a preview span showing the brand name
      const previewSpan = Array.from(container.querySelectorAll('span')).find(
        (s) => s.textContent?.trim() === 'Acme',
      );
      expect(previewSpan).toBeTruthy();
    });
  });

  it('renders MediaPicker for Square Logo', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      expect(container.querySelector('[data-testid="media-picker-Square Logo"]')).toBeTruthy();
    });
  });

  it('renders MediaPicker for Rectangle Logo', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      expect(container.querySelector('[data-testid="media-picker-Rectangle Logo"]')).toBeTruthy();
    });
  });

  it('clicking MediaPicker updates branding and marks form dirty', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      expect(container.querySelector('[data-testid="media-picker-trigger-Square Logo"]')).toBeTruthy();
    });
    act(() => {
      const trigger = container.querySelector('[data-testid="media-picker-trigger-Square Logo"]') as HTMLButtonElement;
      fireEvent.click(trigger);
    });
    await waitFor(() => {
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save Changes'),
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
  });

  it('renders Dark Mode Logo Overrides section', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Dark Mode Logo Overrides');
    });
  });
});

// ─── AI Brand Generator ────────────────────────────────────────────────────────

describe('BrandingPage — AI Brand Generator', () => {
  async function renderAndLoad() {
    const result = render(React.createElement(BrandingPage));
    await waitFor(() => { expect(result.container.textContent).toContain('Brand Guidelines'); });
    return result;
  }

  it('AI panel is collapsed by default (textarea not visible)', async () => {
    const { container } = await renderAndLoad();
    const textarea = container.querySelector('textarea');
    expect(textarea).toBeNull();
  });

  it('clicking AI Generator header expands the panel', async () => {
    const { container } = await renderAndLoad();
    const header = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('AI Brand Generator'),
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(header); });
    await waitFor(() => {
      expect(container.querySelector('textarea')).toBeTruthy();
    });
  });

  it('shows error when prompt is too short (< 10 chars)', async () => {
    const { container } = await renderAndLoad();

    // Expand panel
    const header = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('AI Brand Generator'),
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(header); });
    await waitFor(() => { expect(container.querySelector('textarea')).toBeTruthy(); });

    // Enter short prompt
    const textarea = container.querySelector('textarea')!;
    act(() => { fireEvent.change(textarea, { target: { value: 'Short' } }); });

    // Click Generate
    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate Brand Theme'),
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(generateBtn); });

    await waitFor(() => {
      expect(container.textContent).toContain('at least 10 characters');
    });
  });

  it('Generate button is disabled while prompt is empty', async () => {
    const { container } = await renderAndLoad();
    const header = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('AI Brand Generator'),
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(header); });
    await waitFor(() => { expect(container.querySelector('textarea')).toBeTruthy(); });

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate Brand Theme'),
    ) as HTMLButtonElement;
    expect(generateBtn.disabled).toBe(true);
  });

  it('calls generate API with description on valid prompt', async () => {
    const { container } = await renderAndLoad();
    const header = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('AI Brand Generator'),
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(header); });
    await waitFor(() => { expect(container.querySelector('textarea')).toBeTruthy(); });

    const textarea = container.querySelector('textarea')!;
    act(() => { fireEvent.change(textarea, { target: { value: 'We are a modern fintech startup targeting millennials.' } }); });

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate Brand Theme'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(generateBtn); });

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(
        ([u, i]) => /\/branding\/generate$/.test(String(u)) && (i as RequestInit)?.method === 'POST',
      );
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  it('applies generated primaryColor and marks form dirty', async () => {
    const { container } = await renderAndLoad();
    const header = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('AI Brand Generator'),
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(header); });
    await waitFor(() => { expect(container.querySelector('textarea')).toBeTruthy(); });

    const textarea = container.querySelector('textarea')!;
    act(() => { fireEvent.change(textarea, { target: { value: 'We are a modern fintech startup targeting millennials.' } }); });

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate Brand Theme'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(generateBtn); });

    // After generation the form should be dirty
    await waitFor(() => {
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save Changes'),
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
  });

  it('shows tone message returned from API', async () => {
    const { container } = await renderAndLoad();
    const header = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('AI Brand Generator'),
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(header); });
    await waitFor(() => { expect(container.querySelector('textarea')).toBeTruthy(); });

    const textarea = container.querySelector('textarea')!;
    act(() => { fireEvent.change(textarea, { target: { value: 'We are a modern fintech startup targeting millennials.' } }); });

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate Brand Theme'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(generateBtn); });

    await waitFor(() => {
      expect(container.textContent).toContain('Professional and bold');
    });
  });

  it('shows error message when generation API returns success=false', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (/\/branding\/generate$/.test(String(url)) && (init as RequestInit)?.method === 'POST') {
        return makeRes({ success: false, message: 'AI quota exceeded' });
      }
      return defaultFetch(url, init);
    });

    const { container } = await renderAndLoad();
    const header = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('AI Brand Generator'),
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(header); });
    await waitFor(() => { expect(container.querySelector('textarea')).toBeTruthy(); });

    const textarea = container.querySelector('textarea')!;
    act(() => { fireEvent.change(textarea, { target: { value: 'We are a modern fintech startup for enterprise.' } }); });

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate Brand Theme'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(generateBtn); });

    await waitFor(() => {
      expect(container.textContent).toContain('AI quota exceeded');
    });
  });

  it('shows "Network error" when generation fetch throws', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (/\/branding\/generate$/.test(String(url)) && (init as RequestInit)?.method === 'POST') {
        throw new Error('Connection refused');
      }
      return defaultFetch(url, init);
    });

    const { container } = await renderAndLoad();
    const header = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('AI Brand Generator'),
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(header); });
    await waitFor(() => { expect(container.querySelector('textarea')).toBeTruthy(); });

    const textarea = container.querySelector('textarea')!;
    act(() => { fireEvent.change(textarea, { target: { value: 'Enterprise SaaS brand with blue and grey tones.' } }); });

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate Brand Theme'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(generateBtn); });

    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });
});

// ─── API load: data hydration ─────────────────────────────────────────────────

describe('BrandingPage — API load / hydration', () => {
  it('fetches branding for the siteId from useParams', async () => {
    render(React.createElement(BrandingPage));
    await waitFor(() => {
      const getCalls = fetchMock.mock.calls.filter(
        ([u, i]) => /\/branding$/.test(String(u)) && !(i as RequestInit | undefined)?.method,
      );
      expect(getCalls.length).toBeGreaterThan(0);
      expect(String(getCalls[0][0])).toContain('site-99');
    });
  });

  it('handles success=false from load API without crashing', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (/\/branding$/.test(String(url)) && !(init as RequestInit | undefined)?.method) {
        return makeRes({ success: false, data: null });
      }
      return defaultFetch(url, init);
    });

    const { container } = render(React.createElement(BrandingPage));
    // Page should still load and render (falls back to DEFAULTS)
    await waitFor(() => {
      expect(container.textContent).toContain('Brand Guidelines');
    });
  });

  it('merges server data over defaults (logoAlt field appears)', async () => {
    const { container } = render(React.createElement(BrandingPage));
    await waitFor(() => {
      const input = Array.from(container.querySelectorAll('input[type="text"]')).find(
        (el) => (el as HTMLInputElement).value === 'Acme Corp',
      );
      expect(input).toBeTruthy();
    });
  });
});

// ─── Typography tab ───────────────────────────────────────────────────────────

describe('BrandingPage — Typography tab', () => {
  async function renderTypography() {
    const result = render(React.createElement(BrandingPage));
    await waitFor(() => { expect(result.container.textContent).toContain('Brand Guidelines'); });
    const typBtn = Array.from(result.container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Typography'),
    );
    act(() => { fireEvent.click(typBtn!); });
    await waitFor(() => { expect(result.container.textContent).toContain('Default Heading Font'); });
    return result;
  }

  it('shows element categories: Headings, Body Text, UI Elements', async () => {
    const { container } = await renderTypography();
    expect(container.textContent).toContain('Headings');
    expect(container.textContent).toContain('Body Text');
    expect(container.textContent).toContain('UI Elements');
  });

  it('shows individual typography elements like H1 and Paragraph', async () => {
    const { container } = await renderTypography();
    expect(container.textContent).toContain('H1');
    expect(container.textContent).toContain('Paragraph');
  });

  it('renders per-element font picker stubs', async () => {
    const { container } = await renderTypography();
    const fontPickers = container.querySelectorAll('[data-testid="google-font-picker"]');
    // At least 2: global heading + global body + some per-element pickers
    expect(fontPickers.length).toBeGreaterThan(1);
  });

  it('updating a font picker marks the form dirty', async () => {
    const { container } = await renderTypography();
    const selectBtns = Array.from(
      container.querySelectorAll('[data-testid="google-font-picker-select"]'),
    ) as HTMLButtonElement[];
    expect(selectBtns.length).toBeGreaterThan(0);
    act(() => { fireEvent.click(selectBtns[0]); });
    await waitFor(() => {
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save Changes'),
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
  });
});
