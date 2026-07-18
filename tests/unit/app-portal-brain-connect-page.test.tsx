// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/connect/page.tsx`
 *
 * 'use client' React component.
 *
 * Behaviour under test:
 *   - Renders heading, breadcrumb, and main sections on mount
 *   - hasBrainScope logic: active/revoked/wildcard/brain:* scopes
 *   - formatDate: valid date, null, invalid string
 *   - Connection status badge (Connected / Not connected)
 *   - Key table renders when brain keys exist
 *   - Loading state for keys
 *   - Generate API key flow: happy path, error path, network error
 *   - New key display + copy/dismiss actions
 *   - Test connection flow: ok, fail, network error, non-Error throw
 *   - claudeConfig JSON contains MCP endpoint and placeholder
 *   - Copy buttons (key, config)
 *   - origin detection (window.location.origin)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ── next/link stub ────────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => React.createElement('a', { href, ...rest }, children),
}));

// ── Fetch mock ────────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status: number; json: () => Promise<unknown> };

function makeRes(
  body: unknown,
  opts: { ok?: boolean; status?: number } = {},
): FetchResp {
  const ok = opts.ok ?? true;
  return {
    ok,
    status: opts.status ?? (ok ? 200 : 500),
    json: async () => body,
  };
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeApiKey(overrides: Partial<{
  id: number;
  name: string;
  keyPreview: string;
  scopes: string[];
  active: boolean;
  requireCmsApproval: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}> = {}) {
  return {
    id: 1,
    name: 'Claude Desktop – Brain',
    keyPreview: 'sdpk_****abcd',
    scopes: ['brain:read', 'brain:write', 'brain:approve'],
    active: true,
    requireCmsApproval: false,
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: '2025-01-01T12:00:00Z',
    ...overrides,
  };
}

function defaultFetch(url: string): FetchResp {
  if (url.includes('/api/portal/api-keys')) {
    return makeRes({ success: true, data: [makeApiKey()] });
  }
  return makeRes({ success: true, data: [] });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetch(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Import after mocks ────────────────────────────────────────────────────────

import BrainConnectPage from '@/app/portal/brain/connect/page';

function renderPage() {
  return render(React.createElement(BrainConnectPage));
}

// ── Heading and static content ────────────────────────────────────────────────

describe('BrainConnectPage — static content', () => {
  it('renders the main heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('h1')?.textContent).toContain(
        'Connect Claude Desktop to Brain',
      );
    });
  });

  it('renders breadcrumb link to /portal/brain', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain('Brain');
    });
  });

  it('renders "Connect Claude Desktop" breadcrumb text', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connect Claude Desktop');
    });
  });

  it('renders the page description about MCP tools', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('MCP tools');
    });
  });

  it('renders all four section headings', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const h2s = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
      const joined = h2s.join(' ');
      expect(joined).toContain('Connection status');
      expect(joined).toContain('Generate API key');
      expect(joined).toContain('Claude Desktop config');
      expect(joined).toContain('Test connection');
    });
  });

  it('renders Settings » API Keys link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const links = Array.from(container.querySelectorAll('a'));
      const settingsLink = links.find((l) =>
        l.getAttribute('href')?.includes('/portal/settings/api-keys'),
      );
      expect(settingsLink).toBeTruthy();
    });
  });
});

// ── Claude Desktop config section ─────────────────────────────────────────────

describe('BrainConnectPage — claudeConfig section', () => {
  it('renders the claude_desktop_config.json filename reference', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('claude_desktop_config.json');
    });
  });

  it('renders YOUR_KEY placeholder in the config block', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('YOUR_KEY');
    });
  });

  it('renders simplerdevelopment-brain in the config', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('simplerdevelopment-brain');
    });
  });

  it('renders /api/mcp in the config endpoint', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('/api/mcp');
    });
  });

  it('renders mcp-remote in the config', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('mcp-remote');
    });
  });

  it('renders "Copy" button in the config section', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      // The copy-config button contains Material Icon text "content_copy" + "Copy"
      const buttons = Array.from(container.querySelectorAll('button'));
      const copyBtn = buttons.find(
        (b) => b.textContent?.includes('Copy') && b.textContent?.includes('content_copy'),
      );
      expect(copyBtn).toBeTruthy();
    });
  });

  it('renders the numbered install steps (Restart Claude Desktop)', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Restart Claude Desktop');
    });
  });
});

// ── Connection status — loading ────────────────────────────────────────────────

describe('BrainConnectPage — loading state', () => {
  it('shows loading keys message while fetch is pending', () => {
    fetchMock.mockImplementation(() => new Promise<FetchResp>(() => { /* never resolves */ }));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading keys');
  });
});

// ── Connection status — connected ─────────────────────────────────────────────

describe('BrainConnectPage — connected state', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({ success: true, data: [makeApiKey()] });
      }
      return makeRes({ success: true });
    });
  });

  it('shows "Connected" badge when brain key exists', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connected');
    });
  });

  it('shows key name in the table', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Claude Desktop – Brain');
    });
  });

  it('shows key preview in the table', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('sdpk_****abcd');
    });
  });

  it('shows scope badges in the table', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('brain:read');
      expect(container.textContent).toContain('brain:write');
      expect(container.textContent).toContain('brain:approve');
    });
  });

  it('shows "Never" for last used when lastUsedAt is null', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Never');
    });
  });

  it('renders key table with correct column headers', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const text = container.textContent ?? '';
      expect(text).toContain('Name');
      expect(text).toContain('Key');
      expect(text).toContain('Scopes');
      expect(text).toContain('Last used');
      expect(text).toContain('Created');
    });
  });

  it('formats createdAt date in the table', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      // Just verify some date-like text appears in the table area
      // The exact format depends on toLocaleString() which is locale-dependent
      const tables = container.querySelectorAll('table');
      expect(tables.length).toBeGreaterThan(0);
    });
  });
});

// ── Connection status — not connected ─────────────────────────────────────────

describe('BrainConnectPage — not connected state', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true });
    });
  });

  it('shows "Not connected" badge when no brain keys', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Not connected');
    });
  });

  it('shows descriptive empty state text', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No API keys with brain scopes');
    });
  });

  it('does not render the keys table', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('table')).toBeNull();
    });
  });
});

// ── hasBrainScope filtering ───────────────────────────────────────────────────

describe('BrainConnectPage — hasBrainScope filtering', () => {
  it('treats wildcard scope (*) as having brain scopes', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({
          success: true,
          data: [makeApiKey({ scopes: ['*'] })],
        });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connected');
    });
  });

  it('treats brain:* scope as having brain scopes', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({
          success: true,
          data: [makeApiKey({ scopes: ['brain:*'] })],
        });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connected');
    });
  });

  it('does not show Connected for revoked key even with brain scopes', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({
          success: true,
          data: [makeApiKey({ revokedAt: '2025-06-01T00:00:00Z' })],
        });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Not connected');
    });
  });

  it('does not show Connected for inactive key', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({
          success: true,
          data: [makeApiKey({ active: false })],
        });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Not connected');
    });
  });

  it('does not show Connected for key with unrelated scopes only', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({
          success: true,
          data: [makeApiKey({ scopes: ['posts:read', 'media:write'] })],
        });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Not connected');
    });
  });

  it('shows Connected for individual brain:read scope', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({
          success: true,
          data: [makeApiKey({ scopes: ['brain:read'] })],
        });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connected');
    });
  });

  it('shows Connected for brain:approve scope', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({
          success: true,
          data: [makeApiKey({ scopes: ['brain:approve'] })],
        });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connected');
    });
  });
});

// ── lastUsedAt date display ───────────────────────────────────────────────────

describe('BrainConnectPage — last used date display', () => {
  it('shows a formatted date string when lastUsedAt is set', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({
          success: true,
          data: [makeApiKey({ lastUsedAt: '2025-03-15T10:30:00Z' })],
        });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      // toLocaleString produces something with "2025" in it
      expect(container.textContent).toContain('2025');
    });
  });

  it('shows "—" (em-dash) for null date fields via formatDate', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({
          success: true,
          data: [makeApiKey({ lastUsedAt: null, createdAt: 'not-a-date' })],
        });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      // formatDate(null) returns '—', formatDate('not-a-date') returns '—'
      expect(container.textContent).toContain('—');
    });
  });
});

// ── Generate API key — happy path ─────────────────────────────────────────────

describe('BrainConnectPage — generate key (happy path)', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/api-keys') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: { key: 'sdpk_full-secret-key-here' },
        });
      }
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({ success: true, data: [makeApiKey()] });
      }
      return makeRes({ success: true });
    });
  });

  it('renders "Generate API key for Claude Desktop" button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btns = Array.from(container.querySelectorAll('button'));
      expect(
        btns.some((b) => b.textContent?.includes('Generate API key')),
      ).toBe(true);
    });
  });

  it('shows the new key after generate succeeds', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate API key'),
    ) as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('sdpk_full-secret-key-here');
    });
  });

  it('shows "Save this key now" warning banner after generate', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate API key'),
    ) as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(container.textContent).toContain("Save this key now");
    });
  });

  it('shows "Copy key" button after key is generated', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate API key'),
    ) as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      const btns = Array.from(container.querySelectorAll('button'));
      expect(btns.some((b) => b.textContent?.includes('Copy key'))).toBe(true);
    });
  });

  it('"I\'ve saved it" button dismisses the key banner', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate API key'),
    ) as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(container.textContent).toContain("I've saved it");
    });

    const savedBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes("I've saved it"),
    ) as HTMLButtonElement;
    fireEvent.click(savedBtn);

    await waitFor(() => {
      expect(container.textContent).not.toContain('sdpk_full-secret-key-here');
    });
  });
});

// ── Generate API key — error path ─────────────────────────────────────────────

describe('BrainConnectPage — generate key (error path)', () => {
  it('shows error message when server returns !ok', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/api-keys') && init?.method === 'POST') {
        return makeRes(
          { success: false, message: 'Quota exceeded' },
          { ok: false, status: 403 },
        );
      }
      return makeRes({ success: true, data: [] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate API key'),
    ) as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('Quota exceeded');
    });
  });

  it('shows "Failed to generate key." fallback when no message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/api-keys') && init?.method === 'POST') {
        return makeRes({ success: false }, { ok: false, status: 500 });
      }
      return makeRes({ success: true, data: [] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate API key'),
    ) as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('Failed to generate key.');
    });
  });

  it('shows network error message when generate fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/api-keys') && init?.method === 'POST') {
        throw new Error('timeout');
      }
      return makeRes({ success: true, data: [] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate API key'),
    ) as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('timeout');
    });
  });

  it('shows "Network error" for non-Error generate throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/api-keys') && init?.method === 'POST') {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string thrown';
      }
      return makeRes({ success: true, data: [] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate API key'),
    ) as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('generate button is disabled while generating', async () => {
    // Make POST hang forever
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/api-keys') && init?.method === 'POST') {
        return new Promise<FetchResp>(() => { /* never resolves */ });
      }
      return makeRes({ success: true, data: [] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate API key'),
    ) as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Generating'),
      );
      expect(btn).toBeTruthy();
    });
  });
});

// Helper: find the "Test connection" button (it contains Material Icon text too)
function findTestConnectionBtn(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.includes('Test connection') || b.textContent?.includes('Testing'),
  ) as HTMLButtonElement | undefined;
}

// ── Test connection ────────────────────────────────────────────────────────────

describe('BrainConnectPage — test connection', () => {
  it('renders "Test connection" button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).not.toContain('Loading keys');
    });
    await waitFor(() => {
      const btns = Array.from(container.querySelectorAll('button'));
      expect(btns.some((b) => b.textContent?.includes('Test connection'))).toBe(true);
    });
  });

  it('shows success message on successful test', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/search')) {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: [makeApiKey()] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).not.toContain('Loading keys'));

    const testBtn = findTestConnectionBtn(container);
    expect(testBtn).toBeTruthy();
    fireEvent.click(testBtn!);

    await waitFor(() => {
      expect(container.textContent).toContain('Brain is reachable from this browser session.');
    });
  });

  it('shows failure message when brain search returns !ok', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/search')) {
        return makeRes({ success: false, message: 'Brain offline' }, { ok: false, status: 503 });
      }
      return makeRes({ success: true, data: [makeApiKey()] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).not.toContain('Loading keys'));

    const testBtn = findTestConnectionBtn(container);
    expect(testBtn).toBeTruthy();
    fireEvent.click(testBtn!);

    await waitFor(() => {
      expect(container.textContent).toContain('Brain offline');
    });
  });

  it('shows failure message when brain search returns success=false with ok', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/search')) {
        return makeRes({ success: false, message: 'Not ready' }, { ok: true });
      }
      return makeRes({ success: true, data: [makeApiKey()] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).not.toContain('Loading keys'));

    const testBtn = findTestConnectionBtn(container);
    expect(testBtn).toBeTruthy();
    fireEvent.click(testBtn!);

    await waitFor(() => {
      expect(container.textContent).toContain('Not ready');
    });
  });

  it('shows "Request failed" with status when no message in failure body', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/search')) {
        return makeRes({}, { ok: false, status: 401 });
      }
      return makeRes({ success: true, data: [makeApiKey()] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).not.toContain('Loading keys'));

    const testBtn = findTestConnectionBtn(container);
    expect(testBtn).toBeTruthy();
    fireEvent.click(testBtn!);

    await waitFor(() => {
      expect(container.textContent).toContain('401');
    });
  });

  it('shows error message when test fetch throws an Error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/search')) {
        throw new Error('connection refused');
      }
      return makeRes({ success: true, data: [makeApiKey()] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).not.toContain('Loading keys'));

    const testBtn = findTestConnectionBtn(container);
    expect(testBtn).toBeTruthy();
    fireEvent.click(testBtn!);

    await waitFor(() => {
      expect(container.textContent).toContain('connection refused');
    });
  });

  it('shows "Network error" when test fetch throws a non-Error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/search')) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'raw string';
      }
      return makeRes({ success: true, data: [makeApiKey()] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).not.toContain('Loading keys'));

    const testBtn = findTestConnectionBtn(container);
    expect(testBtn).toBeTruthy();
    fireEvent.click(testBtn!);

    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('test button shows "Testing…" while request is in flight', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/search')) {
        return new Promise<FetchResp>(() => { /* never resolves */ });
      }
      return makeRes({ success: true, data: [makeApiKey()] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).not.toContain('Loading keys'));

    const testBtn = findTestConnectionBtn(container);
    expect(testBtn).toBeTruthy();
    fireEvent.click(testBtn!);

    await waitFor(() => {
      const btns = Array.from(container.querySelectorAll('button'));
      expect(btns.some((b) => b.textContent?.includes('Testing'))).toBe(true);
    });
  });
});

// ── Copy key button ────────────────────────────────────────────────────────────

describe('BrainConnectPage — copy key button', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/api-keys') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: { key: 'sdpk_copy-me-key' },
        });
      }
      return makeRes({ success: true, data: [makeApiKey()] });
    });
  });

  it('shows "Copied" after clicking copy key (clipboard write succeeds)', async () => {
    const clipboardMock = { writeText: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('navigator', { clipboard: clipboardMock });

    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate API key'),
    ) as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      const btns = Array.from(container.querySelectorAll('button'));
      expect(btns.some((b) => b.textContent?.includes('Copy key'))).toBe(true);
    });

    const copyKeyBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Copy key'),
    ) as HTMLButtonElement;
    fireEvent.click(copyKeyBtn);

    await waitFor(() => {
      const btns = Array.from(container.querySelectorAll('button'));
      expect(btns.some((b) => b.textContent?.includes('Copied'))).toBe(true);
    });

    expect(clipboardMock.writeText).toHaveBeenCalledWith('sdpk_copy-me-key');
  });

  it('does not throw when clipboard write fails', async () => {
    const clipboardMock = { writeText: vi.fn().mockRejectedValue(new Error('denied')) };
    vi.stubGlobal('navigator', { clipboard: clipboardMock });

    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());

    const generateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generate API key'),
    ) as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      const btns = Array.from(container.querySelectorAll('button'));
      expect(btns.some((b) => b.textContent?.includes('Copy key'))).toBe(true);
    });

    const copyKeyBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Copy key'),
    ) as HTMLButtonElement;

    // Should not throw
    await act(async () => {
      fireEvent.click(copyKeyBtn);
    });
  });
});

// ── Copy config button ─────────────────────────────────────────────────────────

// The copy-config button contains Material Icon text "content_copy" then "Copy"
function findCopyConfigBtn(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.includes('content_copy') && b.textContent?.includes('Copy'),
  ) as HTMLButtonElement | undefined;
}

describe('BrainConnectPage — copy config button', () => {
  it('shows "Copied" after clicking Copy config button', async () => {
    const clipboardMock = { writeText: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('navigator', { clipboard: clipboardMock });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).not.toContain('Loading keys'));

    const copyConfigBtn = findCopyConfigBtn(container);
    expect(copyConfigBtn).toBeTruthy();
    fireEvent.click(copyConfigBtn!);

    await waitFor(() => {
      const btns = Array.from(container.querySelectorAll('button'));
      // After copy, icon changes to 'check' and label changes to 'Copied'
      expect(btns.some((b) => b.textContent?.includes('Copied'))).toBe(true);
    });

    expect(clipboardMock.writeText).toHaveBeenCalled();
    const written = clipboardMock.writeText.mock.calls[0][0] as string;
    expect(written).toContain('simplerdevelopment-brain');
  });

  it('does not throw when config clipboard write fails', async () => {
    const clipboardMock = { writeText: vi.fn().mockRejectedValue(new Error('denied')) };
    vi.stubGlobal('navigator', { clipboard: clipboardMock });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).not.toContain('Loading keys'));

    const copyConfigBtn = findCopyConfigBtn(container);
    expect(copyConfigBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(copyConfigBtn!);
    });
    // No throw expected
  });
});

// ── API fetch on mount ─────────────────────────────────────────────────────────

describe('BrainConnectPage — API calls', () => {
  it('fetches /api/portal/api-keys on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/api-keys'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('renders page content even when api-keys fetch returns success=false', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: false }, { ok: false, status: 500 }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      // page still renders sections
      expect(container.querySelector('h1')).toBeTruthy();
    });
  });

  it('renders page content even when api-keys fetch throws', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('h1')).toBeTruthy();
    });
  });
});

// ── Multiple brain keys in table ──────────────────────────────────────────────

describe('BrainConnectPage — multiple brain keys', () => {
  it('renders multiple rows when multiple active brain keys exist', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/api-keys')) {
        return makeRes({
          success: true,
          data: [
            makeApiKey({ id: 1, name: 'Key Alpha', keyPreview: 'sdpk_aaaa' }),
            makeApiKey({ id: 2, name: 'Key Beta', keyPreview: 'sdpk_bbbb' }),
          ],
        });
      }
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Key Alpha');
      expect(container.textContent).toContain('Key Beta');
      expect(container.textContent).toContain('sdpk_aaaa');
      expect(container.textContent).toContain('sdpk_bbbb');
    });
  });
});
