'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { isGoogleAuthEnabled } from '@/lib/auth-providers';
import {
  AuthShell,
  AuthField,
  AuthDivider,
  authEyebrow,
  authHeading,
  authSubtext,
  authLabel,
  authInput,
  authPrimaryBtn,
  authGhostBtn,
} from '@/components/portal/AuthShell';

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

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));
  const verified = searchParams.get('verified') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
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
      totpCode,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      // We can't tell password-vs-2FA apart (NextAuth hides the reason), so guide
      // the user to the code if they have 2FA on.
      setError('Invalid email or password — if you have two-factor enabled, include your authenticator code.');
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
      <AuthShell panelSubtitle="Pick up right where you left off.">
        <div className={authEyebrow}>{'// Choose portal'}</div>
        <h1 className={authHeading}>Choose your portal.</h1>
        <p className={authSubtext}>You have access to multiple portals. Select one to continue.</p>

        <div className="mt-7 space-y-2.5">
          {portals.map((portal) => (
            <button
              key={portal.clientId}
              onClick={() => selectPortal(portal, true)}
              disabled={settingDefault}
              className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition hover:border-primary/50 hover:shadow-md disabled:opacity-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                {(portal.company || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{portal.company}</span>
                {portal.subdomain && (
                  <span className="text-xs text-muted-foreground">{portal.subdomain}.simplerdevelopment.com</span>
                )}
              </div>
              <span className="material-icons text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary">arrow_forward</span>
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          This will be set as your default. You can change it in Settings.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell panelSubtitle="Welcome back — sign in to your command center.">
      <div className={authEyebrow}>{'// Welcome back'}</div>
      <h1 className={authHeading}>Sign in to your portal.</h1>
      <p className={authSubtext}>One login for your sites, CRM, content, and everything in between.</p>

      <div className="mt-7">
        {/* Email-verified success banner */}
        {verified && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
            <span className="material-icons text-base">check_circle</span>
            Email verified — sign in to continue.
          </div>
        )}

        {/* Google OAuth — only shown when the provider is configured */}
        {isGoogleAuthEnabled && (
          <>
            <button type="button" onClick={() => signIn('google', { callbackUrl })} className={authGhostBtn}>
              <GoogleMark />
              Continue with Google
            </button>
            <AuthDivider />
          </>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <span className="material-icons text-base">error_outline</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={authLabel}>Email</label>
            <AuthField icon="mail_outline">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={authInput}
                placeholder="you@company.com"
              />
            </AuthField>
          </div>
          <div>
            <label className={authLabel}>Password</label>
            <AuthField icon="lock_outline">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={`${authInput} pr-11`}
                placeholder="••••••••"
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
            <div className="mt-2 flex justify-end">
              <a href="/portal/forgot-password" className="text-[13.5px] font-semibold text-primary hover:underline">
                Forgot your password?
              </a>
            </div>
          </div>
          <div>
            <label className={authLabel}>Two-factor code <span className="font-normal text-muted-foreground">(only if enabled)</span></label>
            <AuthField icon="pin">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={authInput}
                placeholder="123456"
              />
            </AuthField>
          </div>
          <button type="submit" disabled={loading} className={authPrimaryBtn}>
            {loading ? (
              <>
                <span className="material-icons animate-spin text-base">refresh</span>
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <span className="material-icons text-[19px] transition group-hover:translate-x-0.5">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          New here?{' '}
          <a href="/portal/signup" className="font-bold text-foreground hover:text-primary">
            Create an account
          </a>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Need access?{' '}
          <a href="/contact" className="text-primary hover:underline">
            Contact us
          </a>
        </p>
      </div>
    </AuthShell>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
