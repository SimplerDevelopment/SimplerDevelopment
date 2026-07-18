'use client';

import { useState, useEffect, useCallback } from 'react';

interface Environment {
  id: number;
  name: string;
  vercelTarget: string;
  previewUrl: string | null;
}

interface EnvVar {
  id: number;
  key: string;
  value: string;
  syncedToVercel: boolean;
}

interface Backup {
  id: number;
  name: string;
  createdAt: string;
}

export default function EnvironmentPanel({
  siteId,
  environments,
}: {
  siteId: number;
  environments: Environment[];
}) {
  const [activeEnv, setActiveEnv] = useState<Environment>(
    environments.find(e => e.name === 'production') || environments[0],
  );
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New var form
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  // Action states
  const [syncing, setSyncing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [copying, setCopying] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  // Visibility toggle for values
  const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set());

  const otherEnv = environments.find(e => e.id !== activeEnv.id);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [varsRes, backupsRes] = await Promise.all([
      fetch(`/api/portal/websites/${siteId}/environments/${activeEnv.id}/vars`),
      fetch(`/api/portal/websites/${siteId}/environments/${activeEnv.id}/backup`),
    ]);
    const [varsJson, backupsJson] = await Promise.all([varsRes.json(), backupsRes.json()]);
    if (varsJson.success) setVars(varsJson.data);
    if (backupsJson.success) setBackups(backupsJson.data);
    setLoading(false);
  }, [siteId, activeEnv.id]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [varsRes, backupsRes] = await Promise.all([
        fetch(`/api/portal/websites/${siteId}/environments/${activeEnv.id}/vars`),
        fetch(`/api/portal/websites/${siteId}/environments/${activeEnv.id}/backup`),
      ]);
      const [varsJson, backupsJson] = await Promise.all([varsRes.json(), backupsRes.json()]);
      if (varsJson.success) setVars(varsJson.data);
      if (backupsJson.success) setBackups(backupsJson.data);
      setLoading(false);
      setVisibleIds(new Set());
      setEditingId(null);
    })();
  }, [loadData]);

  const clearMessages = () => { setError(''); setSuccess(''); };

  const handleAddVar = async () => {
    if (!newKey.trim()) return;
    setAdding(true);
    clearMessages();
    const res = await fetch(`/api/portal/websites/${siteId}/environments/${activeEnv.id}/vars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newKey, value: newValue }),
    });
    const json = await res.json();
    if (json.success) {
      setNewKey('');
      setNewValue('');
      await loadData();
    } else {
      setError(json.message);
    }
    setAdding(false);
  };

  const handleUpdateVar = async (varId: number) => {
    clearMessages();
    const res = await fetch(`/api/portal/websites/${siteId}/environments/${activeEnv.id}/vars/${varId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: editValue }),
    });
    const json = await res.json();
    if (json.success) {
      setEditingId(null);
      await loadData();
    } else {
      setError(json.message);
    }
  };

  const handleDeleteVar = async (varId: number) => {
    clearMessages();
    const res = await fetch(`/api/portal/websites/${siteId}/environments/${activeEnv.id}/vars/${varId}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (json.success) await loadData();
    else setError(json.message);
  };

  const handleSync = async () => {
    setSyncing(true);
    clearMessages();
    const res = await fetch(`/api/portal/websites/${siteId}/environments/${activeEnv.id}/sync`, { method: 'POST' });
    const json = await res.json();
    if (json.success) { setSuccess(json.message); await loadData(); }
    else setError(json.message);
    setSyncing(false);
  };

  const handleBackup = async () => {
    setBackingUp(true);
    clearMessages();
    const res = await fetch(`/api/portal/websites/${siteId}/environments/${activeEnv.id}/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (json.success) { setSuccess(json.message); await loadData(); }
    else setError(json.message);
    setBackingUp(false);
  };

  const handleRestore = async (backupId: number) => {
    setRestoringId(backupId);
    clearMessages();
    const res = await fetch(`/api/portal/websites/${siteId}/environments/${activeEnv.id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupId }),
    });
    const json = await res.json();
    if (json.success) { setSuccess(json.message); await loadData(); }
    else setError(json.message);
    setRestoringId(null);
  };

  const handleCopy = async () => {
    if (!otherEnv) return;
    setCopying(true);
    clearMessages();
    const res = await fetch(`/api/portal/websites/${siteId}/environments/${activeEnv.id}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromEnvironmentId: otherEnv.id }),
    });
    const json = await res.json();
    if (json.success) { setSuccess(json.message); await loadData(); }
    else setError(json.message);
    setCopying(false);
  };

  const toggleVisible = (id: number) => {
    setVisibleIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const maskValue = (value: string) => value.length > 4 ? '*'.repeat(value.length - 4) + value.slice(-4) : '****';

  const unsyncedCount = vars.filter(v => !v.syncedToVercel).length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Environment Switcher */}
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3">
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          {environments.map(env => (
            <button
              key={env.id}
              onClick={() => setActiveEnv(env)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeEnv.id === env.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                env.name === 'production' ? 'bg-green-500' : 'bg-amber-500'
              }`} />
              {env.name === 'production' ? 'Production' : 'Staging'}
            </button>
          ))}
        </div>
        {activeEnv.previewUrl && (
          <a
            href={activeEnv.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="material-icons text-sm">open_in_new</span>
            Preview URL
          </a>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Messages */}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        {/* Actions Bar */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSync}
            disabled={syncing || vars.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <span className={`material-icons text-sm ${syncing ? 'animate-spin' : ''}`}>
              {syncing ? 'refresh' : 'cloud_upload'}
            </span>
            {syncing ? 'Syncing...' : `Sync to Vercel${unsyncedCount > 0 ? ` (${unsyncedCount})` : ''}`}
          </button>
          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <span className="material-icons text-sm">{backingUp ? 'hourglass_empty' : 'backup'}</span>
            {backingUp ? 'Creating...' : 'Create Backup'}
          </button>
          {otherEnv && (
            <button
              onClick={handleCopy}
              disabled={copying}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <span className="material-icons text-sm">{copying ? 'hourglass_empty' : 'content_copy'}</span>
              {copying ? 'Copying...' : `Copy from ${otherEnv.name === 'production' ? 'Production' : 'Staging'}`}
            </button>
          )}
        </div>

        {/* Env Vars */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">vpn_key</span>
            Environment Variables
          </h4>

          {loading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>
          ) : (
            <>
              {/* Var list */}
              {vars.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                  {vars.map(v => (
                    <div key={v.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="font-mono text-xs font-medium text-foreground min-w-[120px] truncate">{v.key}</span>
                      <span className="text-muted-foreground">=</span>
                      {editingId === v.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            className="flex-1 px-2 py-1 bg-background border border-border rounded text-xs font-mono outline-none focus:border-primary"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleUpdateVar(v.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button onClick={() => handleUpdateVar(v.id)} className="text-green-600 hover:text-green-700">
                            <span className="material-icons text-base">check</span>
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                            <span className="material-icons text-base">close</span>
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="font-mono text-xs text-muted-foreground flex-1 truncate">
                            {visibleIds.has(v.id) ? v.value : maskValue(v.value)}
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {!v.syncedToVercel && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1" title="Not synced" />
                            )}
                            <button onClick={() => toggleVisible(v.id)} className="p-1 text-muted-foreground hover:text-foreground">
                              <span className="material-icons text-sm">
                                {visibleIds.has(v.id) ? 'visibility_off' : 'visibility'}
                              </span>
                            </button>
                            <button onClick={() => { setEditingId(v.id); setEditValue(v.value); }} className="p-1 text-muted-foreground hover:text-foreground">
                              <span className="material-icons text-sm">edit</span>
                            </button>
                            <button onClick={() => handleDeleteVar(v.id)} className="p-1 text-muted-foreground hover:text-red-600">
                              <span className="material-icons text-sm">delete_outline</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add var */}
              <div className="flex gap-2">
                <input
                  value={newKey}
                  onChange={e => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                  placeholder="KEY_NAME"
                  className="px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono outline-none focus:border-primary transition-colors w-40"
                  onKeyDown={e => e.key === 'Enter' && handleAddVar()}
                />
                <input
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  placeholder="value"
                  className="px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono outline-none focus:border-primary transition-colors flex-1"
                  onKeyDown={e => e.key === 'Enter' && handleAddVar()}
                />
                <button
                  onClick={handleAddVar}
                  disabled={adding || !newKey.trim()}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {adding ? 'Adding...' : 'Add'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Backups */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">backup</span>
            Backups
          </h4>

          {backups.length > 0 ? (
            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
              {backups.map(b => (
                <div key={b.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">{b.name}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => handleRestore(b.id)}
                    disabled={restoringId === b.id}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-foreground border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <span className="material-icons text-sm">{restoringId === b.id ? 'hourglass_empty' : 'restore'}</span>
                    {restoringId === b.id ? 'Restoring...' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">No backups yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
