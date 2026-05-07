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

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

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

  return <AgencyChromeContext.Provider value={value}>{children}</AgencyChromeContext.Provider>;
}

export function useAgencyChrome(): AgencyChrome {
  return useContext(AgencyChromeContext);
}
