// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/portal/ai-content',
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : ''}>{children}</a>
  ),
}));

import AiContentStudio from '@/components/portal/AiContentStudio';

const SITES = [{ id: 3, name: 'Acme', domain: 'acme.test' }];

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('AiContentStudio click paths', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears a pack-tab error when switching tabs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('boom');
    }));
    render(<AiContentStudio sites={SITES} />);
    fireEvent.change(screen.getByPlaceholderText(/how to choose/i), { target: { value: 'CRM tips' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate pack/i }));
    });
    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /video plan/i }));
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('ignores a second Build-plan click in the same tick (no double submit)', async () => {
    const gate = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const fetchMock = vi.fn(() => gate.promise);
    vi.stubGlobal('fetch', fetchMock);
    render(<AiContentStudio sites={SITES} />);
    fireEvent.click(screen.getByRole('button', { name: /video plan/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), { target: { value: 'Selling more' } });
    const md = screen.getByPlaceholderText(/point one/i);
    fireEvent.change(md, { target: { value: '## Uno\nTexto suficiente para pasar.' } });
    const btn = screen.getByRole('button', { name: /build plan/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      gate.resolve({ ok: true, json: async () => ({ success: true, data: null }) });
    });
  });

  it('clears a stale render job only after a fresh plan succeeds', async () => {
    const plan = {
      title: 'T', scenes: [], totalDurationSec: 10, linkedinCaption: 'c',
      videoBlock: { type: 'video', url: '', caption: 'T', autoplay: false, controls: true },
    };
    const job = { jobId: 'abc123', driver: 'local-script', available: true, steps: ['s1'], notes: [] };
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls += 1;
      if (String(url).includes('/video/render')) {
        return { ok: true, json: async () => ({ success: true, data: job }) };
      }
      return { ok: true, json: async () => ({ success: true, data: plan }) };
    }));
    render(<AiContentStudio sites={SITES} />);
    fireEvent.click(screen.getByRole('button', { name: /video plan/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), { target: { value: 'Selling more' } });
    fireEvent.change(screen.getByPlaceholderText(/point one/i), { target: { value: '## Uno\nTexto suficiente para pasar.' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /build plan/i }));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /create render job/i })).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create render job/i }));
    });
    await waitFor(() => expect(screen.getByText(/abc123/)).toBeTruthy());
    expect(calls).toBe(2);
  });
});
