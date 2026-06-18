'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useAgencyChrome } from '@/components/portal/AgencyChromeProvider';
import { isGoogleAuthEnabled } from '@/lib/auth-providers';

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
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Client Portal</p>
          <h1 className="text-2xl font-bold text-foreground">{brandName}</h1>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <span className="material-icons text-2xl text-primary">switch_account</span>
            </div>
            <h2 className="text-xl font-semibold text-foreground">Choose your portal</h2>
            <p className="text-sm text-muted-foreground mt-1">You have access to multiple portals. Select one to continue.</p>
          </div>

          <div className="space-y-2">
            {portals.map((portal) => (
              <button
                key={portal.clientId}
                onClick={() => selectPortal(portal, true)}
                disabled={settingDefault}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-colors text-left disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {(portal.company || 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground block truncate">{portal.company}</span>
                  {portal.subdomain && (
                    <span className="text-xs text-muted-foreground">{portal.subdomain}.simplerdevelopment.com</span>
                  )}
                </div>
                <span className="material-icons text-sm text-muted-foreground">arrow_forward</span>
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground text-center mt-4">
            This will be set as your default. You can change it in Settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Client Portal</p>
          <h1 className="text-2xl font-bold text-foreground">{brandName}</h1>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-foreground mb-6">Sign in to your portal</h2>

          {/* Email-verified success banner */}
          {verified && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
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
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-border bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors mb-4"
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
              <div className="relative flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-sm text-destructive">
              <span className="material-icons text-base">error_outline</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
                  autoComplete="current-password"
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  <span className="material-icons text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-icons text-base animate-spin">refresh</span>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-4 flex flex-col items-center gap-2">
            <a href="/portal/forgot-password" className="text-sm text-primary hover:underline">
              Forgot your password?
            </a>
            <a href="/portal/signup" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              New here?{' '}
              <span className="text-primary hover:underline">Create an account</span>
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Need access?{' '}
          <a href="/contact" className="text-primary hover:underline">
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
