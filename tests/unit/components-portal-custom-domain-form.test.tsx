// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

import CustomDomainForm from '@/components/portal/CustomDomainForm';

// ---------------------------------------------------------------------------
// Types mirrored from the component (local only — not exported)
// ---------------------------------------------------------------------------
interface DomainRecord {
  id: number;
  domain: string;
  isPrimary: boolean;
  status: string;
  verifiedAt: Date | string | null;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SITE_ID = 42;

function makeDomain(overrides: Partial<DomainRecord> = {}): DomainRecord {
  return {
    id: 1,
    domain: 'example.com',
    isPrimary: false,
    status: 'pending',
    verifiedAt: null,
    ...overrides,
  };
}

function makeJsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------
function setupFetch({
  listBody = { success: true, data: [] as DomainRecord[] },
  addBody = { success: true, data: { id: 99, domain: 'new.com' } },
  deleteBody = { success: true },
  verifyBody = {
    success: true,
    data: { verified: false, misconfigured: false, dnsRecords: [] },
  },
  patchBody = { success: true },
}: {
  listBody?: unknown;
  addBody?: unknown;
  deleteBody?: unknown;
  verifyBody?: unknown;
  patchBody?: unknown;
} = {}) {
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();

    if (method === 'GET') return makeJsonResponse(listBody);

    if (method === 'POST') {
      const urlStr = String(url);
      if (urlStr.includes('/verify')) return makeJsonResponse(verifyBody);
      return makeJsonResponse(addBody);
    }

    if (method === 'DELETE') return makeJsonResponse(deleteBody);

    if (method === 'PATCH') return makeJsonResponse(patchBody);

    return makeJsonResponse({ success: true });
  }) as typeof global.fetch;
}

// ---------------------------------------------------------------------------
// Mount helpers
// ---------------------------------------------------------------------------
function mountWith(initialDomains: DomainRecord[] = []) {
  return render(
    <CustomDomainForm siteId={SITE_ID} initialDomains={initialDomains} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupFetch();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Rendering — empty state
// ---------------------------------------------------------------------------
describe('CustomDomainForm — empty state', () => {
  it('renders the section heading', () => {
    mountWith();
    expect(screen.getByText('Custom Domains')).toBeInTheDocument();
  });

  it('renders the description paragraph', () => {
    mountWith();
    expect(
      screen.getByText(/Connect custom domains to this website/i),
    ).toBeInTheDocument();
  });

  it('renders the domain input placeholder', () => {
    mountWith();
    const input = screen.getByPlaceholderText('yoursite.com');
    expect(input).toBeInTheDocument();
  });

  it('renders "Add Domain" button', () => {
    mountWith();
    expect(
      screen.getByRole('button', { name: /Add Domain/i }),
    ).toBeInTheDocument();
  });

  it('shows "No custom domains configured" when no initialDomains', () => {
    mountWith();
    expect(
      screen.getByText(/No custom domains configured/i),
    ).toBeInTheDocument();
  });

  it('"Add Domain" button is disabled when input is empty', () => {
    mountWith();
    const btn = screen.getByRole('button', { name: /Add Domain/i });
    expect(btn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 2. Input interaction
// ---------------------------------------------------------------------------
describe('CustomDomainForm — input', () => {
  it('enables Add Domain button once input is non-empty', () => {
    mountWith();
    const input = screen.getByPlaceholderText('yoursite.com');
    fireEvent.change(input, { target: { value: 'mysite.com' } });
    expect(screen.getByRole('button', { name: /Add Domain/i })).not.toBeDisabled();
  });

  it('strips leading https:// from typed value', () => {
    mountWith();
    const input = screen.getByPlaceholderText('yoursite.com') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://mysite.com' } });
    expect(input.value).toBe('mysite.com');
  });

  it('strips leading http:// from typed value', () => {
    mountWith();
    const input = screen.getByPlaceholderText('yoursite.com') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'http://mysite.com' } });
    expect(input.value).toBe('mysite.com');
  });

  it('pressing Enter with non-empty input calls fetch (POST)', async () => {
    setupFetch({ addBody: { success: true, data: { id: 5, domain: 'enter.com' } } });
    mountWith();
    const input = screen.getByPlaceholderText('yoursite.com');
    fireEvent.change(input, { target: { value: 'enter.com' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const postCall = calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('pressing Enter with empty input does NOT call fetch', () => {
    mountWith();
    const input = screen.getByPlaceholderText('yoursite.com');
    fireEvent.keyDown(input, { key: 'Enter' });
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Add domain — success path
// ---------------------------------------------------------------------------
describe('CustomDomainForm — add domain success', () => {
  it('POSTs to the domains endpoint with the typed domain', async () => {
    setupFetch({ addBody: { success: true, data: { id: 10, domain: 'newsite.io' } } });
    mountWith();
    const input = screen.getByPlaceholderText('yoursite.com');
    fireEvent.change(input, { target: { value: 'newsite.io' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Domain/i }));
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const postCall = calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.domain).toBe('newsite.io');
    });
  });

  it('shows success message with domain name after add', async () => {
    setupFetch({
      addBody: { success: true, data: { id: 10, domain: 'newsite.io' } },
      listBody: { success: true, data: [makeDomain({ id: 10, domain: 'newsite.io' })] },
    });
    mountWith();
    const input = screen.getByPlaceholderText('yoursite.com');
    fireEvent.change(input, { target: { value: 'newsite.io' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Domain/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Domain newsite.io added/i)).toBeInTheDocument();
    });
  });

  it('clears the input after successful add', async () => {
    setupFetch({ addBody: { success: true, data: { id: 10, domain: 'newsite.io' } } });
    mountWith();
    const input = screen.getByPlaceholderText('yoursite.com') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'newsite.io' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Domain/i }));
    });
    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('shows "Adding..." label while request is in flight', async () => {
    // Use a never-resolving fetch so the button stays in the loading state
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof global.fetch;
    mountWith();
    const input = screen.getByPlaceholderText('yoursite.com');
    fireEvent.change(input, { target: { value: 'slow.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Domain/i }));
    expect(screen.getByRole('button', { name: /Adding\.\.\./i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Add domain — error path
// ---------------------------------------------------------------------------
describe('CustomDomainForm — add domain error', () => {
  it('shows error message when add returns success=false', async () => {
    setupFetch({ addBody: { success: false, message: 'Domain already exists' } });
    mountWith();
    const input = screen.getByPlaceholderText('yoursite.com');
    fireEvent.change(input, { target: { value: 'taken.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Domain/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('Domain already exists')).toBeInTheDocument();
    });
  });

  it('shows fallback error when message is missing', async () => {
    setupFetch({ addBody: { success: false } });
    mountWith();
    const input = screen.getByPlaceholderText('yoursite.com');
    fireEvent.change(input, { target: { value: 'bad.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Domain/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('Failed to add domain.')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Domain list rendering
// ---------------------------------------------------------------------------
describe('CustomDomainForm — domain list', () => {
  it('renders a domain name in the list', () => {
    mountWith([makeDomain({ domain: 'listed.com' })]);
    expect(screen.getByText('listed.com')).toBeInTheDocument();
  });

  it('renders "Primary" badge for primary domain', () => {
    mountWith([makeDomain({ isPrimary: true })]);
    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('does not render "Primary" badge for non-primary domain', () => {
    mountWith([makeDomain({ isPrimary: false })]);
    expect(screen.queryByText('Primary')).toBeNull();
  });

  it('renders "Verified" badge for verified domain', () => {
    mountWith([makeDomain({ status: 'verified' })]);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('renders "Pending" badge for non-verified domain', () => {
    mountWith([makeDomain({ status: 'pending' })]);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders multiple domains', () => {
    mountWith([
      makeDomain({ id: 1, domain: 'first.com' }),
      makeDomain({ id: 2, domain: 'second.com' }),
    ]);
    expect(screen.getByText('first.com')).toBeInTheDocument();
    expect(screen.getByText('second.com')).toBeInTheDocument();
  });

  it('shows "Set as primary" button for non-primary domain', () => {
    mountWith([makeDomain({ isPrimary: false })]);
    expect(screen.getByTitle('Set as primary')).toBeInTheDocument();
  });

  it('does not show "Set as primary" button for primary domain', () => {
    mountWith([makeDomain({ isPrimary: true })]);
    expect(screen.queryByTitle('Set as primary')).toBeNull();
  });

  it('hides the empty-state message when domains are present', () => {
    mountWith([makeDomain()]);
    expect(screen.queryByText(/No custom domains configured/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. DNS records toggle
// ---------------------------------------------------------------------------
describe('CustomDomainForm — DNS records toggle', () => {
  it('"Show DNS Records" button is rendered for each domain', () => {
    mountWith([makeDomain()]);
    expect(screen.getByRole('button', { name: /Show DNS Records/i })).toBeInTheDocument();
  });

  it('clicking "Show DNS Records" reveals the DNS table', () => {
    mountWith([makeDomain()]);
    fireEvent.click(screen.getByRole('button', { name: /Show DNS Records/i }));
    expect(screen.getByText('Add these records at your domain registrar')).toBeInTheDocument();
  });

  it('DNS table shows A and CNAME record types', () => {
    mountWith([makeDomain()]);
    fireEvent.click(screen.getByRole('button', { name: /Show DNS Records/i }));
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('CNAME')).toBeInTheDocument();
  });

  it('shows the Vercel A record value', () => {
    mountWith([makeDomain()]);
    fireEvent.click(screen.getByRole('button', { name: /Show DNS Records/i }));
    expect(screen.getByText('76.76.21.21')).toBeInTheDocument();
  });

  it('shows the Vercel CNAME value', () => {
    mountWith([makeDomain()]);
    fireEvent.click(screen.getByRole('button', { name: /Show DNS Records/i }));
    expect(screen.getByText('cname.vercel-dns.com')).toBeInTheDocument();
  });

  it('button label toggles to "Hide DNS Records" after click', () => {
    mountWith([makeDomain()]);
    const btn = screen.getByRole('button', { name: /Show DNS Records/i });
    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: /Hide DNS Records/i })).toBeInTheDocument();
  });

  it('clicking "Hide DNS Records" hides the DNS table again', () => {
    mountWith([makeDomain()]);
    const btn = screen.getByRole('button', { name: /Show DNS Records/i });
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole('button', { name: /Hide DNS Records/i }));
    expect(screen.queryByText('Add these records at your domain registrar')).toBeNull();
  });

  it('shows propagation note when DNS table is visible', () => {
    mountWith([makeDomain()]);
    fireEvent.click(screen.getByRole('button', { name: /Show DNS Records/i }));
    expect(screen.getByText(/DNS changes may take up to 48 hours/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7. Verify DNS
// ---------------------------------------------------------------------------
describe('CustomDomainForm — verify DNS', () => {
  it('renders "Verify DNS" button for each domain', () => {
    mountWith([makeDomain()]);
    expect(screen.getByRole('button', { name: /Verify DNS/i })).toBeInTheDocument();
  });

  it('POSTs to the verify endpoint when "Verify DNS" is clicked', async () => {
    mountWith([makeDomain({ id: 7 })]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Verify DNS/i }));
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const verifyCall = calls.find(
        (c) =>
          String(c[0]).includes('/verify') &&
          (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(verifyCall).toBeTruthy();
    });
  });

  it('shows "DNS verified and working" when verified=true and misconfigured=false', async () => {
    // When verified succeeds, the component calls refreshDomains() (a GET).
    // We must return the domain on the subsequent GET so the domain card stays
    // rendered and shows the verify result.
    const domain = makeDomain({ id: 7 });
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') {
        return makeJsonResponse({ success: true, data: [domain] });
      }
      if (method === 'POST' && String(url).includes('/verify')) {
        return makeJsonResponse({
          success: true,
          data: { verified: true, misconfigured: false, dnsRecords: [] },
        });
      }
      return makeJsonResponse({ success: true });
    }) as typeof global.fetch;

    mountWith([domain]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Verify DNS/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('DNS verified and working')).toBeInTheDocument();
    });
  });

  it('shows warning text when not yet verified', async () => {
    setupFetch({
      verifyBody: {
        success: true,
        data: { verified: false, misconfigured: false, dnsRecords: [] },
      },
    });
    mountWith([makeDomain({ id: 7 })]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Verify DNS/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/DNS not yet verified/i)).toBeInTheDocument();
    });
  });

  it('shows current DNS records table when unverified and dnsRecords present', async () => {
    setupFetch({
      verifyBody: {
        success: true,
        data: {
          verified: false,
          misconfigured: false,
          dnsRecords: [{ type: 'A', host: '@', value: '1.2.3.4' }],
        },
      },
    });
    mountWith([makeDomain({ id: 7 })]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Verify DNS/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('Current DNS Records Detected')).toBeInTheDocument();
      expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
    });
  });

  it('does NOT show current DNS records table when verified', async () => {
    setupFetch({
      verifyBody: {
        success: true,
        data: {
          verified: true,
          misconfigured: false,
          dnsRecords: [{ type: 'A', host: '@', value: '1.2.3.4' }],
        },
      },
    });
    mountWith([makeDomain({ id: 7 })]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Verify DNS/i }));
    });
    await waitFor(() => {
      expect(screen.queryByText('Current DNS Records Detected')).toBeNull();
    });
  });

  it('shows error when verify API returns success=false', async () => {
    setupFetch({
      verifyBody: { success: false, message: 'Verify failed' },
    });
    mountWith([makeDomain({ id: 7 })]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Verify DNS/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('Verify failed')).toBeInTheDocument();
    });
  });

  it('shows "Checking..." while verification is in flight', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof global.fetch;
    mountWith([makeDomain()]);
    fireEvent.click(screen.getByRole('button', { name: /Verify DNS/i }));
    expect(screen.getByRole('button', { name: /Checking\.\.\./i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 8. Remove domain
// ---------------------------------------------------------------------------
describe('CustomDomainForm — remove domain', () => {
  it('renders "Remove domain" button for each domain', () => {
    mountWith([makeDomain()]);
    expect(screen.getByTitle('Remove domain')).toBeInTheDocument();
  });

  it('DELETEs to the correct endpoint when remove is clicked', async () => {
    setupFetch({ deleteBody: { success: true } });
    mountWith([makeDomain({ id: 55 })]);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Remove domain'));
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const delCall = calls.find(
        (c) =>
          String(c[0]).includes('/55') &&
          (c[1] as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(delCall).toBeTruthy();
    });
  });

  it('removes the domain from the list on success', async () => {
    setupFetch({ deleteBody: { success: true } });
    mountWith([makeDomain({ id: 55, domain: 'gone.com' })]);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Remove domain'));
    });
    await waitFor(() => {
      expect(screen.queryByText('gone.com')).toBeNull();
    });
  });

  it('shows success message after removal', async () => {
    setupFetch({ deleteBody: { success: true } });
    mountWith([makeDomain({ id: 55 })]);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Remove domain'));
    });
    await waitFor(() => {
      expect(screen.getByText('Domain removed.')).toBeInTheDocument();
    });
  });

  it('shows error when remove returns success=false', async () => {
    setupFetch({ deleteBody: { success: false, message: 'Cannot remove primary' } });
    mountWith([makeDomain({ id: 55 })]);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Remove domain'));
    });
    await waitFor(() => {
      expect(screen.getByText('Cannot remove primary')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 9. Set as primary
// ---------------------------------------------------------------------------
describe('CustomDomainForm — set primary', () => {
  it('PATCHes with isPrimary=true when star button clicked', async () => {
    setupFetch({
      patchBody: { success: true },
      listBody: { success: true, data: [makeDomain({ id: 3, isPrimary: true })] },
    });
    mountWith([makeDomain({ id: 3, isPrimary: false })]);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Set as primary'));
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const patchCall = calls.find(
        (c) =>
          String(c[0]).includes('/3') &&
          (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body.isPrimary).toBe(true);
    });
  });

  it('shows error when PATCH returns success=false', async () => {
    setupFetch({ patchBody: { success: false, message: 'Not allowed' } });
    mountWith([makeDomain({ id: 3, isPrimary: false })]);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Set as primary'));
    });
    await waitFor(() => {
      expect(screen.getByText('Not allowed')).toBeInTheDocument();
    });
  });
});
