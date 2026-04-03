'use client';

import { useState, useEffect } from 'react';

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysManager({ siteId }: { siteId: number }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    const res = await fetch(`/api/portal/websites/${siteId}/api-keys`);
    const json = await res.json();
    if (json.success) setKeys(json.data);
    setLoading(false);
  };

  useEffect(() => { fetchKeys(); }, [siteId]);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    const res = await fetch(`/api/portal/websites/${siteId}/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName.trim() }),
    });
    const json = await res.json();
    if (json.success) {
      setCreatedKey(json.data.key);
      setNewKeyName('');
      fetchKeys();
    }
    setCreating(false);
  };

  const revokeKey = async (keyId: number) => {
    await fetch(`/api/portal/websites/${siteId}/api-keys/${keyId}`, { method: 'DELETE' });
    fetchKeys();
  };

  const copyKey = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Create new key */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newKeyName}
          onChange={e => setNewKeyName(e.target.value)}
          placeholder="Key name (e.g. Production)"
          className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
          onKeyDown={e => e.key === 'Enter' && createKey()}
        />
        <button
          onClick={createKey}
          disabled={creating || !newKeyName.trim()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {creating ? 'Creating...' : 'Create Key'}
        </button>
      </div>

      {/* Newly created key (shown once) */}
      {createdKey && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl dark:bg-green-900/20 dark:border-green-800">
          <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-2">
            <span className="material-icons text-base align-middle mr-1">key</span>
            API key created! Copy it now -- it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white dark:bg-black/20 p-2 rounded border font-mono break-all">
              {createdKey}
            </code>
            <button onClick={copyKey} className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="text-xs text-green-600 dark:text-green-400 mt-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Key list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : keys.length === 0 ? (
        <div className="text-center py-8">
          <span className="material-icons text-4xl text-muted-foreground/30">vpn_key</span>
          <p className="text-sm text-muted-foreground mt-2">No API keys yet. Create one to get started with the SDK.</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
          {keys.map(key => (
            <div key={key.id} className="flex items-center gap-4 px-4 py-3 bg-card">
              <span className="material-icons text-base text-muted-foreground">vpn_key</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{key.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{key.keyPrefix}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">
                  {key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Created {new Date(key.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => revokeKey(key.id)}
                className="text-xs text-red-500 hover:text-red-600 font-medium"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {/* SDK usage hint */}
      <div className="p-4 bg-muted/50 rounded-xl">
        <p className="text-xs font-medium text-foreground mb-2">Quick Start</p>
        <pre className="text-xs text-muted-foreground font-mono overflow-x-auto">{`npm install @simplerdevelopment/sdk

import { SimplerDevelopment } from '@simplerdevelopment/sdk';

const sd = new SimplerDevelopment({
  siteId: ${siteId},
  apiKey: 'your-api-key-here',
});

const posts = await sd.posts.list();`}</pre>
      </div>
    </div>
  );
}
