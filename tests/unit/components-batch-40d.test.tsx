// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// next/link — render a plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// next/navigation — capture router calls
const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

// react-markdown — render children inside a wrapper so we can introspect.
// The real component delegates to `components` mapping. To exercise the
// custom components map (h1/h2/p/code/etc), we render the prop and also
// invoke a few of its renderers directly inside tests below.
vi.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children, components }: any) => {
    // Expose the components map for direct invocation in tests via a
    // hidden data attribute is hard; instead attach to a global for tests.
    (globalThis as any).__lastMarkdownComponents = components;
    return React.createElement(
      'div',
      { 'data-testid': 'react-markdown' },
      typeof children === 'string' ? children : null,
    );
  },
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import PayInvoiceButton from '@/components/portal/PayInvoiceButton';
import CreateSnapshotButton from '@/components/portal/CreateSnapshotButton';
import { EnableBrainBanner } from '@/components/portal/EnableBrainBanner';
import MarkdownView from '@/components/portal/MarkdownView';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOnce(payload: any, ok = true) {
  (globalThis as any).fetch = vi.fn().mockResolvedValueOnce({
    ok,
    json: async () => payload,
  });
}

// Snapshot original window.location and restore after tests that overwrite it
const originalLocation = window.location;

beforeEach(() => {
  routerPush.mockReset();
  routerRefresh.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  // Restore location if any test stomped on it.
  // @ts-expect-error — test-only restoration
  if (window.location !== originalLocation) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  }
});

// ===========================================================================
// PayInvoiceButton
// ===========================================================================

describe('PayInvoiceButton', () => {
  it('renders the "Pay Now" CTA label and credit_card icon initially', () => {
    render(<PayInvoiceButton invoiceId={42} total={9900} />);
    expect(screen.getByRole('button', { name: /Pay Now/i })).toBeTruthy();
    // Initial render shows the credit_card material icon, not the spinner
    const icons = document.querySelectorAll('.material-icons');
    const labels = Array.from(icons).map((i) => i.textContent);
    expect(labels).toContain('credit_card');
    expect(labels).not.toContain('refresh');
  });

  it('redirects to the checkout URL on a successful payment-setup call', async () => {
    // Replace window.location with a writable stub
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });
    mockFetchOnce({ success: true, data: { url: 'https://stripe.example/pay-1' } });

    render(<PayInvoiceButton invoiceId={7} total={1000} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Pay Now/i }));
    });

    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      '/api/portal/invoices/7/checkout',
      { method: 'POST' },
    );
    await waitFor(() => {
      expect(window.location.href).toBe('https://stripe.example/pay-1');
    });
  });

  it('shows an error message on failed payment-setup with no URL', async () => {
    mockFetchOnce({ success: false, message: 'Card declined' });
    render(<PayInvoiceButton invoiceId={5} total={500} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Pay Now/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Card declined')).toBeTruthy();
    });
  });

  it('uses the fallback error string when the API returns no message', async () => {
    mockFetchOnce({ success: false });
    render(<PayInvoiceButton invoiceId={9} total={1} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Pay Now/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Payment setup failed/i)).toBeTruthy();
    });
  });
});

// ===========================================================================
// CreateSnapshotButton
// ===========================================================================

describe('CreateSnapshotButton', () => {
  it('renders the trigger with the photo_library icon and default label', () => {
    render(<CreateSnapshotButton siteId={11} />);
    const btn = screen.getByRole('button', { name: /Create snapshot/i });
    expect(btn).toBeTruthy();
    const icon = btn.querySelector('.material-icons');
    expect(icon?.textContent).toBe('photo_library');
  });

  it('aborts silently when the prompt is cancelled (returns null)', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    const fetchSpy = vi.fn();
    (globalThis as any).fetch = fetchSpy;

    render(<CreateSnapshotButton siteId={22} siteName="MySite" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create snapshot/i }));
    });

    expect(promptSpy).toHaveBeenCalledWith('Snapshot name', 'MySite snapshot');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('POSTs the snapshot and routes to /portal/snapshots on success', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Backup 1');
    mockFetchOnce({ success: true });

    render(<CreateSnapshotButton siteId={101} siteName="Acme" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create snapshot/i }));
    });

    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      '/api/portal/sites/101/export',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Backup 1' }),
      }),
    );
    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith('/portal/snapshots');
    });
  });

  it('alerts the user and does not navigate when the API returns failure', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Try');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    (globalThis as any).fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, message: 'boom' }),
    });

    render(<CreateSnapshotButton siteId={2} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create snapshot/i }));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Export failed: boom');
    });
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('falls back to the generic site-snapshot default when no siteName is provided', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    render(<CreateSnapshotButton siteId={3} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create snapshot/i }));
    });
    expect(promptSpy).toHaveBeenCalledWith('Snapshot name', 'Site snapshot');
  });
});

// ===========================================================================
// EnableBrainBanner
// ===========================================================================

describe('EnableBrainBanner', () => {
  it('renders the call-to-action heading and an Enable button', () => {
    render(<EnableBrainBanner />);
    expect(screen.getByText(/Turn this dashboard into a command center/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Enable Company Brain/i })).toBeTruthy();
  });

  it('renders a "Learn more" link to /portal/brain', () => {
    render(<EnableBrainBanner />);
    const link = screen.getByRole('link', { name: /Learn more/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/portal/brain');
  });

  it('refreshes the router when enable succeeds', async () => {
    mockFetchOnce({ success: true });
    render(<EnableBrainBanner />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enable Company Brain/i }));
    });
    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      '/api/portal/brain/settings',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      }),
    );
    await waitFor(() => {
      expect(routerRefresh).toHaveBeenCalled();
    });
  });

  it('shows the API-provided error when enable fails', async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, message: 'No quota' }),
    });
    render(<EnableBrainBanner />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enable Company Brain/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('No quota')).toBeTruthy();
    });
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it('falls back to a generic error when fetch throws', async () => {
    (globalThis as any).fetch = vi.fn().mockRejectedValueOnce(new Error('Network down'));
    render(<EnableBrainBanner />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enable Company Brain/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeTruthy();
    });
  });

  it('falls back to the default error string when API returns no message', async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false }),
    });
    render(<EnableBrainBanner />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enable Company Brain/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Failed to enable Company Brain/i)).toBeTruthy();
    });
  });
});

// ===========================================================================
// MarkdownView
// ===========================================================================

describe('MarkdownView', () => {
  it('renders the markdown source via react-markdown', () => {
    render(<MarkdownView>hello world</MarkdownView>);
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toBe('hello world');
  });

  it('forwards a custom className onto the outer wrapper', () => {
    const { container } = render(
      <MarkdownView className="prose-x">body</MarkdownView>,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toBe('prose-x');
  });

  it('exposes a complete components map (h1..h4, p, ul, ol, li, code, pre, blockquote, hr, a, table, th, td)', () => {
    render(<MarkdownView>x</MarkdownView>);
    const comps = (globalThis as any).__lastMarkdownComponents;
    expect(comps).toBeTruthy();
    for (const key of [
      'h1', 'h2', 'h3', 'h4', 'p', 'strong', 'em',
      'ul', 'ol', 'li', 'code', 'pre', 'blockquote',
      'hr', 'a', 'table', 'th', 'td',
    ]) {
      expect(typeof comps[key]).toBe('function');
    }
  });

  it('inline code wraps children in a <code> tag with inline styling classes', () => {
    render(<MarkdownView>x</MarkdownView>);
    const comps = (globalThis as any).__lastMarkdownComponents;
    const el = comps.code({ className: undefined, children: 'inline()' });
    const { container } = render(el);
    const code = container.querySelector('code')!;
    expect(code.textContent).toBe('inline()');
    expect(code.className).toMatch(/bg-muted/);
    expect(code.className).not.toMatch(/block/);
  });

  it('block code (language-*) renders as a block-level code element', () => {
    render(<MarkdownView>x</MarkdownView>);
    const comps = (globalThis as any).__lastMarkdownComponents;
    const el = comps.code({ className: 'language-ts', children: 'const x = 1' });
    const { container } = render(el);
    const code = container.querySelector('code')!;
    expect(code.className).toMatch(/block/);
    expect(code.className).toMatch(/p-3/);
  });

  it('links open in a new tab with rel noopener noreferrer', () => {
    render(<MarkdownView>x</MarkdownView>);
    const comps = (globalThis as any).__lastMarkdownComponents;
    const el = comps.a({ href: 'https://example.com', children: 'site' });
    const { container } = render(el);
    const a = container.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://example.com');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('highlights @mentions inside paragraphs when highlightMentions is true', () => {
    render(<MarkdownView highlightMentions>x</MarkdownView>);
    const comps = (globalThis as any).__lastMarkdownComponents;
    const el = comps.p({ children: 'hello @alice and @bob' });
    const { container } = render(el);
    const strongs = container.querySelectorAll('strong');
    const labels = Array.from(strongs).map((s) => s.textContent);
    expect(labels).toContain('@alice');
    expect(labels).toContain('@bob');
  });

  it('does NOT highlight @mentions when highlightMentions is false (default)', () => {
    render(<MarkdownView>x</MarkdownView>);
    const comps = (globalThis as any).__lastMarkdownComponents;
    const el = comps.p({ children: 'hi @alice' });
    const { container } = render(el);
    expect(container.querySelectorAll('strong').length).toBe(0);
    expect(container.textContent).toBe('hi @alice');
  });
});
