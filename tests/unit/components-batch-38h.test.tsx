// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy / next-auth / next/navigation dependencies
// ---------------------------------------------------------------------------

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="next-auth-session-provider">{children}</div>
  ),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// SessionProvider component under test
import SessionProvider from '@/components/SessionProvider';

// SEO component under test
import { StructuredData } from '@/components/seo/StructuredData';

// Portal CopyableSiteId component (default export)
import CopyableSiteId from '@/components/portal/CopyableSiteId';

// Peters Outdoor CTA component
import { PetersFooterCTA } from '@/components/peters-outdoor/PetersFooterCTA';

// ---------------------------------------------------------------------------
// SessionProvider
// ---------------------------------------------------------------------------

describe('SessionProvider', () => {
  it('wraps children inside the NextAuthSessionProvider', () => {
    render(
      <SessionProvider>
        <p data-testid="child">hello</p>
      </SessionProvider>,
    );

    const wrapper = screen.getByTestId('next-auth-session-provider');
    expect(wrapper).toBeTruthy();
    expect(wrapper.querySelector('[data-testid="child"]')?.textContent).toBe('hello');
  });

  it('renders multiple children', () => {
    render(
      <SessionProvider>
        <span data-testid="a">a</span>
        <span data-testid="b">b</span>
      </SessionProvider>,
    );

    expect(screen.getByTestId('a').textContent).toBe('a');
    expect(screen.getByTestId('b').textContent).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// StructuredData
// ---------------------------------------------------------------------------

describe('StructuredData', () => {
  it('renders a script tag with application/ld+json', () => {
    const { container } = render(
      <StructuredData data={{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' }} />,
    );

    const script = container.querySelector('script');
    expect(script).toBeTruthy();
    expect(script?.getAttribute('type')).toBe('application/ld+json');
  });

  it('serializes the data object to JSON in the script body', () => {
    const data = { foo: 'bar', n: 42, nested: { ok: true } };
    const { container } = render(<StructuredData data={data} />);

    const script = container.querySelector('script');
    const body = script?.innerHTML ?? '';
    // innerHTML reflects what dangerouslySetInnerHTML wrote
    expect(JSON.parse(body)).toEqual(data);
  });

  it('handles an empty object', () => {
    const { container } = render(<StructuredData data={{}} />);
    const script = container.querySelector('script');
    expect(script?.innerHTML).toBe('{}');
  });
});

// ---------------------------------------------------------------------------
// CopyableSiteId
// ---------------------------------------------------------------------------

describe('CopyableSiteId', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the provided site id and an idle Copy button', () => {
    render(<CopyableSiteId siteId={1234} />);

    expect(screen.getByText('1234')).toBeTruthy();
    expect(screen.getByText('Site ID')).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy/i })).toBeTruthy();
  });

  it('copies the id to the clipboard when the button is clicked and shows Copied', () => {
    render(<CopyableSiteId siteId={99} />);

    const button = screen.getByRole('button', { name: /copy/i });
    fireEvent.click(button);

    expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('99');
    expect(screen.getByText('Copied')).toBeTruthy();
  });

  it('reverts back to Copy after 2 seconds', () => {
    render(<CopyableSiteId siteId={7} />);

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Copied')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('Copy')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PetersFooterCTA
// ---------------------------------------------------------------------------

describe('PetersFooterCTA', () => {
  it('renders the headline copy', () => {
    render(<PetersFooterCTA />);
    expect(screen.getByText('Ready for Your Next Adventure?')).toBeTruthy();
  });

  it('renders supporting body copy', () => {
    render(<PetersFooterCTA />);
    expect(
      screen.getByText(/Book a guided kayak eco-tour/i),
    ).toBeTruthy();
  });

  it('renders a link to /p/booking with the CTA label', () => {
    render(<PetersFooterCTA />);
    const link = screen.getByRole('link', { name: /book your tour today/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/p/booking');
  });
});
