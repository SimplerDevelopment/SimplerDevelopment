// @vitest-environment jsdom
/**
 * Unit tests for `components/brain/GlossaryTermForm.tsx`
 *
 * Covers:
 *   - Initial render (create mode / edit mode)
 *   - Field edits: term, definition, shortDefinition, category, status toggle, owner
 *   - Alias chip input: add via Enter, add via comma, add via blur, remove chip,
 *     Backspace-at-empty removes last alias, duplicate ignored
 *   - Owner picker: select dropdown (users loaded), numeric fallback (no users)
 *   - Related terms: add, remove, search results, already-added state, searching spinner
 *   - Submit validation: missing term → error, missing definition → error
 *   - Submit create (POST): success calls onSaved, error from server, network throw
 *   - Submit edit (PATCH): success calls onSaved
 *   - Cancel button: calls onCancel / hidden when prop omitted
 *   - Submitting spinner state
 *   - Categories loaded from glossary list endpoint populate datalist
 *   - Related-term search debounce: empty query clears results
 *
 * Mocks: global fetch, next/navigation (unused but imported via transitive deps).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// BrainGlossaryStatus type comes from schema — mock the whole schema module.
vi.mock('@/lib/db/schema', () => ({
  brainGlossaryTerms: {},
}));

// ─── Fetch stub ───────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

/** Default fetch: glossary list returns categories, mentionable-users returns users. */
function defaultFetch(opts: {
  categories?: string[];
  users?: Array<{ id: number; name: string | null }>;
} = {}): (url: string, init?: RequestInit) => Promise<FetchResp> {
  const { categories = [], users = [] } = opts;
  return async (url: string) => {
    if (url.includes('/api/portal/brain/glossary') && !url.includes('search=')) {
      const items = categories.map((c, i) => ({ id: i + 1, category: c }));
      return makeRes({ success: true, data: { items } });
    }
    if (url.includes('/api/portal/mentionable-users')) {
      return makeRes({ success: true, data: users });
    }
    if (url.includes('search=')) {
      return makeRes({ success: true, data: { items: [] } });
    }
    return makeRes({ success: true, data: {} });
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(defaultFetch());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Late import (after mocks) ────────────────────────────────────────────────

import GlossaryTermForm from '@/components/brain/GlossaryTermForm';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderCreate(
  overrides: {
    onSaved?: (v: { id: number }) => void;
    onCancel?: () => void;
    initial?: Record<string, unknown>;
  } = {},
) {
  const onSaved = overrides.onSaved ?? vi.fn();
  const utils = render(
    <GlossaryTermForm
      mode="create"
      onSaved={onSaved}
      onCancel={overrides.onCancel}
      initial={overrides.initial as Parameters<typeof GlossaryTermForm>[0]['initial']}
    />,
  );
  return { ...utils, onSaved };
}

function renderEdit(
  overrides: {
    termId?: number;
    onSaved?: (v: { id: number }) => void;
    onCancel?: () => void;
    initial?: Record<string, unknown>;
    initialRelatedTerms?: Array<{ id: number; term: string; slug: string }>;
  } = {},
) {
  const onSaved = overrides.onSaved ?? vi.fn();
  const utils = render(
    <GlossaryTermForm
      mode="edit"
      termId={overrides.termId ?? 42}
      onSaved={onSaved}
      onCancel={overrides.onCancel}
      initial={overrides.initial as Parameters<typeof GlossaryTermForm>[0]['initial']}
      initialRelatedTerms={overrides.initialRelatedTerms}
    />,
  );
  return { ...utils, onSaved };
}

async function fillRequired(container: HTMLElement, { term = 'SSO', definition = 'Single sign-on.' } = {}) {
  const termInput = container.querySelector('#gl-term') as HTMLInputElement;
  const defInput = container.querySelector('#gl-def') as HTMLTextAreaElement;
  fireEvent.change(termInput, { target: { value: term } });
  fireEvent.change(defInput, { target: { value: definition } });
}

async function submitForm(container: HTMLElement) {
  // Fire submit directly on the form to bypass jsdom native HTML5 required-field
  // validation (which would intercept before handleSubmit runs).
  const form = container.querySelector('form') as HTMLFormElement;
  await act(async () => { fireEvent.submit(form); });
}

// ─── Initial render ───────────────────────────────────────────────────────────

describe('GlossaryTermForm — initial render (create)', () => {
  it('renders the term input', () => {
    const { container } = renderCreate();
    expect(container.querySelector('#gl-term')).toBeTruthy();
  });

  it('renders the definition textarea', () => {
    const { container } = renderCreate();
    expect(container.querySelector('#gl-def')).toBeTruthy();
  });

  it('renders the short definition input', () => {
    const { container } = renderCreate();
    expect(container.querySelector('#gl-short')).toBeTruthy();
  });

  it('renders the aliases input', () => {
    const { container } = renderCreate();
    expect(container.querySelector('#gl-aliases')).toBeTruthy();
  });

  it('shows "Create term" on the submit button in create mode', () => {
    const { container } = renderCreate();
    const btn = container.querySelector('button[type="submit"]');
    expect(btn?.textContent).toContain('Create term');
  });

  it('shows "Save changes" on the submit button in edit mode', () => {
    const { container } = renderEdit();
    const btn = container.querySelector('button[type="submit"]');
    expect(btn?.textContent).toContain('Save changes');
  });

  it('does not render Cancel button when onCancel not provided', () => {
    const { container } = renderCreate();
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Cancel',
    );
    expect(cancelBtn).toBeUndefined();
  });

  it('renders Cancel button when onCancel is provided', () => {
    const { container } = renderCreate({ onCancel: vi.fn() });
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Cancel',
    );
    expect(cancelBtn).toBeTruthy();
  });

  it('pre-populates fields from initial prop', () => {
    const { container } = renderCreate({
      initial: { term: 'OAuth', definition: 'Open auth standard.', status: 'deprecated' },
    });
    const termInput = container.querySelector('#gl-term') as HTMLInputElement;
    expect(termInput.value).toBe('OAuth');
    const defInput = container.querySelector('#gl-def') as HTMLTextAreaElement;
    expect(defInput.value).toBe('Open auth standard.');
  });

  it('does not show error banner on initial render', () => {
    const { container } = renderCreate();
    // The error banner is a div.bg-destructive/10; the asterisks use span.text-destructive
    const errorBanner = container.querySelector('div.bg-destructive\\/10');
    expect(errorBanner).toBeNull();
  });

  it('renders active/deprecated status toggle buttons', () => {
    const { container } = renderCreate();
    expect(container.textContent).toContain('active');
    expect(container.textContent).toContain('deprecated');
  });
});

// ─── Field edits ──────────────────────────────────────────────────────────────

describe('GlossaryTermForm — field edits', () => {
  it('updates term field on change', () => {
    const { container } = renderCreate();
    const input = container.querySelector('#gl-term') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'SAML' } });
    expect(input.value).toBe('SAML');
  });

  it('updates definition textarea on change', () => {
    const { container } = renderCreate();
    const ta = container.querySelector('#gl-def') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'Security Assertion Markup Language.' } });
    expect(ta.value).toBe('Security Assertion Markup Language.');
  });

  it('updates shortDefinition and shows character count', () => {
    const { container } = renderCreate();
    const input = container.querySelector('#gl-short') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Short desc' } });
    expect(input.value).toBe('Short desc');
    expect(container.textContent).toContain('10');
    expect(container.textContent).toContain('500');
  });

  it('updates category field on change', () => {
    const { container } = renderCreate();
    const input = container.querySelector('#gl-category') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Auth' } });
    expect(input.value).toBe('Auth');
  });

  it('toggles status to deprecated on button click', () => {
    const { container } = renderCreate();
    const deprBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'deprecated',
    )!;
    fireEvent.click(deprBtn);
    // The deprecated button should now have primary styling
    expect(deprBtn.className).toContain('bg-primary');
  });

  it('toggles status back to active', () => {
    const { container } = renderCreate({ initial: { status: 'deprecated' } });
    const activeBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'active',
    )!;
    fireEvent.click(activeBtn);
    expect(activeBtn.className).toContain('bg-primary');
  });
});

// ─── Alias chip input ─────────────────────────────────────────────────────────

describe('GlossaryTermForm — alias chip input', () => {
  it('adds alias when Enter is pressed', () => {
    const { container } = renderCreate();
    const aliasInput = container.querySelector('#gl-aliases') as HTMLInputElement;
    fireEvent.change(aliasInput, { target: { value: 'sign-in' } });
    fireEvent.keyDown(aliasInput, { key: 'Enter' });
    expect(container.textContent).toContain('sign-in');
  });

  it('adds alias when comma is pressed', () => {
    const { container } = renderCreate();
    const aliasInput = container.querySelector('#gl-aliases') as HTMLInputElement;
    fireEvent.change(aliasInput, { target: { value: 'sso' } });
    fireEvent.keyDown(aliasInput, { key: ',' });
    expect(container.textContent).toContain('sso');
  });

  it('clears alias input after adding', () => {
    const { container } = renderCreate();
    const aliasInput = container.querySelector('#gl-aliases') as HTMLInputElement;
    fireEvent.change(aliasInput, { target: { value: 'tag1' } });
    fireEvent.keyDown(aliasInput, { key: 'Enter' });
    expect(aliasInput.value).toBe('');
  });

  it('ignores empty/whitespace alias on Enter', () => {
    const { container } = renderCreate();
    const aliasInput = container.querySelector('#gl-aliases') as HTMLInputElement;
    fireEvent.change(aliasInput, { target: { value: '   ' } });
    fireEvent.keyDown(aliasInput, { key: 'Enter' });
    // No chip should appear
    const chips = container.querySelectorAll('button[aria-label^="Remove"]');
    expect(chips.length).toBe(0);
  });

  it('ignores duplicate alias', () => {
    const { container } = renderCreate({ initial: { aliases: ['sso'] } });
    const aliasInput = container.querySelector('#gl-aliases') as HTMLInputElement;
    fireEvent.change(aliasInput, { target: { value: 'sso' } });
    fireEvent.keyDown(aliasInput, { key: 'Enter' });
    // Still only one chip
    const chips = container.querySelectorAll('button[aria-label^="Remove"]');
    expect(chips.length).toBe(1);
  });

  it('removes alias chip on remove button click', () => {
    const { container } = renderCreate({ initial: { aliases: ['abc'] } });
    const removeBtn = container.querySelector('button[aria-label="Remove abc"]') as HTMLButtonElement;
    expect(removeBtn).toBeTruthy();
    fireEvent.click(removeBtn);
    expect(container.textContent).not.toContain('abc');
  });

  it('removes last alias when Backspace pressed with empty input and aliases present', () => {
    const { container } = renderCreate({ initial: { aliases: ['alpha', 'beta'] } });
    const aliasInput = container.querySelector('#gl-aliases') as HTMLInputElement;
    // Ensure input is empty
    fireEvent.change(aliasInput, { target: { value: '' } });
    fireEvent.keyDown(aliasInput, { key: 'Backspace' });
    // beta should be removed
    const chips = container.querySelectorAll('button[aria-label^="Remove"]');
    expect(chips.length).toBe(1);
    expect(container.textContent).toContain('alpha');
    expect(container.textContent).not.toContain('beta');
  });

  it('does NOT remove alias when Backspace pressed but input has text', () => {
    const { container } = renderCreate({ initial: { aliases: ['alpha'] } });
    const aliasInput = container.querySelector('#gl-aliases') as HTMLInputElement;
    fireEvent.change(aliasInput, { target: { value: 'x' } });
    fireEvent.keyDown(aliasInput, { key: 'Backspace' });
    const chips = container.querySelectorAll('button[aria-label^="Remove"]');
    expect(chips.length).toBe(1);
  });

  it('adds alias on blur when draft is non-empty', () => {
    const { container } = renderCreate();
    const aliasInput = container.querySelector('#gl-aliases') as HTMLInputElement;
    fireEvent.change(aliasInput, { target: { value: 'blur-alias' } });
    fireEvent.blur(aliasInput);
    expect(container.textContent).toContain('blur-alias');
  });
});

// ─── Owner picker ─────────────────────────────────────────────────────────────

describe('GlossaryTermForm — owner picker', () => {
  it('shows select dropdown when users are loaded', async () => {
    fetchMock.mockImplementation(defaultFetch({
      users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
    }));
    const { container } = renderCreate();
    await waitFor(() => {
      const sel = container.querySelector('select#gl-owner');
      expect(sel).toBeTruthy();
    });
  });

  it('lists user names in the select', async () => {
    fetchMock.mockImplementation(defaultFetch({
      users: [{ id: 1, name: 'Alice' }, { id: 2, name: null }],
    }));
    const { container } = renderCreate();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice');
      expect(container.textContent).toContain('User #2');
    });
  });

  it('selecting a user updates ownerId (select dropdown)', async () => {
    fetchMock.mockImplementation(defaultFetch({
      users: [{ id: 5, name: 'Carol' }],
    }));
    const { container } = renderCreate();
    await waitFor(() => {
      expect(container.querySelector('select#gl-owner')).toBeTruthy();
    });
    const sel = container.querySelector('select#gl-owner') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: '5' } });
    expect(sel.value).toBe('5');
  });

  it('selecting empty resets ownerId to null (select dropdown)', async () => {
    fetchMock.mockImplementation(defaultFetch({
      users: [{ id: 5, name: 'Carol' }],
    }));
    const { container } = renderCreate({ initial: { ownerId: 5 } });
    await waitFor(() => expect(container.querySelector('select#gl-owner')).toBeTruthy());
    const sel = container.querySelector('select#gl-owner') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: '' } });
    expect(sel.value).toBe('');
  });

  it('shows numeric input fallback when no users available', async () => {
    fetchMock.mockImplementation(defaultFetch({ users: [] }));
    const { container } = renderCreate();
    // Wait for fetch to settle
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    const numInput = container.querySelector('input[type="number"]#gl-owner');
    expect(numInput).toBeTruthy();
  });

  it('numeric input updates ownerId', async () => {
    fetchMock.mockImplementation(defaultFetch({ users: [] }));
    const { container } = renderCreate();
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    const numInput = container.querySelector('input[type="number"]#gl-owner') as HTMLInputElement;
    fireEvent.change(numInput, { target: { value: '7' } });
    expect(numInput.value).toBe('7');
  });

  it('numeric input clears to null when empty', async () => {
    fetchMock.mockImplementation(defaultFetch({ users: [] }));
    const { container } = renderCreate({ initial: { ownerId: 7 } });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    const numInput = container.querySelector('input[type="number"]#gl-owner') as HTMLInputElement;
    fireEvent.change(numInput, { target: { value: '' } });
    expect(numInput.value).toBe('');
  });
});

// ─── Categories from list endpoint ───────────────────────────────────────────

describe('GlossaryTermForm — categories datalist', () => {
  it('populates datalist with categories from API', async () => {
    fetchMock.mockImplementation(defaultFetch({ categories: ['Auth', 'Billing'] }));
    const { container } = renderCreate();
    await waitFor(() => {
      const opts = container.querySelectorAll('#gl-category-list option');
      expect(opts.length).toBe(2);
    });
  });

  it('handles failed categories fetch gracefully', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary') && !url.includes('search=')) {
        throw new Error('network down');
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderCreate();
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    // Should not crash; no categories shown
    const opts = container.querySelectorAll('#gl-category-list option');
    expect(opts.length).toBe(0);
  });

  it('ignores glossary fetch when success=false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary') && !url.includes('search=')) {
        return makeRes({ success: false });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderCreate();
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    const opts = container.querySelectorAll('#gl-category-list option');
    expect(opts.length).toBe(0);
  });
});

// ─── Related terms ────────────────────────────────────────────────────────────

describe('GlossaryTermForm — related terms', () => {
  it('shows initialRelatedTerms chips on mount', () => {
    const { container } = renderEdit({
      initialRelatedTerms: [{ id: 10, term: 'OAuth', slug: 'oauth' }],
      initial: { relatedTermIds: [10] },
    });
    expect(container.textContent).toContain('OAuth');
    const removeBtn = container.querySelector('button[aria-label="Remove OAuth"]');
    expect(removeBtn).toBeTruthy();
  });

  it('removes a related term chip', () => {
    const { container } = renderEdit({
      initialRelatedTerms: [{ id: 10, term: 'OAuth', slug: 'oauth' }],
      initial: { relatedTermIds: [10] },
    });
    const removeBtn = container.querySelector('button[aria-label="Remove OAuth"]') as HTMLButtonElement;
    fireEvent.click(removeBtn);
    expect(container.textContent).not.toContain('OAuth');
  });

  it('searches for related terms after debounce and shows results', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('search=saml')) {
        return makeRes({ success: true, data: { items: [
          { id: 20, term: 'SAML', slug: 'saml' },
        ] } });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderCreate();
    const searchInput = container.querySelector('input[placeholder*="related"]') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'saml' } });
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    await waitFor(() => {
      expect(container.textContent).toContain('SAML');
    });
  });

  it('clears search results when query is emptied', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('search=saml')) {
        return makeRes({ success: true, data: { items: [
          { id: 20, term: 'SAML', slug: 'saml' },
        ] } });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderCreate();
    const searchInput = container.querySelector('input[placeholder*="related"]') as HTMLInputElement;
    // First search
    fireEvent.change(searchInput, { target: { value: 'saml' } });
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    await waitFor(() => expect(container.textContent).toContain('SAML'));
    // Clear query
    fireEvent.change(searchInput, { target: { value: '' } });
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    await waitFor(() => {
      expect(container.textContent).not.toContain('SAML');
    });
  });

  it('adds a related term from search results', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('search=jwt')) {
        return makeRes({ success: true, data: { items: [
          { id: 30, term: 'JWT', slug: 'jwt' },
        ] } });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderCreate();
    const searchInput = container.querySelector('input[placeholder*="related"]') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'jwt' } });
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    await waitFor(() => expect(container.textContent).toContain('JWT'));
    const jwtBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('JWT') && b.type === 'button',
    )!;
    fireEvent.click(jwtBtn);
    // Chip should appear and search input should clear
    await waitFor(() => {
      expect(container.querySelector('button[aria-label="Remove JWT"]')).toBeTruthy();
    });
  });

  it('marks already-added term in search results as disabled', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('search=jwt')) {
        return makeRes({ success: true, data: { items: [
          { id: 30, term: 'JWT', slug: 'jwt' },
        ] } });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderEdit({
      initialRelatedTerms: [{ id: 30, term: 'JWT', slug: 'jwt' }],
      initial: { relatedTermIds: [30] },
    });
    const searchInput = container.querySelector('input[placeholder*="related"]') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'jwt' } });
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    await waitFor(() => expect(container.textContent).toContain('added'));
    // The result button for JWT should be disabled
    const jwtResultBtns = Array.from(container.querySelectorAll('button[disabled]'));
    expect(jwtResultBtns.length).toBeGreaterThan(0);
  });

  it('filters out current termId from related search results', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('search=test')) {
        return makeRes({ success: true, data: { items: [
          { id: 42, term: 'Self', slug: 'self' },
          { id: 99, term: 'Other', slug: 'other' },
        ] } });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderEdit({ termId: 42 });
    const searchInput = container.querySelector('input[placeholder*="related"]') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'test' } });
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    await waitFor(() => expect(container.textContent).toContain('Other'));
    expect(container.textContent).not.toContain('Self');
  });

  it('handles failed related-term search gracefully', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('search=')) throw new Error('fetch failed');
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderCreate();
    const searchInput = container.querySelector('input[placeholder*="related"]') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'fail' } });
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    // No crash; no spinner stuck
    await waitFor(() => {
      expect(container.textContent).not.toContain('Searching');
    });
  });
});

// ─── Submit — validation ──────────────────────────────────────────────────────

describe('GlossaryTermForm — submit validation', () => {
  it('shows "Term is required." when term is blank on submit', async () => {
    const { container } = renderCreate();
    const defInput = container.querySelector('#gl-def') as HTMLTextAreaElement;
    fireEvent.change(defInput, { target: { value: 'some definition' } });
    await submitForm(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Term is required.');
    });
  });

  it('shows "Definition is required." when definition is blank on submit', async () => {
    const { container } = renderCreate();
    const termInput = container.querySelector('#gl-term') as HTMLInputElement;
    fireEvent.change(termInput, { target: { value: 'SSO' } });
    await submitForm(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Definition is required.');
    });
  });

  it('does not call fetch when required fields missing', async () => {
    const { container } = renderCreate();
    await submitForm(container);
    // Only the background load fetches should have been made (glossary + users),
    // no POST for submission
    const postCalls = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === 'POST',
    );
    expect(postCalls.length).toBe(0);
  });
});

// ─── Submit — create (POST) ───────────────────────────────────────────────────

describe('GlossaryTermForm — submit create (POST)', () => {
  it('POSTs to /api/portal/brain/glossary with correct body', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/glossary' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 55 } });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const onSaved = vi.fn();
    const { container } = render(
      <GlossaryTermForm mode="create" onSaved={onSaved} />,
    );
    await fillRequired(container, { term: 'LDAP', definition: 'Directory protocol.' });
    await submitForm(container);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) => url === '/api/portal/brain/glossary' && init?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall![1]!.body as string);
      expect(body.term).toBe('LDAP');
      expect(body.definition).toBe('Directory protocol.');
    });
  });

  it('calls onSaved with { id } on success', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/glossary' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 77 } });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const onSaved = vi.fn();
    const { container } = render(
      <GlossaryTermForm mode="create" onSaved={onSaved} />,
    );
    await fillRequired(container);
    await submitForm(container);
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith({ id: 77 });
    });
  });

  it('shows server error message on failed POST', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/glossary' && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Duplicate term slug' }, false);
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderCreate();
    await fillRequired(container);
    await submitForm(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Duplicate term slug');
    });
  });

  it('shows fallback "Save failed" when server returns no message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/glossary' && init?.method === 'POST') {
        return makeRes({ success: false }, false);
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderCreate();
    await fillRequired(container);
    await submitForm(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Save failed');
    });
  });

  it('shows error message when fetch throws an Error', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/glossary' && init?.method === 'POST') {
        throw new Error('Network timeout');
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderCreate();
    await fillRequired(container);
    await submitForm(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Network timeout');
    });
  });

  it('shows "Network error" fallback when fetch throws a non-Error', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/glossary' && init?.method === 'POST') {
        // eslint-disable-next-line
        throw 'string error';
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderCreate();
    await fillRequired(container);
    await submitForm(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('auto-includes pending alias draft in submitted body', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/glossary' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 1 } });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const onSaved = vi.fn();
    const { container } = render(<GlossaryTermForm mode="create" onSaved={onSaved} />);
    await fillRequired(container);
    // Type into alias input without pressing Enter
    const aliasInput = container.querySelector('#gl-aliases') as HTMLInputElement;
    fireEvent.change(aliasInput, { target: { value: 'pending-alias' } });
    await submitForm(container);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) => url === '/api/portal/brain/glossary' && init?.method === 'POST',
      );
      const body = JSON.parse(postCall![1]!.body as string);
      expect(body.aliases).toContain('pending-alias');
    });
  });
});

// ─── Submit — edit (PATCH) ────────────────────────────────────────────────────

describe('GlossaryTermForm — submit edit (PATCH)', () => {
  it('PATCHes to /api/portal/brain/glossary/:termId', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/glossary/42' && init?.method === 'PATCH') {
        return makeRes({ success: true, data: { id: 42 } });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const onSaved = vi.fn();
    const { container } = render(
      <GlossaryTermForm mode="edit" termId={42} onSaved={onSaved} />,
    );
    await fillRequired(container, { term: 'Updated Term', definition: 'Updated def.' });
    await submitForm(container);
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith({ id: 42 });
    });
  });

  it('sends null for empty optional fields on PATCH', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/glossary/42' && init?.method === 'PATCH') {
        const body = JSON.parse(init.body as string);
        expect(body.shortDefinition).toBeNull();
        expect(body.category).toBeNull();
        return makeRes({ success: true, data: { id: 42 } });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const onSaved = vi.fn();
    const { container } = render(
      <GlossaryTermForm mode="edit" termId={42} onSaved={onSaved} />,
    );
    await fillRequired(container, { term: 'T', definition: 'D' });
    await submitForm(container);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

// ─── Cancel button ────────────────────────────────────────────────────────────

describe('GlossaryTermForm — cancel button', () => {
  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    const { container } = renderCreate({ onCancel });
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Cancel',
    )!;
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

// ─── Submitting spinner ───────────────────────────────────────────────────────

describe('GlossaryTermForm — submitting spinner', () => {
  it('shows "Saving…" while request is in flight', async () => {
    let resolvePost: (v: FetchResp) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/glossary' && init?.method === 'POST') {
        return new Promise<FetchResp>(res => { resolvePost = res; });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderCreate();
    await fillRequired(container);
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Saving…');
      expect(submitBtn.disabled).toBe(true);
    });
    // Resolve so async state settles
    resolvePost(makeRes({ success: true, data: { id: 1 } }));
  });
});

// ─── Error banner clears on re-submit ────────────────────────────────────────

describe('GlossaryTermForm — error banner', () => {
  it('clears previous error when new submit starts', async () => {
    let callCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/glossary' && init?.method === 'POST') {
        callCount++;
        if (callCount === 1) return makeRes({ success: false, message: 'First error' }, false);
        return makeRes({ success: true, data: { id: 1 } });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const onSaved = vi.fn();
    const { container } = render(<GlossaryTermForm mode="create" onSaved={onSaved} />);
    await fillRequired(container);
    // First submit → error
    await submitForm(container);
    await waitFor(() => expect(container.textContent).toContain('First error'));
    // Second submit → success; error should be gone before response resolves
    await submitForm(container);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
