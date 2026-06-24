'use client';

import { useState } from 'react';
import { useAgencyChrome } from '@/components/portal/AgencyChromeProvider';

const INPUT =
  'w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:outline-none focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10';
const LABEL =
  'block mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground';

export default function ForgotPasswordPage() {
  const { brandName } = useAgencyChrome();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/portal/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
      } else {
        setError(data.error || 'Something went wrong.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Client Portal</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{brandName}</h1>
        </div>

        <div className="rounded-xl border border-border bg-card p-7 shadow-sm">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <span className="material-icons text-2xl">mark_email_read</span>
              </div>
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Check your email</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                If an account with <strong>{email}</strong> exists, we&apos;ve sent a password reset link. It expires in 1 hour.
              </p>
              <a
                href="/portal/login"
                className="mt-5 inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <span className="material-icons text-base">arrow_back</span>
                Back to sign in
              </a>
            </div>
          ) : (
            <>
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Forgot your password?</h2>
              <p className="mt-1 mb-6 text-sm text-muted-foreground">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <span className="material-icons text-base">error_outline</span>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className={LABEL}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    className={INPUT}
                    placeholder="you@company.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-foreground text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <span className="material-icons animate-spin text-base">refresh</span>
                      Sending…
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>

              <div className="mt-5 text-center">
                <a href="/portal/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  Back to sign in
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
