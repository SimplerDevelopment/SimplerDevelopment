'use client';

import { Suspense, useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useAgencyChrome } from '@/components/portal/AgencyChromeProvider';
import { ResendVerificationButton } from '@/components/portal/ResendVerificationButton';
import { isGoogleAuthEnabled } from '@/lib/auth-providers';

const INPUT =
  'w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:outline-none focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10';
const LABEL =
  'block mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground';

function SignupForm() {
  const searchParams = useSearchParams();

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [verificationSent, setVerificationSent] = useState(true);

  const verificationExpired = searchParams.get('error') === 'verification-expired';

  // Deep-link cart: persist ?modules= to localStorage so the onboarding wizard
  // can pick it up after the user signs in.
  useEffect(() => {
    const modules = searchParams.get('modules');
    if (modules) {
      try {
        localStorage.setItem('sd-signup-cart', modules);
      } catch {
        // localStorage unavailable (SSR, privacy mode) — silently ignore
      }
    }
  }, [searchParams]);

  async function handleGoogleSignIn() {
    await signIn('google', { callbackUrl: '/portal/onboarding' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          ...(company ? { company } : {}),
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSubmittedEmail(email);
        // The route reports whether the verification email actually went out.
        // When delivery failed (e.g. provider misconfigured), don't claim we
        // sent it — show the resend path instead.
        setVerificationSent(data.data?.verificationSent !== false);
        setSubmitted(true);
      } else {
        setError(data.message || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    if (verificationSent) {
      return (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <span className="material-icons text-2xl">mark_email_read</span>
          </div>
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Check your email</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We sent a verification link to{' '}
            <strong className="text-foreground">{submittedEmail}</strong>.
            The link expires in 24&nbsp;hours.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Can&apos;t find it? Check your spam folder.
          </p>
          <a
            href="/portal/login"
            className="mt-5 inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <span className="material-icons text-base">arrow_back</span>
            Back to sign in
          </a>
        </div>
      );
    }

    /* Account created, but the verification email could not be sent
       (e.g. provider misconfigured). Be honest and offer a resend. */
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <span className="material-icons text-2xl">mark_email_unread</span>
        </div>
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Account created</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We couldn&apos;t send the verification email to{' '}
          <strong className="text-foreground">{submittedEmail}</strong> just now.
          Resend it below to finish activating your account.
        </p>
        <div className="mt-4 flex justify-center">
          <ResendVerificationButton prefillEmail={submittedEmail} />
        </div>
        <a
          href="/portal/login"
          className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="material-icons text-sm">arrow_back</span>
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Create your account</h2>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Websites, CRM, and AI in one place — free to start, no card required.
      </p>

      {/* Verification-expired banner */}
      {verificationExpired && (
        <div className="mb-4 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <div className="mb-2 flex items-center gap-2">
            <span className="material-icons text-base">warning_amber</span>
            That verification link expired.
          </div>
          <ResendVerificationButton prefillEmail={email} />
        </div>
      )}

      {/* API error */}
      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <span className="material-icons text-base">error_outline</span>
            <span>
              {error.toLowerCase().includes('already') ||
              error.toLowerCase().includes('exists') ||
              error.toLowerCase().includes('email in use') ? (
                <>
                  {error}{' '}
                  <a href="/portal/login" className="underline font-medium">
                    Sign in instead.
                  </a>
                </>
              ) : (
                error
              )}
            </span>
          </div>
          {(error.toLowerCase().includes('already') ||
            error.toLowerCase().includes('exists') ||
            error.toLowerCase().includes('email in use')) && (
            <div className="mt-2">
              <ResendVerificationButton prefillEmail={email} />
            </div>
          )}
        </div>
      )}

      {/* Google OAuth — only shown when the provider is configured */}
      {isGoogleAuthEnabled && (
        <>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-accent mb-4"
          >
            {/* Google "G" SVG mark */}
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                fill="#34A853"
              />
              <path
                d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="relative mb-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        </>
      )}

      {/* Credentials form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={LABEL}>Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            autoFocus
            className={INPUT}
            placeholder="Jane Smith"
          />
        </div>

        <div>
          <label className={LABEL}>
            Company{' '}
            <span className="text-muted-foreground font-normal normal-case">(optional)</span>
          </label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            autoComplete="organization"
            className={INPUT}
            placeholder="Acme Corp"
          />
        </div>

        <div>
          <label className={LABEL}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={INPUT}
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label className={LABEL}>Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
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
              <span className="material-icons text-lg">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
          {password.length > 0 && password.length < 8 ? (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
              <span className="material-icons text-sm">error_outline</span>
              Password must be at least 8 characters ({password.length}/8).
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">Minimum 8 characters</p>
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
              Creating account...
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>
    </>
  );
}

function SignupChrome() {
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
                <div className="h-10 animate-pulse rounded-md bg-muted" />
              </div>
            }
          >
            <SignupForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <a href="/portal/login" className="text-primary hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return <SignupChrome />;
}
