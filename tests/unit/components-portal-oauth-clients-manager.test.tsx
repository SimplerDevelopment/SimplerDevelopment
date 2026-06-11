// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface OAuthClientFixture {
  id: number;
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: string;
  clientSecretPreview: string | null;
  clientSecretCreatedAt: string | null;
  clientSecretRotatedAt: string | null;
  createdAt: string;
}

function makeClient(overrides?: Partial<OAuthClientFixture>): OAuthClientFixture {
  return {
    id: 1,
    clientId: 'client_abc123',
    clientName: 'My App',
    redirectUris: ['https://example.com/callback'],
    tokenEndpointAuthMethod: 'client_secret_basic',
    clientSecretPreview: 'sk_...xyz',
    clientSecretCreatedAt: '2024-01-01T00:00:00Z',
    clientSecretRotatedAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockLoadSuccess(clients: OAuthClientFixture[]) {
  return vi.fn().mockResolvedValue({
    json: async () => ({ success: true, data: clients }),
  } as unknown as Response);
}

function mockLoadError(message = 'Failed to load') {
  return vi.fn().mockResolvedValue({
    json: async () => ({ success: false, message }),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import OAuthClientsManager from '@/components/portal/OAuthClientsManager';

async function renderAndWait(props?: { heading?: string | null; subheading?: string | null }) {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<OAuthClientsManager {...props} />);
  });
  return result!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OAuthClientsManager — initial load', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    global.confirm = vi.fn(() => true);
  });

  it('shows loading state while fetching', async () => {
    let resolveLoad!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise(r => { resolveLoad = r; }));
    render(<OAuthClientsManager />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await act(async () => {
      resolveLoad({ json: async () => ({ success: true, data: [] }) });
    });
  });

  it('renders heading and subheading defaults', async () => {
    global.fetch = mockLoadSuccess([]);
    await renderAndWait();
    expect(screen.getByText('OAuth apps')).toBeInTheDocument();
    expect(screen.getByText(/Register OAuth apps/)).toBeInTheDocument();
  });

  it('renders custom heading and subheading', async () => {
    global.fetch = mockLoadSuccess([]);
    await renderAndWait({ heading: 'My Integrations', subheading: 'Custom description' });
    expect(screen.getByText('My Integrations')).toBeInTheDocument();
    expect(screen.getByText('Custom description')).toBeInTheDocument();
  });

  it('hides heading when null', async () => {
    global.fetch = mockLoadSuccess([]);
    await renderAndWait({ heading: null });
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('shows empty state message when no clients', async () => {
    global.fetch = mockLoadSuccess([]);
    await renderAndWait();
    expect(screen.getByText(/No OAuth apps yet/)).toBeInTheDocument();
  });

  it('shows error message on load failure', async () => {
    global.fetch = mockLoadError('Load failed');
    await renderAndWait();
    expect(screen.getByText('Load failed')).toBeInTheDocument();
  });

  it('shows generic error when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network down'));
    await renderAndWait();
    expect(screen.getByText('Network down')).toBeInTheDocument();
  });

  it('shows generic string when non-Error thrown', async () => {
    global.fetch = vi.fn().mockRejectedValue('oops');
    await renderAndWait();
    expect(screen.getByText('Failed to load OAuth apps')).toBeInTheDocument();
  });
});

describe('OAuthClientsManager — client list', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    global.confirm = vi.fn(() => true);
  });

  it('renders client row with name, clientId, secret preview', async () => {
    global.fetch = mockLoadSuccess([makeClient()]);
    await renderAndWait();
    expect(screen.getByText('My App')).toBeInTheDocument();
    expect(screen.getByText('client_abc123')).toBeInTheDocument();
    expect(screen.getByText('sk_...xyz')).toBeInTheDocument();
  });

  it('renders dash when no clientSecretPreview', async () => {
    global.fetch = mockLoadSuccess([makeClient({ clientSecretPreview: null })]);
    await renderAndWait();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders token endpoint auth method badge', async () => {
    global.fetch = mockLoadSuccess([makeClient()]);
    await renderAndWait();
    expect(screen.getByText('client_secret_basic')).toBeInTheDocument();
  });

  it('renders formatted creation date', async () => {
    global.fetch = mockLoadSuccess([makeClient({ createdAt: '2024-06-15T00:00:00Z' })]);
    await renderAndWait();
    // Date formatted by toLocaleDateString — just check something date-like is present
    expect(screen.getByText(/2024/)).toBeInTheDocument();
  });

  it('renders Rotate secret and Delete buttons per row', async () => {
    global.fetch = mockLoadSuccess([makeClient()]);
    await renderAndWait();
    expect(screen.getByText('Rotate secret')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('renders multiple clients', async () => {
    global.fetch = mockLoadSuccess([
      makeClient({ id: 1, clientName: 'App One', clientId: 'id_one' }),
      makeClient({ id: 2, clientName: 'App Two', clientId: 'id_two' }),
    ]);
    await renderAndWait();
    expect(screen.getByText('App One')).toBeInTheDocument();
    expect(screen.getByText('App Two')).toBeInTheDocument();
  });
});

describe('OAuthClientsManager — create form', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    global.confirm = vi.fn(() => true);
  });

  async function openCreateForm() {
    global.fetch = mockLoadSuccess([]);
    await renderAndWait();
    fireEvent.click(screen.getByText('New app'));
  }

  it('shows create form on New app click', async () => {
    await openCreateForm();
    expect(screen.getByPlaceholderText('e.g. My Integration App')).toBeInTheDocument();
  });

  it('hides create form on Cancel', async () => {
    await openCreateForm();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('e.g. My Integration App')).not.toBeInTheDocument();
  });

  it('shows validation error when app name empty', async () => {
    await openCreateForm();
    fireEvent.click(screen.getByText('Create app'));
    await waitFor(() => {
      expect(screen.getByText('App name is required')).toBeInTheDocument();
    });
  });

  it('shows validation error when redirect URI empty', async () => {
    await openCreateForm();
    fireEvent.change(screen.getByPlaceholderText('e.g. My Integration App'), {
      target: { value: 'Test App' },
    });
    fireEvent.click(screen.getByText('Create app'));
    await waitFor(() => {
      expect(screen.getByText('At least one redirect URI is required')).toBeInTheDocument();
    });
  });

  it('calls POST with correct payload on valid create', async () => {
    const createFetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) }) // load
      .mockResolvedValueOnce({ // create
        json: async () => ({
          success: true,
          data: { client_id: 'new_client_id', client_secret: 'new_secret_abc' },
        }),
      })
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) }); // reload
    global.fetch = createFetch;
    await renderAndWait();
    fireEvent.click(screen.getByText('New app'));

    fireEvent.change(screen.getByPlaceholderText('e.g. My Integration App'), {
      target: { value: 'New Integration' },
    });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/oauth/callback'), {
      target: { value: 'https://myapp.com/callback' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create app'));
    });
    await waitFor(() => {
      const callArgs = createFetch.mock.calls[1];
      expect(callArgs[0]).toBe('/api/portal/oauth-clients');
      expect(callArgs[1].method).toBe('POST');
      const body = JSON.parse(callArgs[1].body);
      expect(body.client_name).toBe('New Integration');
      expect(body.redirect_uris).toEqual(['https://myapp.com/callback']);
    });
  });

  it('shows revealed secret after create with secret', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) })
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: { client_id: 'new_id', client_secret: 'secret123' },
        }),
      })
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) });
    await renderAndWait();
    fireEvent.click(screen.getByText('New app'));
    fireEvent.change(screen.getByPlaceholderText('e.g. My Integration App'), { target: { value: 'App' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/oauth/callback'), {
      target: { value: 'https://example.com/cb' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create app'));
    });
    await waitFor(() => {
      expect(screen.getByText(/Save these credentials now/)).toBeInTheDocument();
      expect(screen.getByText('secret123')).toBeInTheDocument();
    });
  });

  it('shows public client banner when no secret returned', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) })
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: { client_id: 'pkce_id', client_secret: null },
        }),
      })
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) });
    await renderAndWait();
    fireEvent.click(screen.getByText('New app'));
    fireEvent.change(screen.getByPlaceholderText('e.g. My Integration App'), { target: { value: 'PKCE App' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/oauth/callback'), {
      target: { value: 'https://example.com/cb' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create app'));
    });
    await waitFor(() => {
      expect(screen.getByText('Public client created — copy your client_id below')).toBeInTheDocument();
    });
  });

  it('dismisses revealed secret panel on done click', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) })
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: { client_id: 'pkce_id', client_secret: null },
        }),
      })
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) });
    await renderAndWait();
    fireEvent.click(screen.getByText('New app'));
    fireEvent.change(screen.getByPlaceholderText('e.g. My Integration App'), { target: { value: 'PKCE App' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/oauth/callback'), {
      target: { value: 'https://example.com/cb' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create app'));
    });
    await waitFor(() => screen.getByText('Done'));
    fireEvent.click(screen.getByText('Done'));
    expect(screen.queryByText('Public client created — copy your client_id below')).not.toBeInTheDocument();
  });

  it('shows create error on server failure', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) })
      .mockResolvedValueOnce({
        json: async () => ({ success: false, message: 'Duplicate name' }),
      });
    await renderAndWait();
    fireEvent.click(screen.getByText('New app'));
    fireEvent.change(screen.getByPlaceholderText('e.g. My Integration App'), { target: { value: 'App' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/oauth/callback'), {
      target: { value: 'https://x.com/cb' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create app'));
    });
    await waitFor(() => {
      expect(screen.getByText('Duplicate name')).toBeInTheDocument();
    });
  });

  it('shows create error when fetch throws', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) })
      .mockRejectedValueOnce(new Error('Network error'));
    await renderAndWait();
    fireEvent.click(screen.getByText('New app'));
    fireEvent.change(screen.getByPlaceholderText('e.g. My Integration App'), { target: { value: 'App' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/oauth/callback'), {
      target: { value: 'https://x.com/cb' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create app'));
    });
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('can add up to 5 redirect URIs', async () => {
    await openCreateForm();
    const addBtn = screen.getByText('Add another URI');
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    // After 5 URIs added, the button disappears
    expect(screen.queryByText('Add another URI')).not.toBeInTheDocument();
  });

  it('can remove a redirect URI when more than one exists', async () => {
    await openCreateForm();
    fireEvent.click(screen.getByText('Add another URI'));
    // After adding, there are 2 remove buttons
    const removeBtns = screen.getAllByLabelText('Remove URI');
    expect(removeBtns.length).toBe(2);
    // Remove one — back to 1 URI, so Remove buttons disappear
    fireEvent.click(removeBtns[0]);
    expect(screen.queryAllByLabelText('Remove URI').length).toBe(0);
  });

  it('can change auth method to PKCE', async () => {
    await openCreateForm();
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'none' } });
    expect((select as HTMLSelectElement).value).toBe('none');
  });

  it('includes client_uri in POST when provided', async () => {
    const createFetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) })
      .mockResolvedValueOnce({
        json: async () => ({ success: true, data: { client_id: 'x', client_secret: 'y' } }),
      })
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) });
    global.fetch = createFetch;
    await renderAndWait();
    fireEvent.click(screen.getByText('New app'));
    fireEvent.change(screen.getByPlaceholderText('e.g. My Integration App'), { target: { value: 'App' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/oauth/callback'), {
      target: { value: 'https://x.com/cb' },
    });
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://mysite.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create app'));
    });
    await waitFor(() => {
      const body = JSON.parse(createFetch.mock.calls[1][1].body);
      expect(body.client_uri).toBe('https://mysite.com');
    });
  });

  it('does not include client_uri when blank', async () => {
    const createFetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) })
      .mockResolvedValueOnce({
        json: async () => ({ success: true, data: { client_id: 'x', client_secret: 'y' } }),
      })
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) });
    global.fetch = createFetch;
    await renderAndWait();
    fireEvent.click(screen.getByText('New app'));
    fireEvent.change(screen.getByPlaceholderText('e.g. My Integration App'), { target: { value: 'App' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/oauth/callback'), {
      target: { value: 'https://x.com/cb' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create app'));
    });
    await waitFor(() => {
      const body = JSON.parse(createFetch.mock.calls[1][1].body);
      expect(body.client_uri).toBeUndefined();
    });
  });

  it('shows Creating… button while create is in flight', async () => {
    let resolveCreate!: (v: unknown) => void;
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) })
      .mockReturnValueOnce(new Promise(r => { resolveCreate = r; }));
    await renderAndWait();
    fireEvent.click(screen.getByText('New app'));
    fireEvent.change(screen.getByPlaceholderText('e.g. My Integration App'), { target: { value: 'App' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/oauth/callback'), {
      target: { value: 'https://x.com/cb' },
    });
    act(() => {
      fireEvent.click(screen.getByText('Create app'));
    });
    expect(await screen.findByText('Creating…')).toBeInTheDocument();
    await act(async () => {
      resolveCreate({ json: async () => ({ success: false, message: 'err' }) });
    });
  });

  it('New app button toggles form off if already open', async () => {
    await openCreateForm();
    fireEvent.click(screen.getByText('New app'));
    expect(screen.queryByPlaceholderText('e.g. My Integration App')).not.toBeInTheDocument();
  });
});

describe('OAuthClientsManager — rotate secret', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    global.confirm = vi.fn(() => true);
  });

  it('rotates secret and shows revealed panel on success', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [makeClient()] }) })
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: { client_id: 'client_abc123', client_secret: 'rotated_secret' },
        }),
      })
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [makeClient()] }) });
    await renderAndWait();
    await act(async () => {
      fireEvent.click(screen.getByText('Rotate secret'));
    });
    await waitFor(() => {
      expect(screen.getByText('rotated_secret')).toBeInTheDocument();
    });
  });

  it('aborts rotate when confirm returns false', async () => {
    global.confirm = vi.fn(() => false);
    const fetchFn = vi.fn().mockResolvedValue({ json: async () => ({ success: true, data: [makeClient()] }) });
    global.fetch = fetchFn;
    await renderAndWait();
    fireEvent.click(screen.getByText('Rotate secret'));
    await waitFor(() => {
      // Only the initial load call, no PATCH
      const patchCalls = fetchFn.mock.calls.filter((c) => {
        const opts = c[1] as { method?: string } | undefined;
        return opts?.method === 'PATCH';
      });
      expect(patchCalls.length).toBe(0);
    });
  });

  it('shows error message on rotate failure', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [makeClient()] }) })
      .mockResolvedValueOnce({
        json: async () => ({ success: false, message: 'Rotate failed' }),
      });
    await renderAndWait();
    await act(async () => {
      fireEvent.click(screen.getByText('Rotate secret'));
    });
    await waitFor(() => {
      expect(screen.getByText('Rotate failed')).toBeInTheDocument();
    });
  });

  it('shows generic error when rotate fetch throws', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [makeClient()] }) })
      .mockRejectedValueOnce(new Error('Patch error'));
    await renderAndWait();
    await act(async () => {
      fireEvent.click(screen.getByText('Rotate secret'));
    });
    await waitFor(() => {
      expect(screen.getByText('Patch error')).toBeInTheDocument();
    });
  });
});

describe('OAuthClientsManager — delete client', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    global.confirm = vi.fn(() => true);
  });

  it('deletes client and reloads on success', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [makeClient()] }) })
      .mockResolvedValueOnce({ json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) });
    global.fetch = fetchFn;
    await renderAndWait();
    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });
    await waitFor(() => {
      expect(screen.getByText(/No OAuth apps yet/)).toBeInTheDocument();
    });
  });

  it('aborts delete when confirm returns false', async () => {
    global.confirm = vi.fn(() => false);
    const fetchFn = vi.fn().mockResolvedValue({ json: async () => ({ success: true, data: [makeClient()] }) });
    global.fetch = fetchFn;
    await renderAndWait();
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      const deleteCalls = fetchFn.mock.calls.filter((c) => {
        const opts = c[1] as { method?: string } | undefined;
        return opts?.method === 'DELETE';
      });
      expect(deleteCalls.length).toBe(0);
    });
  });

  it('shows error message on delete failure', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [makeClient()] }) })
      .mockResolvedValueOnce({ json: async () => ({ success: false, message: 'Delete failed' }) });
    await renderAndWait();
    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });
    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument();
    });
  });

  it('shows generic error when delete fetch throws', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [makeClient()] }) })
      .mockRejectedValueOnce(new Error('Delete error'));
    await renderAndWait();
    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });
    await waitFor(() => {
      expect(screen.getByText('Delete error')).toBeInTheDocument();
    });
  });
});

describe('OAuthClientsManager — clipboard copy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.confirm = vi.fn(() => true);
  });

  it('copies client_id to clipboard from revealed panel', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) })
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: { client_id: 'copy_this_id', client_secret: 'copy_this_secret' },
        }),
      })
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: [] }) });
    await renderAndWait();
    fireEvent.click(screen.getByText('New app'));
    fireEvent.change(screen.getByPlaceholderText('e.g. My Integration App'), { target: { value: 'App' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/oauth/callback'), {
      target: { value: 'https://x.com/cb' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create app'));
    });
    await waitFor(() => screen.getByText('copy_this_id'));
    const copyBtns = screen.getAllByText('Copy');
    fireEvent.click(copyBtns[0]);
    expect(writeText).toHaveBeenCalledWith('copy_this_id');
  });
});
