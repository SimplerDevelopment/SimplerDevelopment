import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DomainGetStarted from '@/components/portal/onboarding/DomainGetStarted';
import GetStartedChecklist from '@/components/portal/onboarding/GetStartedChecklist';

function jsonResponse(body: unknown) {
  return { json: async () => body } as Response;
}

const crmStatus = {
  steps: [
    { key: 'enabled', done: true, preCredited: true, counted: true },
    { key: 'add-contacts', done: false, preCredited: false, counted: true },
    { key: 'create-pipeline', done: false, preCredited: false, counted: true },
    { key: 'log-deal', done: false, preCredited: false, counted: true },
  ],
  done: 1,
  total: 4,
  complete: false,
};

describe('DomainGetStarted', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn((url: string) => {
      if (String(url).includes('/status')) {
        return Promise.resolve(jsonResponse({ success: true, data: { domains: { crm: crmStatus } } }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: { answers: {} } }));
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders pre-credited progress — never 0 of N', async () => {
    render(<DomainGetStarted domainKey="crm" />);
    await waitFor(() => expect(screen.getByText('1 of 4 steps complete')).toBeInTheDocument());
    expect(screen.queryByText(/^0 of /)).not.toBeInTheDocument();
  });

  it('hides when the domain is complete', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/status')) {
        return Promise.resolve(
          jsonResponse({ success: true, data: { domains: { crm: { ...crmStatus, done: 4, complete: true } } } }),
        );
      }
      return Promise.resolve(jsonResponse({ success: true, data: { answers: {} } }));
    });
    const { container } = render(<DomainGetStarted domainKey="crm" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('hides when the user has dismissed this domain', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/status')) {
        return Promise.resolve(jsonResponse({ success: true, data: { domains: { crm: crmStatus } } }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: { answers: { dismissedDomains: ['crm'] } } }));
    });
    const { container } = render(<DomainGetStarted domainKey="crm" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});

describe('GetStartedChecklist (auto-detected)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows detected progress with pre-credited floor — never 0%', async () => {
    const fetchMock = vi.fn((url: string) => {
      const u = String(url);
      if (u.includes('/billing/modules')) {
        return Promise.resolve(
          jsonResponse({ success: true, data: { entitlements: { domains: ['crm'], hasBundle: false, gatingBypassed: false } } }),
        );
      }
      if (u.includes('/status')) {
        return Promise.resolve(jsonResponse({ success: true, data: { domains: { crm: crmStatus } } }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: { answers: {} } }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<GetStartedChecklist />);
    await waitFor(() => expect(screen.getByText('1 of 4 steps complete')).toBeInTheDocument());
    expect(screen.getByText('25%')).toBeInTheDocument();
    // Manual check-off is gone — no toggle buttons on action rows.
    expect(screen.queryByRole('button', { name: /Mark ".*" complete/ })).not.toBeInTheDocument();
  });
});
