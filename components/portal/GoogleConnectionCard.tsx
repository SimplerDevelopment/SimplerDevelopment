'use client';

import { useCallback, useEffect, useState } from 'react';
import GscPropertyPicker from './GscPropertyPicker';
import GaPropertyPicker from './GaPropertyPicker';

interface GoogleStatus {
  connected: boolean;
  gscSiteUrl: string | null;
  gaPropertyId: string | null;
  gaMeasurementId: string | null;
}

export default function GoogleConnectionCard({
  siteId,
  websiteDomain,
  websiteName,
}: {
  siteId: number;
  websiteDomain: string | null;
  websiteName: string;
}) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'connected') return 'Google account connected successfully.';
    if (params.get('google') === 'error') return 'Failed to connect Google account.';
    return '';
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/websites/${siteId}/google/status`);
      const json = await res.json();
      if (json.success) setStatus(json.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/portal/websites/${siteId}/google/status`);
        const json = await res.json();
        if (json.success) setStatus(json.data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [siteId]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/portal/websites/${siteId}/google/disconnect`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setStatus({ connected: false, gscSiteUrl: null, gaPropertyId: null, gaMeasurementId: null });
        setMessage('Google account disconnected.');
      }
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-icons text-muted-foreground text-lg">monitoring</span>
          <h3 className="font-semibold text-sm text-foreground">Google Integrations</h3>
        </div>
        {status?.connected && (
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-xs text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
          >
            Disconnect Google
          </button>
        )}
      </div>

      {message && (
        <p className={`text-sm ${message.includes('success') || message.includes('connected') ? 'text-green-600' : 'text-red-600'}`}>
          {message}
        </p>
      )}

      {!status?.connected ? (
        <>
          <p className="text-sm text-muted-foreground">
            Connect your Google account to set up Search Console and Analytics for this website.
          </p>
          <a
            href={`/api/portal/websites/${siteId}/google/auth`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <span className="material-icons text-base">login</span>
            Connect Google Account
          </a>
        </>
      ) : (
        <div className="space-y-4">
          {/* Search Console */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-icons text-muted-foreground text-base">search</span>
              <h4 className="text-sm font-medium text-foreground">Search Console</h4>
            </div>
            <GscPropertyPicker
              siteId={siteId}
              currentSiteUrl={status.gscSiteUrl}
              websiteDomain={websiteDomain}
              onConnected={fetchStatus}
            />
          </div>

          <div className="border-t border-border" />

          {/* Analytics */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-icons text-muted-foreground text-base">bar_chart</span>
              <h4 className="text-sm font-medium text-foreground">Google Analytics</h4>
            </div>
            <GaPropertyPicker
              siteId={siteId}
              currentPropertyId={status.gaPropertyId}
              currentMeasurementId={status.gaMeasurementId}
              websiteName={websiteName}
              onConnected={fetchStatus}
            />
          </div>
        </div>
      )}
    </div>
  );
}
