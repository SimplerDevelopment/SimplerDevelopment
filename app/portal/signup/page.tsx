'use client';

import { Suspense, useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useAgencyChrome } from '@/components/portal/AgencyChromeProvider';

function SignupForm() {
  const searchParams = useSearchParams();
  const { brandName } = useAgencyChrome();

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-4">
        {/* Logo / header */}
        <div className="text-center mb-8">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Client Portal</p>
          <h1 className="text-2xl font-bold text-foreground">{brandName}</h1>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          {submitted ? (
            /* ── Success state ── */
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <span className="material-icons text-2xl text-primary">mark_email_read</span>
              </div>
              <h2 className="text-xl font-semibold text-foreground">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a verification link to{' '}
                <strong className="text-foreground">{submittedEmail}</strong>.
                The link expires in 24&nbsp;hours.
              </p>
              <p className="text-xs text-muted-foreground">
                Can&apos;t find it? Check your spam folder.
              </p>
              <a
                href="/portal/login"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-2"
              >
                <span className="material-icons text-sm">arrow_back</span>
                Back to sign in
              </a>
            </div>
          ) : (
            /* ── Signup form ── */
            <>
              <h2 className="text-xl font-semibold text-foreground mb-1">Create your account</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Get started — it only takes a minute.
              </p>

              {/* Verification-expired banner */}
              {verificationExpired && (
                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <span className="material-icons text-base">warning_amber</span>
                  That verification link expired — sign up again to get a new one.
                </div>
              )}

              {/* API error */}
              {error && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-sm text-destructive">
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
              )}

              {/* Google OAuth */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-border bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors mb-4"
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
              <div className="relative flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Credentials form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Full name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    autoFocus
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Jane Smith"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Company{' '}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    autoComplete="organization"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Acme Corp"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="you@company.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      <span className="material-icons text-lg">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Minimum 8 characters</p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="material-icons text-base animate-spin">refresh</span>
                      Creating account...
                    </>
                  ) : (
                    'Create account'
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer link */}
        {!submitted && (
          <p className="text-center text-xs text-muted-foreground mt-6">
            Already have an account?{' '}
            <a href="/portal/login" className="text-primary hover:underline">
              Sign in
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
