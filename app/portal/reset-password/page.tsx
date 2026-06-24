'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAgencyChrome } from '@/components/portal/AgencyChromeProvider';

const INPUT =
  'w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:outline-none focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10';
const LABEL =
  'block mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <span className="material-icons text-2xl">link_off</span>
        </div>
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Invalid reset link</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This password reset link is invalid or has expired.
        </p>
        <a
          href="/portal/forgot-password"
          className="mt-5 inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <span className="material-icons text-base">refresh</span>
          Request a new link
        </a>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/portal/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'Something went wrong.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <span className="material-icons text-2xl">check_circle</span>
        </div>
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Password reset</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your password has been updated. You can now sign in with your new password.
        </p>
        <a
          href="/portal/login"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          Sign in
        </a>
      </div>
    );
  }

  // Live, low-key confirmation hint — warm, friendly feedback without nagging.
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <>
      <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Set a new password</h2>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Enter your new password below.</p>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <span className="material-icons text-base">error_outline</span>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={LABEL}>New password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
              className={`${INPUT} pr-10`}
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <span className="material-icons text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
        </div>
        <div>
          <label className={LABEL}>Confirm password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className={`${INPUT} ${mismatch ? 'border-destructive/40 focus:border-destructive/40 focus:ring-destructive/10' : ''}`}
            placeholder="Re-enter your password"
          />
          {mismatch && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
              <span className="material-icons text-sm">close</span>
              Passwords don&apos;t match yet
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-foreground text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="material-icons animate-spin text-base">refresh</span>
              Resetting…
            </>
          ) : (
            'Reset password'
          )}
        </button>
      </form>

      <div className="mt-5 text-center">
        <a href="/portal/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          Back to sign in
        </a>
      </div>
    </>
  );
}

function ResetPasswordChrome() {
  const { brandName } = useAgencyChrome();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Client Portal</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{brandName}</h1>
        </div>

        <div className="rounded-xl border border-border bg-card p-7 shadow-sm">
          <Suspense
            fallback={
              <div className="space-y-4" aria-hidden>
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-10 animate-pulse rounded-md bg-muted" />
                <div className="h-10 animate-pulse rounded-md bg-muted" />
                <div className="h-10 animate-pulse rounded-md bg-muted" />
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <ResetPasswordChrome />;
}
