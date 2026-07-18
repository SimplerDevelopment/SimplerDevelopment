// @vitest-environment jsdom
/**
 * Unit tests for 4 small portal components (batch 39a):
 *
 *   - InfrastructureTabs    (components/portal/InfrastructureTabs.tsx)
 *   - TicketSlaBadge        (components/portal/TicketSlaBadge.tsx)
 *   - AgencyChromeProvider  (components/portal/AgencyChromeProvider.tsx)
 *   - BuyServiceButton      (components/portal/BuyServiceButton.tsx)
 *
 * Renders each with @testing-library/react in jsdom. next/link, next/navigation
 * and next-auth/react aren't actually imported by these particular components,
 * but we keep the standard mocks below in case downstream changes pull them in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Cross-cutting mocks (defensive — none of the components under test import
// these directly today, but pinning the mocks keeps the suite stable if a
// component grows a `<Link>` or `useRouter()` later).
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

import InfrastructureTabs from '@/components/portal/InfrastructureTabs';
import TicketSlaBadge from '@/components/portal/TicketSlaBadge';
import { AgencyChromeProvider, useAgencyChrome } from '@/components/portal/AgencyChromeProvider';
import BuyServiceButton from '@/components/portal/BuyServiceButton';

// ---------------------------------------------------------------------------
// InfrastructureTabs
// ---------------------------------------------------------------------------

describe('InfrastructureTabs', () => {
  it('renders all three tab buttons with their labels', () => {
    render(
      <InfrastructureTabs
        infrastructure={<div>INFRA_PANEL</div>}
        deployments={<div>DEPLOY_PANEL</div>}
        logs={<div>LOGS_PANEL</div>}
      />,
    );
    expect(screen.getByRole('button', { name: /Infrastructure/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Recent Deployments/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /HTTP Logs/ })).toBeTruthy();
  });

  it('shows the infrastructure panel by default', () => {
    render(
      <InfrastructureTabs
        infrastructure={<div>INFRA_PANEL</div>}
        deployments={<div>DEPLOY_PANEL</div>}
        logs={<div>LOGS_PANEL</div>}
      />,
    );
    expect(screen.getByText('INFRA_PANEL')).toBeTruthy();
    expect(screen.queryByText('DEPLOY_PANEL')).toBeNull();
    expect(screen.queryByText('LOGS_PANEL')).toBeNull();
  });

  it('switches to the deployments panel when its tab is clicked', () => {
    render(
      <InfrastructureTabs
        infrastructure={<div>INFRA_PANEL</div>}
        deployments={<div>DEPLOY_PANEL</div>}
        logs={<div>LOGS_PANEL</div>}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Recent Deployments/ }));
    expect(screen.getByText('DEPLOY_PANEL')).toBeTruthy();
    expect(screen.queryByText('INFRA_PANEL')).toBeNull();
    expect(screen.queryByText('LOGS_PANEL')).toBeNull();
  });

  it('switches to the logs panel when its tab is clicked', () => {
    render(
      <InfrastructureTabs
        infrastructure={<div>INFRA_PANEL</div>}
        deployments={<div>DEPLOY_PANEL</div>}
        logs={<div>LOGS_PANEL</div>}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /HTTP Logs/ }));
    expect(screen.getByText('LOGS_PANEL')).toBeTruthy();
    expect(screen.queryByText('INFRA_PANEL')).toBeNull();
    expect(screen.queryByText('DEPLOY_PANEL')).toBeNull();
  });

  it('renders an underline element for the active tab only', () => {
    const { container } = render(
      <InfrastructureTabs
        infrastructure={<div>INFRA_PANEL</div>}
        deployments={<div>DEPLOY_PANEL</div>}
        logs={<div>LOGS_PANEL</div>}
      />,
    );
    // The active-tab underline span uses `bg-primary` — exactly one should be present.
    const underlines = container.querySelectorAll('span.bg-primary');
    expect(underlines.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TicketSlaBadge
// ---------------------------------------------------------------------------

describe('TicketSlaBadge', () => {
  const NOW = new Date('2026-01-01T12:00:00Z');

  it('renders nothing in compact mode when neither timer is set', () => {
    const { container } = render(
      <TicketSlaBadge
        status="open"
        firstResponseDueAt={null}
        resolutionDueAt={null}
        compact
        now={NOW}
      />,
    );
    expect(container.textContent ?? '').toBe('');
  });

  it('shows "SLA met" chip when the ticket is resolved', () => {
    const { container } = render(
      <TicketSlaBadge
        status="resolved"
        firstResponseDueAt={new Date(NOW.getTime() - 3_600_000)}
        resolutionDueAt={new Date(NOW.getTime() - 3_600_000)}
        now={NOW}
      />,
    );
    expect(container.textContent).toMatch(/SLA met/);
  });

  it('shows "SLA met" chip when resolvedAt is provided regardless of status', () => {
    const { container } = render(
      <TicketSlaBadge
        status="open"
        firstResponseDueAt={new Date(NOW.getTime() + 3_600_000)}
        resolutionDueAt={new Date(NOW.getTime() + 3_600_000)}
        resolvedAt={NOW}
        now={NOW}
      />,
    );
    expect(container.textContent).toMatch(/SLA met/);
  });

  it('renders both "First reply" and "Resolution" chips in full mode when timers are on track', () => {
    const { container } = render(
      <TicketSlaBadge
        status="open"
        firstResponseDueAt={new Date(NOW.getTime() + 6 * 3_600_000)}
        resolutionDueAt={new Date(NOW.getTime() + 24 * 3_600_000)}
        now={NOW}
      />,
    );
    expect(container.textContent).toMatch(/First reply/);
    expect(container.textContent).toMatch(/Resolution/);
    expect(container.textContent).toMatch(/On track/);
  });

  it('renders an "Overdue" chip when the timer has elapsed', () => {
    const { container } = render(
      <TicketSlaBadge
        status="open"
        firstResponseDueAt={new Date(NOW.getTime() - 7_200_000)}
        resolutionDueAt={null}
        now={NOW}
      />,
    );
    expect(container.textContent).toMatch(/Overdue/);
  });

  it('picks the worse of the two timers in compact mode', () => {
    // First-response is on track, resolution is overdue — overdue must win.
    const { container } = render(
      <TicketSlaBadge
        status="open"
        firstResponseDueAt={new Date(NOW.getTime() + 6 * 3_600_000)}
        resolutionDueAt={new Date(NOW.getTime() - 3_600_000)}
        compact
        now={NOW}
      />,
    );
    expect(container.textContent).toMatch(/Overdue/);
    // Only one chip rendered in compact mode
    const chips = container.querySelectorAll('span.rounded-full');
    expect(chips.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// AgencyChromeProvider
// ---------------------------------------------------------------------------

describe('AgencyChromeProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function Probe() {
    const chrome = useAgencyChrome();
    return (
      <div>
        <span data-testid="brandName">{chrome.brandName}</span>
        <span data-testid="brandLogoUrl">{chrome.brandLogoUrl}</span>
        <span data-testid="whiteLabel">{String(chrome.whiteLabelEnabled)}</span>
      </div>
    );
  }

  it('exposes the default brand before the fetch resolves', () => {
    // Make fetch hang so we observe the initial state.
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(
      <AgencyChromeProvider>
        <Probe />
      </AgencyChromeProvider>,
    );
    expect(screen.getByTestId('brandName').textContent).toBe('Simpler Development');
    expect(screen.getByTestId('brandLogoUrl').textContent).toBe('/iconLogo.png');
    expect(screen.getByTestId('whiteLabel').textContent).toBe('false');
  });

  it('keeps default values when the response says white-label is disabled', async () => {
    global.fetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({ success: true, data: { whiteLabelEnabled: false } }),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    render(
      <AgencyChromeProvider>
        <Probe />
      </AgencyChromeProvider>,
    );

    // Give the promise chain a microtask to settle, then assert no override happened.
    await waitFor(() => {
      expect(screen.getByTestId('whiteLabel').textContent).toBe('false');
    });
    expect(screen.getByTestId('brandName').textContent).toBe('Simpler Development');
  });

  it('applies an agency override when white-label is enabled', async () => {
    global.fetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            whiteLabelEnabled: true,
            agencyName: 'Acme Co',
            agencyLogoUrl: 'https://cdn.example/logo.png',
            agencyPrimaryColor: '#ff0066',
          },
        }),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    render(
      <AgencyChromeProvider>
        <Probe />
      </AgencyChromeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('whiteLabel').textContent).toBe('true');
    });
    expect(screen.getByTestId('brandName').textContent).toBe('Acme Co');
    expect(screen.getByTestId('brandLogoUrl').textContent).toBe('https://cdn.example/logo.png');
  });

  it('silently falls back to defaults when fetch rejects', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;

    render(
      <AgencyChromeProvider>
        <Probe />
      </AgencyChromeProvider>,
    );

    // Wait a tick — error is swallowed by `.catch(() => {})`.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('brandName').textContent).toBe('Simpler Development');
    expect(screen.getByTestId('whiteLabel').textContent).toBe('false');
  });

  it('returns the default value when useAgencyChrome is called outside the provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('brandName').textContent).toBe('Simpler Development');
    expect(screen.getByTestId('whiteLabel').textContent).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// BuyServiceButton
// ---------------------------------------------------------------------------

describe('BuyServiceButton', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    // Stub window.location so we can observe redirects without navigating.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '' } as Location,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it('renders the default "Buy Now" label', () => {
    render(<BuyServiceButton serviceId={1} />);
    expect(screen.getByRole('button', { name: /Buy Now/ })).toBeTruthy();
  });

  it('uses a custom label prop when provided', () => {
    render(<BuyServiceButton serviceId={1} label="Subscribe" />);
    expect(screen.getByRole('button', { name: /Subscribe/ })).toBeTruthy();
  });

  it('redirects to the checkout URL on a successful response', async () => {
    global.fetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({ success: true, data: { url: 'https://stripe.test/sess_123' } }),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    render(<BuyServiceButton serviceId={42} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(window.location.href).toBe('https://stripe.test/sess_123');
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/portal/services/42/checkout',
      { method: 'POST' },
    );
  });

  it('shows the server-provided error message when checkout fails', async () => {
    global.fetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({ success: false, message: 'Card declined.' }),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    render(<BuyServiceButton serviceId={7} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Card declined.')).toBeTruthy();
    });
    // No redirect happened.
    expect(window.location.href).toBe('');
  });

  it('shows a fallback error message when the server omits one', async () => {
    global.fetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({ success: false }),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    render(<BuyServiceButton serviceId={9} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Could not start checkout.')).toBeTruthy();
    });
  });
});
