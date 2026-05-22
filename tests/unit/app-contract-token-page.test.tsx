// @vitest-environment jsdom
/**
 * Unit tests for `app/contract/[token]/page.tsx` — the public contract signing
 * page used by recipients of a contract link. Drives the security/legal-critical
 * paths: invalid token, already-signed, already-declined, fully-executed,
 * required-clause gating, signature capture via canvas, sign submission and
 * decline submission. Mocks `react.use(params)`, `fetch`,
 * `@/lib/security/sanitize-html`, and the canvas 2d context.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

vi.mock('@/lib/security/sanitize-html', () => ({
  sanitizeHtml: (html: string) => html ?? '',
  sanitizeRichHtml: (html: string) => html ?? '',
}));

// ─── Canvas 2D context stub for jsdom ───────────────────────────────────────
// jsdom doesn't implement canvas; provide enough surface that the drawing
// helpers don't blow up when called from event handlers.
beforeEach(() => {
  // 2D context stub
  HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
    return {
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  }) as any;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,SIG');
  HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
    x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 150,
    width: 600, height: 150, toJSON: () => ({}),
  })) as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Fetch helpers ──────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: any) => any | Promise<any>;
let fetchHandler: FetchHandler | null = null;

function setFetchHandler(handler: FetchHandler) {
  fetchHandler = handler;
}

function jsonResponse(body: any) {
  return { ok: true, json: async () => body } as any;
}

beforeEach(() => {
  fetchHandler = null;
  global.fetch = vi.fn((url: any, init?: any) => {
    if (fetchHandler) return Promise.resolve(fetchHandler(String(url), init));
    return Promise.resolve(jsonResponse({ success: false, message: 'unhandled' }));
  }) as any;
  // Suppress alert
  // @ts-expect-error global alert is jsdom-provided but typed loosely
  window.alert = vi.fn();
});

// ─── Imports under test (after mocks) ───────────────────────────────────────

import ContractSigningPage from '@/app/contract/[token]/page';

// React.use() requires a thenable that's already resolved.
function makeParams(token: string): any {
  const p: any = Promise.resolve({ token });
  p.status = 'fulfilled';
  p.value = { token };
  return p;
}

// ─── Fixture builders ───────────────────────────────────────────────────────

function makeContract(overrides: any = {}) {
  return {
    title: 'Master Services Agreement',
    summary: 'A summary of the agreement',
    clauses: [
      { id: 'c1', title: 'Confidentiality', content: '<p>Be confidential</p>', required: true },
      { id: 'c2', title: 'Optional clause', content: '<p>Optional</p>', required: false },
    ],
    lineItems: [
      { id: 'li1', description: 'Discovery', quantity: 1, unitPrice: 100000 },
      { id: 'li2', description: 'Build', quantity: 2, unitPrice: 50000 },
    ],
    fees: [
      { label: 'Tax', type: 'percent', amount: 1000 }, // 10%
      { label: 'Setup', type: 'flat', amount: 5000 },
    ],
    currency: 'USD',
    accentColor: '#abcdef',
    logoUrl: 'https://logo.test/l.png',
    footerText: 'Footer text here',
    status: 'sent',
    companyName: 'Acme Inc',
    signer: { id: 1, name: 'Recipient', email: 'r@test.com', role: 'client', status: 'pending', signedAt: null },
    allSigners: [
      { id: 1, name: 'Recipient', email: 'r@test.com', role: 'client', status: 'pending', signedAt: null },
      { id: 2, name: 'Signed Person', email: 's@test.com', role: 'company', status: 'signed', signedAt: '2025-01-01' },
      { id: 3, name: 'Declined Person', email: 'd@test.com', role: 'witness', status: 'declined', signedAt: null },
      { id: 4, name: 'Viewed Person', email: 'v@test.com', role: 'cc', status: 'viewed', signedAt: null },
    ],
    ...overrides,
  };
}

function renderPage(token = 'tok-abc') {
  return render(<ContractSigningPage params={makeParams(token)} />);
}

async function flushEffects() {
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ContractSigningPage', () => {
  it('renders loading spinner initially before fetch resolves', () => {
    // Never-resolving fetch so loading state sticks
    global.fetch = vi.fn(() => new Promise(() => {})) as any;
    const { container } = renderPage();
    // Spinner has the animate-spin class.
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders "Contract Not Found" for invalid token (SECURITY: bad token surface)', async () => {
    setFetchHandler(() => jsonResponse({ success: false, message: 'Invalid contract token' }));
    renderPage('bad-token');
    await flushEffects();
    expect(screen.getByText('Contract Not Found')).toBeTruthy();
    expect(screen.getByText('Invalid contract token')).toBeTruthy();
  });

  it('falls back to default error message when API returns no message', async () => {
    setFetchHandler(() => jsonResponse({ success: false }));
    renderPage();
    await flushEffects();
    expect(screen.getByText('Contract not found')).toBeTruthy();
  });

  it('renders network failure state when fetch rejects', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network down'))) as any;
    renderPage();
    await flushEffects();
    expect(screen.getByText('Failed to load contract')).toBeTruthy();
  });

  it('renders contract header, signers, clauses, pricing and footer', async () => {
    setFetchHandler(() => jsonResponse({ success: true, data: makeContract() }));
    const { container } = renderPage();
    await flushEffects();
    expect(screen.getByText('Master Services Agreement')).toBeTruthy();
    expect(screen.getByText('Acme Inc')).toBeTruthy();
    expect(screen.getByText('A summary of the agreement')).toBeTruthy();
    // Logo rendered
    const logo = container.querySelector('img');
    expect(logo?.getAttribute('src')).toBe('https://logo.test/l.png');
    // Signers - statuses
    expect(screen.getByText('Signed')).toBeTruthy();
    expect(screen.getByText('Declined')).toBeTruthy();
    expect(screen.getByText('Viewed')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    // Clauses
    expect(screen.getByText('1. Confidentiality')).toBeTruthy();
    expect(screen.getByText('2. Optional clause')).toBeTruthy();
    // Pricing - subtotal = 100000 + 2*50000 = 200000 cents = $2,000.00
    // tax = 10% of 200000 = 20000 cents = $200.00; flat = 5000 cents = $50.00
    // total = 200000 + 20000 + 5000 = 225000 cents = $2,250.00
    expect(screen.getByText('$2,250.00')).toBeTruthy();
    // Footer
    expect(screen.getByText('Footer text here')).toBeTruthy();
  });

  it('shows "You have signed this contract" when signer.status === "signed" (already-signed legal state)', async () => {
    const contract = makeContract({
      signer: { id: 1, name: 'Recipient', email: 'r@test.com', role: 'client', status: 'signed', signedAt: '2025-01-01' },
    });
    setFetchHandler(() => jsonResponse({ success: true, data: contract }));
    renderPage();
    await flushEffects();
    expect(screen.getByText('You have signed this contract.')).toBeTruthy();
    // Signature section must NOT render when already signed
    expect(screen.queryByText('Sign Contract')).toBeNull();
  });

  it('shows "You have declined this contract" when signer.status === "declined"', async () => {
    const contract = makeContract({
      signer: { id: 1, name: 'Recipient', email: 'r@test.com', role: 'client', status: 'declined', signedAt: null },
    });
    setFetchHandler(() => jsonResponse({ success: true, data: contract }));
    renderPage();
    await flushEffects();
    expect(screen.getByText('You have declined this contract.')).toBeTruthy();
    expect(screen.queryByText('Sign Contract')).toBeNull();
  });

  it('shows fully-executed banner when contract.status === "fully_executed"', async () => {
    const contract = makeContract({ status: 'fully_executed' });
    setFetchHandler(() => jsonResponse({ success: true, data: contract }));
    renderPage();
    await flushEffects();
    expect(screen.getByText(/fully executed/i)).toBeTruthy();
  });

  it('disables sign button until name + signature captured', async () => {
    setFetchHandler(() => jsonResponse({ success: true, data: makeContract() }));
    renderPage();
    await flushEffects();
    const signBtn = screen.getByRole('button', { name: /Sign Contract/i }) as HTMLButtonElement;
    expect(signBtn.disabled).toBe(true);

    // Add name only — still disabled (signature missing)
    const nameInput = screen.getByPlaceholderText('Enter your full name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });
    expect(signBtn.disabled).toBe(true);

    // Capture signature
    fireEvent.click(screen.getByText('Use This Signature'));
    expect(signBtn.disabled).toBe(false);
  });

  it('blocks signing until ALL required clauses are accepted (legal-critical)', async () => {
    setFetchHandler(() => jsonResponse({ success: true, data: makeContract() }));
    renderPage();
    await flushEffects();

    const nameInput = screen.getByPlaceholderText('Enter your full name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });
    fireEvent.click(screen.getByText('Use This Signature'));

    const signBtn = screen.getByRole('button', { name: /Sign Contract/i });
    // Spy on the POST — should NOT be invoked until clause is accepted
    let postCalled = false;
    setFetchHandler((url, init) => {
      if (init?.method === 'POST') postCalled = true;
      return jsonResponse({ success: true });
    });

    await act(async () => { fireEvent.click(signBtn); });

    // Alert was triggered; POST not made
    expect((window.alert as any).mock.calls.length).toBeGreaterThan(0);
    expect(postCalled).toBe(false);
  });

  it('signs successfully when name + signature + all required clauses are set (SECURITY happy path)', async () => {
    let postBody: any = null;
    let reloadCalled = false;
    setFetchHandler((url, init) => {
      if (init?.method === 'POST') {
        postBody = JSON.parse(init.body);
        return jsonResponse({ success: true });
      }
      if (postBody) {
        // 2nd GET = reload after successful sign
        reloadCalled = true;
        return jsonResponse({
          success: true,
          data: makeContract({
            signer: { id: 1, name: 'Jane Doe', email: 'r@test.com', role: 'client', status: 'signed', signedAt: '2025-05-20' },
          }),
        });
      }
      return jsonResponse({ success: true, data: makeContract() });
    });
    renderPage('tok-secure');
    await flushEffects();

    // Accept the required clause
    const requiredCheckbox = screen.getByLabelText(/I accept this clause/);
    fireEvent.click(requiredCheckbox);

    // Fill out signature
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: 'Jane Doe' } });
    fireEvent.click(screen.getByText('Use This Signature'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sign Contract/i }));
    });
    await flushEffects();

    expect(postBody).toEqual({ action: 'sign', signatureName: 'Jane Doe', signatureData: 'data:image/png;base64,SIG' });
    expect(reloadCalled).toBe(true);
    // After sign, "You have signed" banner should show
    await waitFor(() => expect(screen.getByText('You have signed this contract.')).toBeTruthy());
  });

  it('toggles clause acceptance off and back on (Set delete branch)', async () => {
    setFetchHandler(() => jsonResponse({ success: true, data: makeContract() }));
    renderPage();
    await flushEffects();
    const cb = screen.getByLabelText(/I accept this clause/) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);
    fireEvent.click(cb); // Toggle off — exercises the `next.delete` branch
    expect(cb.checked).toBe(false);
  });

  it('does nothing when handleSign called with empty name or sigData (guard branch)', async () => {
    setFetchHandler(() => jsonResponse({ success: true, data: makeContract() }));
    renderPage();
    await flushEffects();
    // The button is disabled in the DOM, but force-call by clicking directly
    // (we already cover the disabled-state in another test). Force the early
    // return by leaving name empty.
    const signBtn = screen.getByRole('button', { name: /Sign Contract/i }) as HTMLButtonElement;
    // jsdom click() bypasses the disabled attribute? It does NOT for buttons,
    // so removing the disabled attribute to exercise the early return branch:
    signBtn.removeAttribute('disabled');
    let postCalled = false;
    setFetchHandler((_url, init) => {
      if (init?.method === 'POST') postCalled = true;
      return jsonResponse({ success: true });
    });
    await act(async () => { fireEvent.click(signBtn); });
    expect(postCalled).toBe(false);
  });

  it('opens decline modal and submits decline with reason', async () => {
    let postBody: any = null;
    setFetchHandler((_url, init) => {
      if (init?.method === 'POST') {
        postBody = JSON.parse(init.body);
        return jsonResponse({ success: true });
      }
      return jsonResponse({ success: true, data: makeContract() });
    });
    renderPage();
    await flushEffects();

    fireEvent.click(screen.getByRole('button', { name: /^Decline$/i }));
    // Modal visible (heading h3 — disambiguates from the button label)
    expect(screen.getByRole('heading', { name: /^Decline Contract$/i })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Reason for declining/), {
      target: { value: 'Terms unacceptable' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Decline Contract$/i }));
    });
    await flushEffects();
    expect(postBody).toEqual({ action: 'decline', reason: 'Terms unacceptable' });
    expect(screen.getByText('You have declined this contract.')).toBeTruthy();
  });

  it('closes decline modal when Cancel is clicked', async () => {
    setFetchHandler(() => jsonResponse({ success: true, data: makeContract() }));
    renderPage();
    await flushEffects();
    fireEvent.click(screen.getByRole('button', { name: /^Decline$/i }));
    expect(screen.getByRole('heading', { name: /^Decline Contract$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(screen.queryByRole('heading', { name: /^Decline Contract$/i })).toBeNull();
  });

  it('exercises canvas drawing handlers (mouse + touch) without throwing', async () => {
    setFetchHandler(() => jsonResponse({ success: true, data: makeContract() }));
    const { container } = renderPage();
    await flushEffects();
    const canvas = container.querySelector('canvas')!;
    expect(canvas).toBeTruthy();
    // Mouse path: down -> move -> up
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 20 });
    fireEvent.mouseMove(canvas, { clientX: 30, clientY: 40 });
    fireEvent.mouseUp(canvas);
    // Move with no draw flag — exercises the early-return branch
    fireEvent.mouseMove(canvas, { clientX: 50, clientY: 60 });
    // Touch path
    fireEvent.touchStart(canvas, { touches: [{ clientX: 5, clientY: 5 }] });
    fireEvent.touchMove(canvas, { touches: [{ clientX: 15, clientY: 15 }] });
    fireEvent.touchEnd(canvas);
    // Mouse leave path
    fireEvent.mouseDown(canvas, { clientX: 1, clientY: 1 });
    fireEvent.mouseLeave(canvas);
  });

  it('clears the canvas and resets captured signature', async () => {
    setFetchHandler(() => jsonResponse({ success: true, data: makeContract() }));
    renderPage();
    await flushEffects();
    // Capture first
    fireEvent.click(screen.getByText('Use This Signature'));
    expect(screen.getByText('Signature captured')).toBeTruthy();
    // Then clear
    fireEvent.click(screen.getByText('Clear'));
    expect(screen.queryByText('Signature captured')).toBeNull();
  });

  it('renders without a logo, summary, or footer when those fields are null', async () => {
    const contract = makeContract({ logoUrl: null, summary: null, footerText: null });
    setFetchHandler(() => jsonResponse({ success: true, data: contract }));
    const { container } = renderPage();
    await flushEffects();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText('A summary of the agreement')).toBeNull();
    expect(screen.queryByText('Footer text here')).toBeNull();
  });

  it('renders with empty clauses and empty line items (boundary state)', async () => {
    const contract = makeContract({ clauses: [], lineItems: [], fees: [] });
    setFetchHandler(() => jsonResponse({ success: true, data: contract }));
    renderPage();
    await flushEffects();
    // Pricing section should NOT render
    expect(screen.queryByText('Pricing')).toBeNull();
  });

  it('uses default accent color when accentColor is empty string', async () => {
    const contract = makeContract({ accentColor: '' });
    setFetchHandler(() => jsonResponse({ success: true, data: contract }));
    const { container } = renderPage();
    await flushEffects();
    // The total cell uses the accent color inline-style
    const totalCell = container.querySelector('tfoot tr:last-child td:last-child') as HTMLElement | null;
    expect(totalCell?.style.color).toBeTruthy();
  });

  it('handles sign API failure gracefully (no banner flip)', async () => {
    setFetchHandler((_url, init) => {
      if (init?.method === 'POST') return jsonResponse({ success: false, message: 'Forbidden' });
      return jsonResponse({ success: true, data: makeContract() });
    });
    renderPage();
    await flushEffects();
    // Accept required clause + name + sig
    fireEvent.click(screen.getByLabelText(/I accept this clause/));
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: 'Jane Doe' } });
    fireEvent.click(screen.getByText('Use This Signature'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sign Contract/i }));
    });
    await flushEffects();
    // No signed banner
    expect(screen.queryByText('You have signed this contract.')).toBeNull();
  });

  it('handles decline API failure gracefully (modal stays open, no banner)', async () => {
    setFetchHandler((_url, init) => {
      if (init?.method === 'POST') return jsonResponse({ success: false });
      return jsonResponse({ success: true, data: makeContract() });
    });
    renderPage();
    await flushEffects();
    fireEvent.click(screen.getByRole('button', { name: /^Decline$/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Decline Contract$/i }));
    });
    await flushEffects();
    expect(screen.queryByText('You have declined this contract.')).toBeNull();
  });

  it('renders Sign Contract section only when canSign === true (no clauses path)', async () => {
    const contract = makeContract({ clauses: [] });
    setFetchHandler(() => jsonResponse({ success: true, data: contract }));
    renderPage();
    await flushEffects();
    // Signing UI still shows when no clauses (no required-clause gate to fail)
    expect(screen.getByRole('button', { name: /Sign Contract/i })).toBeTruthy();
  });

  it('handles signature save when canvas ref is present', async () => {
    setFetchHandler(() => jsonResponse({ success: true, data: makeContract() }));
    renderPage();
    await flushEffects();
    fireEvent.click(screen.getByText('Use This Signature'));
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalled();
  });
});
