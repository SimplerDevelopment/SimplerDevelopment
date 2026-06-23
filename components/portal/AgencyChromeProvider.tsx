'use client';

// Lightweight client-side context that fetches the active agency's chrome
// overrides (white-label flag + agency name/logo/color) and exposes them
// to the portal shell. Falls back to a benign default ("Simpler
// Development", default logo) when white-label is off or the request
// fails — so the existing portal continues to render exactly as before
// for non-agency users.
//
// We deliberately don't hard-block render on this fetch; the chrome
// shows the default brand for the first paint, then swaps once the
// payload arrives. White-labelled agencies on a custom domain will
// usually have a fast lookup (middleware sets `x-agency-client-id`,
// API hits the same DB connection pool).
//
// CSS custom property injection: when white-label is active and
// agencyPrimaryColor is set, we inject --agency-primary onto a wrapper
// div. The sidebar and other chrome pieces reference this via Tailwind's
// arbitrary-value syntax or inline style — no per-component edits needed.
// Falls back cleanly: the var is never set when white-label is off, so
// Tailwind's default bg-primary / text-primary-foreground apply as usual.

import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties } from 'react';

interface AgencyChrome {
  whiteLabelEnabled: boolean;
  agencyName: string | null;
  agencyLogoUrl: string | null;
  agencyPrimaryColor: string | null;
  /** Convenience: brand text to display ("Simpler Development" or override). */
  brandName: string;
  /** Convenience: logo to display (default `/iconLogo.png` or override). */
  brandLogoUrl: string;
}

const DEFAULT_BRAND_NAME = 'Simpler Development';
const DEFAULT_LOGO_URL = '/iconLogo.png';

const DEFAULT_VALUE: AgencyChrome = {
  whiteLabelEnabled: false,
  agencyName: null,
  agencyLogoUrl: null,
  agencyPrimaryColor: null,
  brandName: DEFAULT_BRAND_NAME,
  brandLogoUrl: DEFAULT_LOGO_URL,
};

const AgencyChromeContext = createContext<AgencyChrome>(DEFAULT_VALUE);

export function AgencyChromeProvider({ children }: { children: React.ReactNode }) {
  const [chrome, setChrome] = useState<AgencyChrome>(DEFAULT_VALUE);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/agency/chrome', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(res => {
        if (cancelled || !res?.success || !res.data) return;
        const d = res.data as Partial<AgencyChrome>;
        if (!d.whiteLabelEnabled) return;
        setChrome({
          whiteLabelEnabled: true,
          agencyName: d.agencyName ?? null,
          agencyLogoUrl: d.agencyLogoUrl ?? null,
          agencyPrimaryColor: d.agencyPrimaryColor ?? null,
          brandName: d.agencyName || DEFAULT_BRAND_NAME,
          brandLogoUrl: d.agencyLogoUrl || DEFAULT_LOGO_URL,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => chrome, [chrome]);

  // Inject --agency-primary as a CSS custom property onto the wrapper when
  // white-label is active and a color has been configured. Components
  // that want to honour the agency accent can reference this var via
  // `style={{ color: 'var(--agency-primary)' }}` or a Tailwind arbitrary
  // value. When the var is absent (default) those references are simply
  // undefined, so Tailwind's normal palette tokens take over.
  const wrapperStyle: CSSProperties = useMemo(() => {
    if (chrome.whiteLabelEnabled && chrome.agencyPrimaryColor) {
      return { '--agency-primary': chrome.agencyPrimaryColor } as CSSProperties;
    }
    return {};
  }, [chrome.whiteLabelEnabled, chrome.agencyPrimaryColor]);

  return (
    <AgencyChromeContext.Provider value={value}>
      <div style={wrapperStyle} className="contents">
        {children}
      </div>
    </AgencyChromeContext.Provider>
  );
}

export function useAgencyChrome(): AgencyChrome {
  return useContext(AgencyChromeContext);
}
