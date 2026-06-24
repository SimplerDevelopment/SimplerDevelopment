'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useAgencyChrome } from '@/components/portal/AgencyChromeProvider';
import { isGoogleAuthEnabled } from '@/lib/auth-providers';

const INPUT =
  'w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:outline-none focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10';
const LABEL =
  'block mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground';

interface Portal {
  clientId: number;
  company: string;
  subdomain: string | null;
}

function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return '/portal/dashboard';
  // Reject absolute URLs and protocol-relative URLs.
  if (raw.startsWith('//') || /^[a-z]+:/i.test(raw)) return '/portal/dashboard';
  if (!raw.startsWith('/')) return '/portal/dashboard';
  return raw;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));
  const verified = searchParams.get('verified') === '1';
  const { brandName } = useAgencyChrome();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Portal chooser state
  const [portals, setPortals] = useState<Portal[]>([]);
  const [choosingPortal, setChoosingPortal] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('Invalid email or password.');
    } else {
      // Check if the user's client has a subdomain portal
      try {
        const subRes = await fetch('/api/portal/my-subdomain');
        const subData = await subRes.json();

        if (subData.needsChoice && subData.portals?.length > 1) {
          // Multiple portals, no default — show chooser
          setPortals(subData.portals);
          setChoosingPortal(true);
          return;
        }

        // Only hop to the client's `*.simplerdevelopment.com` subdomain when we
        // are ALREADY on a simplerdevelopment.com host (prod/staging), where the
        // subdomain resolves and the session cookie is shared across subdomains.
        // From localhost the subdomain doesn't resolve; from a `*.vercel.app`
        // preview the hop would bounce the user OFF the preview to production and
        // the host-only preview cookie wouldn't follow. In both cases, stay put —
        // the just-issued session is scoped to the current host.
        const onSimplerDevHost = window.location.hostname.endsWith('.simplerdevelopment.com');
        if (onSimplerDevHost && subData.subdomain && window.location.hostname !== `${subData.subdomain}.simplerdevelopment.com`) {
          window.location.href = `https://${subData.subdomain}.simplerdevelopment.com${callbackUrl}`;
          return;
        }
      } catch {}
      window.location.href = callbackUrl;
    }
  }

  async function selectPortal(portal: Portal, setAsDefault: boolean) {
    setSettingDefault(true);
    try {
      if (setAsDefault) {
        await fetch('/api/portal/default-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: portal.clientId }),
        });
      }
      // Switch to the selected client
      await fetch('/api/portal/switch-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: portal.clientId }),
      });

      // Only hop to the subdomain when already on a simplerdevelopment.com host
      // (see handleSubmit) — never from localhost or a *.vercel.app preview.
      const onSimplerDevHost = window.location.hostname.endsWith('.simplerdevelopment.com');
      if (portal.subdomain && onSimplerDevHost) {
        // eslint-disable-next-line react-hooks/immutability -- pre-existing pattern, predates this change
        window.location.href = `https://${portal.subdomain}.simplerdevelopment.com${callbackUrl}`;
      } else {
        // eslint-disable-next-line react-hooks/immutability -- pre-existing pattern, predates this change
        window.location.href = callbackUrl;
      }
    } catch {
      setSettingDefault(false);
    }
  }

  if (choosingPortal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Client Portal</p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{brandName}</h1>
          </div>

          <div className="rounded-xl border border-border bg-card p-7 shadow-sm">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-foreground/5">
                <span className="material-icons text-2xl text-foreground">switch_account</span>
              </div>
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Choose your portal</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">You have access to multiple portals. Select one to continue.</p>
            </div>

            <div className="space-y-2">
              {portals.map((portal) => (
                <button
                  key={portal.clientId}
                  onClick={() => selectPortal(portal, true)}
                  disabled={settingDefault}
                  className="w-full flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <span className="text-sm font-bold text-foreground">
                      {(portal.company || 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{portal.company}</span>
                    {portal.subdomain && (
                      <span className="text-xs text-muted-foreground">{portal.subdomain}.simplerdevelopment.com</span>
                    )}
                  </div>
                  <span className="material-icons text-sm text-muted-foreground">arrow_forward</span>
                </button>
              ))}
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              This will be set as your default. You can change it in Settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Client Portal</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{brandName}</h1>
        </div>

        <div className="rounded-xl border border-border bg-card p-7 shadow-sm">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Sign in to your portal</h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">Enter your credentials to continue.</p>

          {/* Email-verified success banner */}
          {verified && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-600 dark:text-emerald-400">
              <span className="material-icons text-base">check_circle</span>
              Email verified — sign in to continue.
            </div>
          )}

          {/* Google OAuth — only shown when the provider is configured */}
          {isGoogleAuthEnabled && (
            <>
              <button
                type="button"
                onClick={() => signIn('google', { callbackUrl })}
                className="mb-4 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
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
                  autoComplete="current-password"
                  className={`${INPUT} pr-10`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
                  tabIndex={-1}
                >
                  <span className="material-icons text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-foreground text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="material-icons animate-spin text-base">refresh</span>
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-5 flex flex-col items-center gap-2">
            <a href="/portal/forgot-password" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Forgot your password?
            </a>
            <a href="/portal/signup" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              New here?{' '}
              <span className="font-medium text-foreground">Create an account</span>
            </a>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Need access?{' '}
          <a href="/contact" className="text-foreground transition-colors hover:underline">
            Contact us
          </a>
        </p>
      </div>
    </div>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
