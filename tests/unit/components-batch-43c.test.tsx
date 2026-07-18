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
// Mocks
// ---------------------------------------------------------------------------

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: refreshMock,
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
import ProjectStatusControl from '@/components/portal/ProjectStatusControl';
import UploadHtmlDeckButton from '@/components/portal/UploadHtmlDeckButton';
import DeleteWebsiteButton from '@/components/portal/DeleteWebsiteButton';
import GitHubConnectButton from '@/components/portal/GitHubConnectButton';

// ---------------------------------------------------------------------------
// Helpers
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

function flushMicrotasks() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// ProjectStatusControl
// ---------------------------------------------------------------------------
describe('ProjectStatusControl', () => {
  it('renders read-only status pill when canEdit is false', () => {
    const { container } = render(
      <ProjectStatusControl projectId={1} status="active" canEdit={false} />,
    );
    expect(container.textContent).toContain('active');
    // No button or popover trigger
    expect(container.querySelector('button')).toBeNull();
  });

  it('falls back to active meta when status is unknown', () => {
    const { container } = render(
      <ProjectStatusControl projectId={1} status="bogus" canEdit={false} />,
    );
    // active label is "Active" -> toLowerCase() -> "active"
    expect(container.textContent).toContain('active');
  });

  it('renders the toggle button with arrow_drop_down when canEdit is true', () => {
    const { container } = render(
      <ProjectStatusControl projectId={2} status="paused" canEdit={true} />,
    );
    const btn = container.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn?.textContent).toContain('paused');
    expect(btn?.textContent).toContain('arrow_drop_down');
  });

  it('opens the popover with all four status options when clicked', () => {
    const { container } = render(
      <ProjectStatusControl projectId={3} status="active" canEdit={true} />,
    );
    const btn = container.querySelector('button') as HTMLButtonElement;
    fireEvent.click(btn);
    expect(container.textContent).toContain('Active');
    expect(container.textContent).toContain('Paused');
    expect(container.textContent).toContain('Completed');
    expect(container.textContent).toContain('Archived');
  });

  it('closes the popover without firing fetch when clicking the same status', async () => {
    const fetchSpy = vi.fn();
    // @ts-expect-error - test override
    globalThis.fetch = fetchSpy;

    const { container } = render(
      <ProjectStatusControl projectId={4} status="active" canEdit={true} />,
    );
    fireEvent.click(container.querySelector('button') as HTMLButtonElement);
    // The "Active" option is now visible — click it (same status)
    const activeOpt = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Active'),
    ) as HTMLButtonElement;
    expect(activeOpt).toBeTruthy();
    fireEvent.click(activeOpt);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('PATCHes the new status on selection and refreshes', async () => {
    const fetchSpy = mockFetchOnce({ success: true });

    const { container } = render(
      <ProjectStatusControl projectId={9} status="active" canEdit={true} />,
    );
    fireEvent.click(container.querySelector('button') as HTMLButtonElement);

    // Find the "Completed" option button
    const completedOpt = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Completed'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(completedOpt);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/portal/projects/9');
    expect(fetchSpy.mock.calls[0][1].method).toBe('PATCH');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({
      status: 'completed',
    });
    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it('does not refresh or update local status when API returns failure', async () => {
    mockFetchOnce({ success: false });

    const { container } = render(
      <ProjectStatusControl projectId={5} status="active" canEdit={true} />,
    );
    fireEvent.click(container.querySelector('button') as HTMLButtonElement);
    const completedOpt = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Completed'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(completedOpt);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(refreshMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UploadHtmlDeckButton
// ---------------------------------------------------------------------------
describe('UploadHtmlDeckButton', () => {
  it('renders the default idle label and secondary styling', () => {
    const { container } = render(<UploadHtmlDeckButton />);
    const btn = container.querySelector('button');
    expect(btn?.textContent).toContain('Upload HTML / Zip');
    expect(btn?.className).toContain('border');
  });

  it('applies the primary variant styles when variant="primary"', () => {
    const { container } = render(<UploadHtmlDeckButton variant="primary" />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-primary');
  });

  it('hidden input accepts html and zip', () => {
    const { container } = render(<UploadHtmlDeckButton />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain('.html');
    expect(input.accept).toContain('.zip');
    expect(input.className).toContain('hidden');
  });

  it('clicking the visible button triggers a click on the file input', () => {
    const { container } = render(<UploadHtmlDeckButton />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const inputClickSpy = vi.spyOn(input, 'click');
    fireEvent.click(container.querySelector('button') as HTMLButtonElement);
    expect(inputClickSpy).toHaveBeenCalled();
  });

  it('uploads the file and navigates to the new deck editor on success', async () => {
    const fetchSpy = mockFetchOnce({ success: true, data: { id: 77 } });

    const { container } = render(<UploadHtmlDeckButton />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['<html></html>'], 'deck.html', { type: 'text/html' });

    await act(async () => {
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
      '/api/portal/tools/pitch-decks/upload-html',
    );
    expect(fetchSpy.mock.calls[0][1].method).toBe('POST');
    expect(fetchSpy.mock.calls[0][1].body).toBeInstanceOf(FormData);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/portal/tools/pitch-decks/77');
    });
  });

  it('alerts when upload response is not ok', async () => {
    // @ts-expect-error - test override
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, message: 'invalid html' }),
    });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const { container } = render(<UploadHtmlDeckButton />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'deck.html', { type: 'text/html' });

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
    expect(alertSpy.mock.calls[0][0]).toContain('invalid html');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('alerts when fetch throws an exception', async () => {
    // @ts-expect-error - test override
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('network down'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const { container } = render(<UploadHtmlDeckButton />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'deck.html', { type: 'text/html' });

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
    expect(alertSpy.mock.calls[0][0]).toContain('network down');
  });

  it('does nothing when change fires without a selected file', () => {
    const fetchSpy = vi.fn();
    // @ts-expect-error - test override
    globalThis.fetch = fetchSpy;

    const { container } = render(<UploadHtmlDeckButton />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [] });
    fireEvent.change(input);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DeleteWebsiteButton
// ---------------------------------------------------------------------------
describe('DeleteWebsiteButton', () => {
  it('renders the danger panel with the site name', () => {
    const { container } = render(
      <DeleteWebsiteButton siteId={1} siteName="acme.com" />,
    );
    expect(container.textContent).toContain('Danger Zone');
    expect(container.textContent).toContain('acme.com');
    expect(container.textContent).toContain('Delete Website');
  });

  it('switches to the confirm view when Delete Website is clicked', () => {
    const { container } = render(
      <DeleteWebsiteButton siteId={2} siteName="example.com" />,
    );
    fireEvent.click(screen.getByText('Delete Website'));
    expect(container.textContent).toContain('Type');
    expect(container.querySelector('input')).toBeTruthy();
    expect(container.textContent).toContain('Permanently Delete');
    expect(container.textContent).toContain('Cancel');
  });

  it('keeps the Permanently Delete button disabled until name matches', () => {
    const { container } = render(
      <DeleteWebsiteButton siteId={3} siteName="needs-exact-match.com" />,
    );
    fireEvent.click(screen.getByText('Delete Website'));
    const deleteBtn = screen.getByText('Permanently Delete') as HTMLButtonElement;
    expect(deleteBtn.disabled).toBe(true);

    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wrong' } });
    expect(deleteBtn.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'needs-exact-match.com' } });
    expect(deleteBtn.disabled).toBe(false);
  });

  it('cancel button returns to the initial view and clears state', () => {
    const { container } = render(
      <DeleteWebsiteButton siteId={4} siteName="x.com" />,
    );
    fireEvent.click(screen.getByText('Delete Website'));
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'partial' } });
    fireEvent.click(screen.getByText('Cancel'));

    expect(container.textContent).toContain('Delete this website');
    // Re-open should show empty input
    fireEvent.click(screen.getByText('Delete Website'));
    const input2 = container.querySelector('input') as HTMLInputElement;
    expect(input2.value).toBe('');
  });

  it('calls DELETE endpoint and routes to /portal/websites on success', async () => {
    const fetchSpy = mockFetchOnce({ success: true });

    const { container } = render(
      <DeleteWebsiteButton siteId={42} siteName="bye.com" />,
    );
    fireEvent.click(screen.getByText('Delete Website'));
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bye.com' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Permanently Delete'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/portal/cms/websites/42', {
      method: 'DELETE',
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/portal/websites');
    });
  });

  it('shows an error message when API returns failure', async () => {
    mockFetchOnce({ success: false, message: 'site has dependents' });

    const { container } = render(
      <DeleteWebsiteButton siteId={50} siteName="block.com" />,
    );
    fireEvent.click(screen.getByText('Delete Website'));
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'block.com' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Permanently Delete'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(container.textContent).toContain('site has dependents');
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows generic error when fetch throws', async () => {
    // @ts-expect-error - test override
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('boom'));

    const { container } = render(
      <DeleteWebsiteButton siteId={51} siteName="throw.com" />,
    );
    fireEvent.click(screen.getByText('Delete Website'));
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'throw.com' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Permanently Delete'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Something went wrong.');
    });
  });
});

// ---------------------------------------------------------------------------
// GitHubConnectButton
// ---------------------------------------------------------------------------
describe('GitHubConnectButton', () => {
  it('renders the panel and shows Connect GitHub link', () => {
    const { container } = render(<GitHubConnectButton siteId={1} />);
    expect(container.textContent).toContain('GitHub Access');
    expect(container.textContent).toContain('Connect GitHub');
    expect(container.textContent).toContain('Request Repo Access');
    const link = container.querySelector('a[href="/api/portal/github/connect"]');
    expect(link).toBeTruthy();
  });

  it('shows the success banner when ?github=connected is in the URL', () => {
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, search: '?github=connected' },
    });

    try {
      const { container } = render(<GitHubConnectButton siteId={2} />);
      expect(container.textContent).toContain('GitHub connected successfully!');
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      });
    }
  });

  it('POSTs to collaborators endpoint when Request Repo Access is clicked', async () => {
    const fetchSpy = mockFetchOnce({
      success: true,
      message: 'Added as collaborator!',
    });

    const { container } = render(<GitHubConnectButton siteId={99} />);
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Request Repo Access'),
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      '/api/portal/websites/99/collaborators',
    );
    expect(fetchSpy.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({
      permission: 'push',
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Added as collaborator!');
    });
  });

  it('redirects to /api/portal/github/connect when API says to connect GitHub first', async () => {
    mockFetchOnce({
      success: false,
      message: 'Connect your GitHub account first',
    });

    const original = window.location;
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new Proxy(original, {
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
      const { container } = render(<GitHubConnectButton siteId={5} />);
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Request Repo Access'),
      ) as HTMLButtonElement;

      await act(async () => {
        fireEvent.click(btn);
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(hrefSetter).toHaveBeenCalledWith(
          '/api/portal/github/connect',
        );
      });
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      });
    }
  });

  it('shows a generic failure message when API returns a non-redirect failure', async () => {
    mockFetchOnce({
      success: false,
      message: 'Repository not found',
    });

    const { container } = render(<GitHubConnectButton siteId={7} />);
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Request Repo Access'),
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Repository not found');
    });
  });
});
