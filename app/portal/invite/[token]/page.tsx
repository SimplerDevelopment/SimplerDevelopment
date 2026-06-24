'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
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

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/portal/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      // Auto-login after setting password
      const loginResult = await signIn('credentials', {
        email: data.email,
        password,
        redirect: false,
      });

      if (loginResult?.ok) {
        setDone(true);
        router.push('/portal/dashboard');
      } else {
        // Password was set but login failed — send them to login page
        setDone(true);
        setTimeout(() => router.push('/portal/login'), 2000);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell panelSubtitle="Welcome to your team's portal.">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-green-500/20 bg-green-500/10">
          <span className="material-icons text-3xl text-green-600 dark:text-green-400">check_circle</span>
        </div>
        <h1 className={`${authHeading} mt-5`}>You&apos;re all set!</h1>
        <p className={authSubtext}>Redirecting to your portal…</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell panelSubtitle="You've been invited to join a team portal — set your password to get started.">
      <div className={authEyebrow}>{"// You're invited"}</div>
      <h1 className={authHeading}>Set your password.</h1>
      <p className={authSubtext}>Create a password to access your team&apos;s portal.</p>

      <div className="mt-7">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <span className="material-icons text-base">error_outline</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={authLabel}>Password</label>
            <AuthField icon="lock_outline">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className={`${authInput} pr-11`}
                required
                minLength={8}
                autoFocus
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <span className="material-icons text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </AuthField>
          </div>

          <div>
            <label className={authLabel}>Confirm password</label>
            <AuthField icon="lock">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Type your password again"
                className={`${authInput} pr-11`}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                <span className="material-icons text-lg">{showConfirmPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </AuthField>
          </div>

          <button type="submit" disabled={loading} className={authPrimaryBtn}>
            {loading ? (
              <>
                <span className="material-icons animate-spin text-base">refresh</span>
                Setting up…
              </>
            ) : (
              <>
                Set Password &amp; Sign In
                <span className="material-icons text-[19px] transition group-hover:translate-x-0.5">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          Already have an account?{' '}
          <a href="/portal/login" className="font-bold text-foreground hover:text-primary">
            Sign in
          </a>
        </p>
      </div>
    </AuthShell>
  );
}
