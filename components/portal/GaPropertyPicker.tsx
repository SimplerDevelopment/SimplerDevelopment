'use client';

import { useEffect, useState } from 'react';

interface GaProperty {
  name: string;
  displayName: string;
  account: string;
}

interface GaAccount {
  name: string;
  displayName: string;
}

export default function GaPropertyPicker({
  siteId,
  currentPropertyId,
  currentMeasurementId,
  websiteName,
  onConnected,
}: {
  siteId: number;
  currentPropertyId: string | null;
  currentMeasurementId: string | null;
  websiteName: string;
  onConnected: () => void;
}) {
  const [properties, setProperties] = useState<GaProperty[]>([]);
  const [accounts, setAccounts] = useState<GaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentPropertyId) {
      setLoading(false);
      return;
    }
    fetch(`/api/portal/websites/${siteId}/google/analytics`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setProperties(json.data.properties);
          setAccounts(json.data.accounts);
        } else {
          setError(json.message);
        }
      })
      .catch(() => setError('Failed to load Analytics properties'))
      .finally(() => setLoading(false));
  }, [siteId, currentPropertyId]);

  const handleSelectExisting = async (propertyId: string) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/websites/${siteId}/google/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId }),
      });
      const json = await res.json();
      if (json.success) onConnected();
      else setError(json.message);
    } catch {
      setError('Failed to connect Analytics');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (accountId: string) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/websites/${siteId}/google/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ create: true, accountId, displayName: websiteName }),
      });
      const json = await res.json();
      if (json.success) onConnected();
      else setError(json.message);
    } catch {
      setError('Failed to create Analytics property');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      await fetch(`/api/portal/websites/${siteId}/google/analytics`, { method: 'DELETE' });
      onConnected();
    } finally {
      setSaving(false);
    }
  };

  if (currentPropertyId) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-icons text-green-600 text-base">check_circle</span>
          <div>
            <span className="text-sm text-foreground">{currentPropertyId}</span>
            {currentMeasurementId && (
              <span className="ml-2 text-xs text-muted-foreground font-mono">
                {currentMeasurementId}
              </span>
            )}
          </div>
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
        Loading Analytics properties...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {accounts.length > 0 && (
        <button
          onClick={() => handleCreate(accounts[0].name!)}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <span className="material-icons text-base">add</span>
          Create new property for {websiteName}
        </button>
      )}

      {properties.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Or select an existing property:</p>
          {properties.slice(0, 10).map((p) => (
            <button
              key={p.name}
              onClick={() => handleSelectExisting(p.name)}
              disabled={saving}
              className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted transition-colors disabled:opacity-50"
            >
              {p.displayName}
              <span className="text-xs text-muted-foreground ml-2">{p.account}</span>
            </button>
          ))}
        </div>
      )}

      {accounts.length === 0 && properties.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          No Google Analytics accounts found. Create one at{' '}
          <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            analytics.google.com
          </a>{' '}
          first.
        </p>
      )}
    </div>
  );
}
