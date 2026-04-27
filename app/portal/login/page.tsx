'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

interface Portal {
  clientId: number;
  company: string;
  subdomain: string | null;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/portal/dashboard';
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

        // Skip the subdomain hop in local dev — `*.simplerdevelopment.com` doesn't
        // resolve from localhost, so the redirect would dead-end on chrome-error.
        // Auth cookies are scoped to the current host (localhost), so staying put
        // keeps the just-issued session usable.
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (!isLocal && subData.subdomain && window.location.hostname !== `${subData.subdomain}.simplerdevelopment.com`) {
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

      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (portal.subdomain && !isLocal) {
        window.location.href = `https://${portal.subdomain}.simplerdevelopment.com${callbackUrl}`;
      } else {
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
          <h1 className="text-2xl font-bold text-foreground">Simpler Development</h1>
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
          <h1 className="text-2xl font-bold text-foreground">Simpler Development</h1>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-foreground mb-6">Sign in to your portal</h2>

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

          <div className="mt-4 text-center">
            <a href="/portal/forgot-password" className="text-sm text-primary hover:underline">
              Forgot your password?
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
