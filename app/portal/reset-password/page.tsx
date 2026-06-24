'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AuthShell,
  AuthField,
  authEyebrow,
  authHeading,
  authSubtext,
  authLabel,
  authInput,
  authPrimaryBtn,
} from '@/components/portal/AuthShell';

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
      <AuthShell panelSubtitle="Set a new password for your account.">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10">
          <span className="material-icons text-3xl text-destructive">link_off</span>
        </div>
        <h1 className={`${authHeading} mt-5`}>Invalid reset link.</h1>
        <p className={authSubtext}>
          This password reset link is invalid or has expired.
        </p>
        <a
          href="/portal/forgot-password"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <span className="material-icons text-sm">refresh</span>
          Request a new link
        </a>
      </AuthShell>
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
      <AuthShell panelSubtitle="Your account password has been updated.">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
          <span className="material-icons text-3xl text-emerald-500">check_circle</span>
        </div>
        <h1 className={`${authHeading} mt-5`}>Password reset.</h1>
        <p className={authSubtext}>
          Your password has been updated. You can now sign in with your new password.
        </p>
        <a
          href="/portal/login"
          className={`${authPrimaryBtn} mt-6`}
        >
          Sign in
          <span className="material-icons text-[19px] transition group-hover:translate-x-0.5">arrow_forward</span>
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell panelSubtitle="Set a new password — choose something strong and unique.">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
        <span className="material-icons text-3xl text-primary">lock_reset</span>
      </div>
      <div className={authEyebrow}>{'// Account recovery'}</div>
      <h1 className={authHeading}>Set a new password.</h1>
      <p className={authSubtext}>Enter your new password below. Must be at least 8 characters.</p>

      <div className="mt-7">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <span className="material-icons text-base">error_outline</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={authLabel}>New Password</label>
            <AuthField icon="lock">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                autoFocus
                className={authInput}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
                tabIndex={-1}
              >
                <span className="material-icons text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </AuthField>
          </div>
          <div>
            <label className={authLabel}>Confirm Password</label>
            <AuthField icon="lock_outline">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className={authInput}
                placeholder="Confirm your password"
              />
            </AuthField>
          </div>
          <button type="submit" disabled={loading} className={authPrimaryBtn}>
            {loading ? (
              <>
                <span className="material-icons animate-spin text-base">refresh</span>
                Resetting…
              </>
            ) : (
              <>
                Reset password
                <span className="material-icons text-[19px] transition group-hover:translate-x-0.5">lock_open</span>
              </>
            )}
          </button>
        </form>

        <a
          href="/portal/login"
          className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="material-icons text-sm">arrow_back</span>
          Back to sign in
        </a>
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <span className="material-icons animate-spin text-muted-foreground">refresh</span>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
