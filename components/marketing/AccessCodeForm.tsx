'use client';

import { useState } from 'react';

type Variant = 'inline' | 'hero' | 'gate';

export function AccessCodeForm({ variant = 'inline' }: { variant?: Variant }) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleChange = (val: string) => {
    setCode(val);
    if (status === 'error') {
      setStatus('idle');
      setMessage('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/preview-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const json = await res.json();
      if (json.success && json.data?.url) {
        window.location.href = json.data.url;
        return;
      }
      setStatus('error');
      setMessage(json.message || 'That access code is not valid.');
    } catch {
      setStatus('error');
      setMessage('Could not reach the server. Please try again.');
    }
  };

  if (variant === 'hero') {
    return (
      <div className="light-loop w-full max-w-md bg-background/70 backdrop-blur-xl border border-border/60 rounded-2xl p-8 shadow-2xl shadow-primary/10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <span className="material-icons text-primary text-3xl">vpn_key</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground mb-2">Have an access code?</h2>
          <p className="text-sm text-muted-foreground">
            Enter the code your team shared to preview a private site.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            id="access-code"
            type="text"
            value={code}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="ACME-2026"
            autoComplete="off"
            disabled={status === 'loading'}
            aria-invalid={status === 'error'}
            className="w-full px-4 py-3.5 bg-background border border-border rounded-lg text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-lg font-mono text-center tracking-widest uppercase placeholder:text-muted-foreground/40 placeholder:tracking-normal placeholder:font-sans placeholder:text-base disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={status === 'loading' || !code.trim()}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? 'Checking…' : 'View Preview'}
            {status !== 'loading' && <span className="material-icons text-lg">arrow_forward</span>}
          </button>
          {message && (
            <p className="text-sm text-red-500 flex items-center gap-1.5 pt-1" role="alert">
              <span className="material-icons text-base">error_outline</span>
              {message}
            </p>
          )}
        </form>
      </div>
    );
  }

  // Standalone, theme-independent gate card. Uses explicit colors (not the
  // app's semantic CSS tokens) so it stays readable inside any client-site
  // context, whose --background/--foreground vars differ from the app shell.
  if (variant === 'gate') {
    return (
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 bg-gray-100">
          <span className="material-icons text-3xl text-gray-700">lock</span>
        </div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">Have an access code?</h2>
        <p className="mb-6 text-sm text-gray-500">Enter the code you were given to view this site.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            id="access-code"
            type="text"
            value={code}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="ENTER CODE"
            autoComplete="off"
            disabled={status === 'loading'}
            aria-invalid={status === 'error'}
            style={{ backgroundColor: '#ffffff', color: '#111827' }}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3.5 text-center font-mono text-lg uppercase tracking-widest text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={status === 'loading' || !code.trim()}
            style={{ backgroundColor: '#111827', color: '#ffffff' }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3.5 text-base font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'loading' ? 'Checking…' : 'View site'}
            {status !== 'loading' && <span className="material-icons text-lg">arrow_forward</span>}
          </button>
          {message && (
            <p className="flex items-center justify-center gap-1.5 pt-1 text-sm text-red-600" role="alert">
              <span className="material-icons text-base">error_outline</span>
              {message}
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="mt-6 pt-6 border-t border-border/50 max-w-xl">
      <label htmlFor="access-code" className="flex items-center gap-2 text-sm font-semibold text-foreground/80 mb-3">
        <span className="material-icons text-base text-primary">vpn_key</span>
        Have an access code?
      </label>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <input
          id="access-code"
          type="text"
          value={code}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Enter your code"
          autoComplete="off"
          disabled={status === 'loading'}
          aria-invalid={status === 'error'}
          className="flex-1 px-4 py-3 bg-background/90 border border-border rounded-lg text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm placeholder:text-muted-foreground/60 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === 'loading' || !code.trim()}
          className="inline-flex items-center justify-center gap-1 px-5 py-3 rounded-lg bg-foreground text-background font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'loading' ? 'Checking…' : 'View Preview'}
          {status !== 'loading' && <span className="material-icons text-base">arrow_forward</span>}
        </button>
      </form>
      {message && (
        <p className="mt-2 text-sm text-red-600 flex items-center gap-1.5" role="alert">
          <span className="material-icons text-base">error_outline</span>
          {message}
        </p>
      )}
    </div>
  );
}
