'use client';

import { useEffect, useState } from 'react';

interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export default function GscPropertyPicker({
  siteId,
  currentSiteUrl,
  websiteDomain,
  onConnected,
}: {
  siteId: number;
  currentSiteUrl: string | null;
  websiteDomain: string | null;
  onConnected: () => void;
}) {
  const [sites, setSites] = useState<GscSite[]>([]);
  const [loading, setLoading] = useState(!currentSiteUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentSiteUrl) {
      return;
    }
    fetch(`/api/portal/websites/${siteId}/google/search-console`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setSites(json.data);
        else setError(json.message);
      })
      .catch(() => setError('Failed to load Search Console sites'))
      .finally(() => setLoading(false));
  }, [siteId, currentSiteUrl]);

  const handleSelect = async (siteUrl: string) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/websites/${siteId}/google/search-console`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl }),
      });
      const json = await res.json();
      if (json.success) {
        onConnected();
      } else {
        setError(json.message);
      }
    } catch {
      setError('Failed to connect Search Console');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      await fetch(`/api/portal/websites/${siteId}/google/search-console`, { method: 'DELETE' });
      onConnected();
    } finally {
      setSaving(false);
    }
  };

  if (currentSiteUrl) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-icons text-green-600 text-base">check_circle</span>
          <span className="text-sm text-foreground">{currentSiteUrl}</span>
        </div>
        <button
          onClick={handleDisconnect}
          disabled={saving}
          className="text-xs text-muted-foreground hover:text-red-600 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="material-icons text-base animate-spin">refresh</span>
        Loading Search Console sites...
      </div>
    );
  }

  const suggestedUrl = websiteDomain ? `https://${websiteDomain}/` : null;
  const matchingSite = sites.find((s) => suggestedUrl && s.siteUrl.includes(websiteDomain!));

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {matchingSite ? (
        <button
          onClick={() => handleSelect(matchingSite.siteUrl)}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <span className="material-icons text-base">link</span>
          Connect {matchingSite.siteUrl}
        </button>
      ) : suggestedUrl ? (
        <button
          onClick={() => handleSelect(suggestedUrl)}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <span className="material-icons text-base">add</span>
          Add {suggestedUrl} to Search Console
        </button>
      ) : null}

      {sites.length > 0 && !matchingSite && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Or select an existing site:</p>
          {sites.slice(0, 10).map((s) => (
            <button
              key={s.siteUrl}
              onClick={() => handleSelect(s.siteUrl)}
              disabled={saving}
              className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted transition-colors disabled:opacity-50"
            >
              {s.siteUrl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
