// @vitest-environment jsdom
import React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy deps
// ---------------------------------------------------------------------------

// next/link -> plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// next/navigation router (used by UploadHtmlPageButton + ProvisioningStatus)
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal',
  useSearchParams: () => new URLSearchParams(),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import CreditBalance from '@/components/portal/CreditBalance';
import ServicePaywall from '@/components/portal/ServicePaywall';
import UploadHtmlPageButton from '@/components/portal/UploadHtmlPageButton';
import ProvisioningStatus from '@/components/portal/ProvisioningStatus';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function mockFetchOnce(value: any, ok = true) {
  const fetchSpy = vi.fn().mockResolvedValueOnce({
    ok,
    json: async () => value,
  });
  // @ts-expect-error - test override
  globalThis.fetch = fetchSpy;
  return fetchSpy;
}

function mockFetchSequence(responses: Array<{ value: any; ok?: boolean }>) {
  const fetchSpy = vi.fn();
  for (const r of responses) {
    fetchSpy.mockResolvedValueOnce({
      ok: r.ok ?? true,
      json: async () => r.value,
    });
  }
  // @ts-expect-error - test override
  globalThis.fetch = fetchSpy;
  return fetchSpy;
}

function flushMicrotasks() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  pushMock.mockReset();
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// CreditBalance
// ---------------------------------------------------------------------------
describe('CreditBalance', () => {
  it('renders null while data is still loading', async () => {
    let resolveFetch: (v: any) => void = () => {};
    const pending = new Promise((res) => {
      resolveFetch = res;
    });
    // @ts-expect-error - test override
    globalThis.fetch = vi.fn().mockReturnValueOnce(pending);

    const { container } = render(<CreditBalance />);
    // Before fetch resolves, component returns null
    expect(container.firstChild).toBeNull();

    // resolve the promise so the unmount doesn't leak — value still triggers
    // the no-services early-return path
    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({
          balance: 0,
          monthlyGrant: 0,
          payAsYouGo: false,
          monthlyUsage: 0,
          packages: [],
        }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('hides itself when the client has no AI services (balance and grant both 0)', async () => {
    mockFetchOnce({
      balance: 0,
      monthlyGrant: 0,
      payAsYouGo: false,
      monthlyUsage: 0,
      packages: [],
    });

    const { container } = render(<CreditBalance />);
    await flushMicrotasks();
    expect(container.firstChild).toBeNull();
  });

  it('formats tokens with K/M suffixes and shows packages + PAYG status', async () => {
    mockFetchOnce({
      balance: 1_500_000, // -> "1.5M"
      monthlyGrant: 2_000_000,
      monthlyUsage: 500_000,
      payAsYouGo: true,
      packages: [
        { id: 1, name: 'Small', tokens: 50_000, price: 500 }, // -> "+50K $5"
        { id: 2, name: 'Med', tokens: 250_000, price: 2000 },
        { id: 3, name: 'Lg', tokens: 1_000_000, price: 5000 },
        { id: 4, name: 'XL', tokens: 5_000_000, price: 20_000 }, // sliced off
      ],
    });

    const { container } = render(<CreditBalance />);
    await flushMicrotasks();

    expect(container.textContent).toContain('1.5M');
    expect(container.textContent).toContain('tokens remaining');
    // monthly grant + usage formatted
    expect(container.textContent).toContain('2.0M monthly grant');
    expect(container.textContent).toContain('500K used this month');
    // PAYG chip reflects ON state
    expect(container.textContent).toContain('PAYG On');
    // 3 packages -> XL is excluded
    expect(container.textContent).toContain('+50K $5');
    expect(container.textContent).not.toContain('+5.0M');
  });

  it('renders without monthly grant usage bar when grant is 0 but balance > 0', async () => {
    mockFetchOnce({
      balance: 10_000,
      monthlyGrant: 0,
      monthlyUsage: 0,
      payAsYouGo: false,
      packages: [],
    });

    const { container } = render(<CreditBalance />);
    await flushMicrotasks();

    expect(container.textContent).toContain('10K');
    expect(container.textContent).not.toContain('monthly grant');
    expect(container.textContent).toContain('PAYG Off');
  });

  it('toggles pay-as-you-go via the PAYG button', async () => {
    const fetchSpy = mockFetchSequence([
      {
        value: {
          balance: 1000,
          monthlyGrant: 5000,
          monthlyUsage: 100,
          payAsYouGo: false,
          packages: [],
        },
      },
      { value: { payAsYouGo: true } }, // toggle endpoint
    ]);

    render(<CreditBalance />);
    await flushMicrotasks();

    const paygBtn = screen.getByText('PAYG Off');
    await act(async () => {
      fireEvent.click(paygBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondCall = fetchSpy.mock.calls[1];
    expect(secondCall[0]).toBe('/api/portal/credits/pay-as-you-go');
    expect(secondCall[1].method).toBe('POST');
    expect(JSON.parse(secondCall[1].body)).toEqual({ enabled: true });

    await waitFor(() => {
      expect(screen.getByText('PAYG On')).toBeTruthy();
    });
  });

  it('redirects to the checkout url after a successful package purchase', async () => {
    const fetchSpy = mockFetchSequence([
      {
        value: {
          balance: 1000,
          monthlyGrant: 0,
          monthlyUsage: 0,
          payAsYouGo: false,
          packages: [{ id: 7, name: 'Pack', tokens: 100, price: 1000 }],
        },
      },
      { value: { url: 'https://checkout.example/foo' } },
    ]);

    // Stub window.location.href setter
    const originalLocation = window.location;
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new Proxy(originalLocation, {
        set(_t, prop, val) {
          if (prop === 'href') {
            hrefSetter(val);
            return true;
          }
          return Reflect.set(_t, prop, val);
        },
        get(t, prop) {
          // @ts-expect-error - proxy passthrough
          return t[prop];
        },
      }),
    });

    try {
      render(<CreditBalance />);
      await flushMicrotasks();

      const buyBtn = screen.getByText(/\+100 \$10/);
      await act(async () => {
        fireEvent.click(buyBtn);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(fetchSpy.mock.calls[1][0]).toBe('/api/portal/credits/purchase');
      expect(JSON.parse(fetchSpy.mock.calls[1][1].body)).toEqual({
        packageId: 7,
      });
      await waitFor(() => {
        expect(hrefSetter).toHaveBeenCalledWith('https://checkout.example/foo');
      });
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// ServicePaywall
// ---------------------------------------------------------------------------
describe('ServicePaywall', () => {
  const baseProps = {
    serviceName: 'Premium Plan',
    serviceDescription: 'All the features',
    price: 4999,
    billingCycle: 'monthly',
    features: ['Feature A', 'Feature B', 'Feature C'],
    serviceId: 42,
    icon: 'star',
  };

  it('formats price with /mo suffix for monthly billing', () => {
    const { container } = render(<ServicePaywall {...baseProps} />);
    expect(container.textContent).toContain('Premium Plan');
    expect(container.textContent).toContain('All the features');
    expect(container.textContent).toContain('$49.99');
    expect(container.textContent).toContain('/mo');
  });

  it('formats price with /yr suffix for yearly billing', () => {
    const { container } = render(
      <ServicePaywall {...baseProps} billingCycle="yearly" />,
    );
    expect(container.textContent).toContain('/yr');
  });

  it('omits the per-period suffix when billingCycle is "once"', () => {
    const { container } = render(
      <ServicePaywall {...baseProps} billingCycle="once" />,
    );
    expect(container.textContent).toContain('$49.99');
    expect(container.textContent).not.toContain('/mo');
    expect(container.textContent).not.toContain('/yr');
  });

  it('omits the description block when serviceDescription is null', () => {
    const { container } = render(
      <ServicePaywall {...baseProps} serviceDescription={null} />,
    );
    expect(container.textContent).not.toContain('All the features');
  });

  it('renders every feature in the bullet list', () => {
    const { container } = render(<ServicePaywall {...baseProps} />);
    for (const f of baseProps.features) {
      expect(container.textContent).toContain(f);
    }
    const items = container.querySelectorAll('ul li');
    expect(items.length).toBe(3);
  });

  it('omits the feature list when features is empty', () => {
    const { container } = render(
      <ServicePaywall {...baseProps} features={[]} />,
    );
    expect(container.querySelector('ul')).toBeNull();
  });

  it('links back to the all-services index', () => {
    const { container } = render(<ServicePaywall {...baseProps} />);
    const link = container.querySelector('a[href="/portal/services"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain('View all services');
  });

  it('calls the checkout endpoint and redirects on successful subscription', async () => {
    const fetchSpy = mockFetchOnce({
      success: true,
      data: { url: 'https://stripe.example/abc' },
    });

    const originalLocation = window.location;
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new Proxy(originalLocation, {
        set(_t, prop, val) {
          if (prop === 'href') {
            hrefSetter(val);
            return true;
          }
          return Reflect.set(_t, prop, val);
        },
        get(t, prop) {
          // @ts-expect-error - proxy passthrough
          return t[prop];
        },
      }),
    });

    try {
      render(<ServicePaywall {...baseProps} />);
      const btn = screen.getByText('Subscribe Now');
      await act(async () => {
        fireEvent.click(btn);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/portal/services/42/checkout',
        { method: 'POST' },
      );
      await waitFor(() => {
        expect(hrefSetter).toHaveBeenCalledWith('https://stripe.example/abc');
      });
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('does not redirect when the checkout response signals failure', async () => {
    mockFetchOnce({ success: false, data: {} });

    render(<ServicePaywall {...baseProps} />);
    const btn = screen.getByText('Subscribe Now');
    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
      await Promise.resolve();
    });

    // button is back to enabled state (loading flag flipped off in finally)
    await waitFor(() => {
      expect(screen.getByText('Subscribe Now')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// UploadHtmlPageButton
// ---------------------------------------------------------------------------
describe('UploadHtmlPageButton', () => {
  it('renders the default idle label and accepts html/zip', () => {
    const { container } = render(<UploadHtmlPageButton siteId={3} />);
    const btn = container.querySelector('button');
    expect(btn?.textContent).toContain('Upload HTML / Zip');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain('.html');
    expect(input.accept).toContain('.zip');
  });

  it('clicking the button forwards to the hidden file input click()', () => {
    const { container } = render(<UploadHtmlPageButton siteId={3} />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const inputClickSpy = vi.spyOn(input, 'click');
    const btn = container.querySelector('button') as HTMLButtonElement;
    fireEvent.click(btn);
    expect(inputClickSpy).toHaveBeenCalled();
  });

  it('uploads the file, navigates to the editor, and resets input value on success', async () => {
    const fetchSpy = mockFetchOnce({
      success: true,
      data: { id: 99 },
    });

    const { container } = render(<UploadHtmlPageButton siteId={5} />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(['<html></html>'], 'page.html', {
      type: 'text/html',
    });

    await act(async () => {
      // jsdom doesn't natively let you assign to FileList; use Object.defineProperty
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [file],
      });
      fireEvent.change(input);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      '/api/portal/cms/websites/5/posts/upload-html',
    );
    expect(fetchSpy.mock.calls[0][1].method).toBe('POST');
    expect(fetchSpy.mock.calls[0][1].body).toBeInstanceOf(FormData);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        '/portal/websites/5/posts/99/edit',
      );
    });
  });

  it('alerts when the upload response is not ok', async () => {
    // @ts-expect-error - test override
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, message: 'too big' }),
    });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const { container } = render(<UploadHtmlPageButton siteId={1} />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(['x'], 'page.html', { type: 'text/html' });

    await act(async () => {
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [file],
      });
      fireEvent.change(input);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    expect(alertSpy.mock.calls[0][0]).toContain('Upload failed');
    expect(alertSpy.mock.calls[0][0]).toContain('too big');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does nothing when the change event fires without a selected file', () => {
    const fetchSpy = vi.fn();
    // @ts-expect-error - test override
    globalThis.fetch = fetchSpy;

    const { container } = render(<UploadHtmlPageButton siteId={2} />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [],
    });
    fireEvent.change(input);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ProvisioningStatus
// ---------------------------------------------------------------------------
describe('ProvisioningStatus', () => {
  it('renders null while initial status is still loading', () => {
    let resolveFetch: (v: any) => void = () => {};
    const pending = new Promise((res) => {
      resolveFetch = res;
    });
    // @ts-expect-error - test override
    globalThis.fetch = vi.fn().mockReturnValueOnce(pending);

    const { container } = render(<ProvisioningStatus siteId={1} />);
    expect(container.firstChild).toBeNull();

    // Cleanup
    resolveFetch({ ok: true, json: async () => ({ success: false }) });
  });

  it('renders the pending "Deploy Now" panel when deploymentStatus is null', async () => {
    mockFetchOnce({
      success: true,
      data: {
        deploymentStatus: null,
        subdomain: 'acme',
        fullDomain: null,
        githubRepoName: null,
        githubRepoUrl: null,
        vercelProjectId: null,
        vercelProjectUrl: null,
        vercelDomain: null,
        lastDeployedAt: null,
        provisionError: null,
      },
    });

    const { container } = render(<ProvisioningStatus siteId={11} />);
    await flushMicrotasks();
    expect(container.textContent).toContain('Deploy your website');
    expect(container.textContent).toContain(
      'acme.simplerdevelopment.com subdomain',
    );
    expect(container.textContent).toContain('Deploy Now');
  });

  it('clicking Deploy Now POSTs to the provision endpoint and refetches', async () => {
    const fetchSpy = mockFetchSequence([
      {
        value: {
          success: true,
          data: {
            deploymentStatus: 'pending',
            subdomain: 'foo',
            fullDomain: null,
            githubRepoName: null,
            githubRepoUrl: null,
            vercelProjectId: null,
            vercelProjectUrl: null,
            vercelDomain: null,
            lastDeployedAt: null,
            provisionError: null,
          },
        },
      },
      { value: { success: true } }, // provision call
      {
        value: {
          success: true,
          data: {
            deploymentStatus: 'provisioning',
            subdomain: 'foo',
            fullDomain: null,
            githubRepoName: 'foo-repo',
            githubRepoUrl: 'https://github.com/x/foo-repo',
            vercelProjectId: null,
            vercelProjectUrl: null,
            vercelDomain: null,
            lastDeployedAt: null,
            provisionError: null,
          },
        },
      },
    ]);

    render(<ProvisioningStatus siteId={22} />);
    await flushMicrotasks();

    const deployBtn = screen.getByText('Deploy Now');
    await act(async () => {
      fireEvent.click(deployBtn);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // First call -> status fetch, second -> provision, third -> refetch
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[1][0]).toBe(
      '/api/portal/websites/22/provision',
    );
    expect(fetchSpy.mock.calls[1][1].method).toBe('POST');
  });

  it('renders all four provisioning steps with the right completion mark', async () => {
    mockFetchOnce({
      success: true,
      data: {
        deploymentStatus: 'provisioning',
        subdomain: 'bar',
        fullDomain: null,
        githubRepoName: 'bar-repo', // -> step 1 done
        githubRepoUrl: 'https://github.com/x/bar-repo',
        vercelProjectId: 'prj_123', // -> step 2 done
        vercelProjectUrl: null,
        vercelDomain: null,
        lastDeployedAt: null,
        provisionError: null,
      },
    });

    const { container } = render(<ProvisioningStatus siteId={33} />);
    await flushMicrotasks();

    expect(container.textContent).toContain(
      'Setting up your website...',
    );
    expect(container.textContent).toContain('Creating repository');
    expect(container.textContent).toContain('Setting up deployment');
    expect(container.textContent).toContain('Configuring DNS');
    expect(container.textContent).toContain('Live');
  });

  it('renders the failed panel with the error message and Retry button', async () => {
    mockFetchOnce({
      success: true,
      data: {
        deploymentStatus: 'failed',
        subdomain: 'fail',
        fullDomain: null,
        githubRepoName: null,
        githubRepoUrl: null,
        vercelProjectId: null,
        vercelProjectUrl: null,
        vercelDomain: null,
        lastDeployedAt: null,
        provisionError: 'github 422: name taken',
      },
    });

    const { container } = render(<ProvisioningStatus siteId={44} />);
    await flushMicrotasks();

    expect(container.textContent).toContain('Provisioning failed');
    expect(container.textContent).toContain('github 422: name taken');
    expect(container.textContent).toContain('Retry');
  });

  it('renders the active infrastructure panel with subdomain + repo + vercel links', async () => {
    mockFetchOnce({
      success: true,
      data: {
        deploymentStatus: 'active',
        subdomain: 'live',
        fullDomain: 'live.simplerdevelopment.com',
        githubRepoName: 'live-repo',
        githubRepoUrl: 'https://github.com/x/live-repo',
        vercelProjectId: 'prj_x',
        vercelProjectUrl: 'https://vercel.com/x/live',
        vercelDomain: null,
        lastDeployedAt: '2026-01-01T00:00:00Z',
        provisionError: null,
      },
    });

    const { container } = render(<ProvisioningStatus siteId={55} />);
    await flushMicrotasks();

    expect(container.textContent).toContain('Infrastructure');
    expect(container.textContent).toContain('Active');
    // domain
    expect(container.textContent).toContain('live.simplerdevelopment.com');
    const links = Array.from(container.querySelectorAll('a'));
    expect(
      links.some((a) => a.getAttribute('href') === 'https://github.com/x/live-repo'),
    ).toBe(true);
    expect(
      links.some((a) => a.getAttribute('href') === 'https://vercel.com/x/live'),
    ).toBe(true);
    // Managed badge should NOT be present (github repo + vercel project set)
    expect(container.textContent).not.toContain('Managed');
  });

  it('shows the "Managed" badge when active without github/vercel projects', async () => {
    mockFetchOnce({
      success: true,
      data: {
        deploymentStatus: 'active',
        subdomain: 'managed',
        fullDomain: 'managed.simplerdevelopment.com',
        githubRepoName: null,
        githubRepoUrl: null,
        vercelProjectId: null,
        vercelProjectUrl: null,
        vercelDomain: null,
        lastDeployedAt: null,
        provisionError: null,
      },
    });

    const { container } = render(<ProvisioningStatus siteId={66} />);
    await flushMicrotasks();

    expect(container.textContent).toContain('Managed');
    expect(container.textContent).toContain(
      'Hosted on simplerdevelopment.com',
    );
  });
});
