'use client';

// Sticky banner that renders at the top of every /portal page whenever a
// staff user is impersonating a client. Client-side fetch via
// /api/portal/impersonate/status mirrors the AgencyChromeProvider pattern.
//
// Hidden by default (zero impact on the normal client flow). Only renders
// when the API confirms an active impersonation session for the current
// staff user.

import { useEffect, useState } from 'react';

interface Status {
  active: boolean;
  clientId?: number;
  clientCompany?: string;
}

export default function ImpersonationBanner() {
  const [status, setStatus] = useState<Status>({ active: false });
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/impersonate/status', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(res => {
        if (cancelled || !res?.success || !res.data?.active) return;
        setStatus({
          active: true,
          clientId: res.data.clientId,
          clientCompany: res.data.clientCompany,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function stop() {
    setStopping(true);
    // Use a form-style POST so the server can issue a 303 to the admin page.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/portal/impersonate/stop?redirect=1';
    document.body.appendChild(form);
    form.submit();
  }

  if (!status.active) return null;

  return (
    <div
      role="status"
      aria-label="Impersonation active"
      className="sticky top-0 z-50 w-full bg-amber-500 text-amber-950 border-b border-amber-700 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-icons text-base">visibility</span>
          <span className="truncate">
            You are impersonating <strong>{status.clientCompany}</strong>
          </span>
        </div>
        <button
          type="button"
          onClick={stop}
          disabled={stopping}
          className="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-md bg-amber-900 text-amber-50 hover:bg-amber-950 disabled:opacity-50"
        >
          <span className="material-icons text-base">logout</span>
          {stopping ? 'Stopping…' : 'Stop impersonating'}
        </button>
      </div>
    </div>
  );
}
