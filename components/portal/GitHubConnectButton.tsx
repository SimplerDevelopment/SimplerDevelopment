'use client';

import { useState } from 'react';

interface GitHubConnection {
  githubUsername: string;
}

export default function GitHubConnectButton({ siteId }: { siteId: number }) {
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [loading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return params.get('github') === 'connected' ? 'GitHub connected successfully!' : '';
  });

  const handleRequestAccess = async () => {
    setRequesting(true);
    setMessage('');
    try {
      const res = await fetch(`/api/portal/websites/${siteId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: 'push' }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(json.message || 'Added as collaborator!');
      } else {
        if (json.message?.includes('Connect your GitHub')) {
          // User needs to connect GitHub first
          setConnection(null);
          setMessage('');
          window.location.href = '/api/portal/github/connect';
          return;
        }
        setMessage(json.message || 'Failed to request access.');
      }
    } finally {
      setRequesting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <span className="material-icons text-muted-foreground text-lg">source</span>
        <h3 className="font-semibold text-sm text-foreground">GitHub Access</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Connect your GitHub account to get collaborator access to this website&apos;s repository.
      </p>
      <div className="flex items-center gap-3">
        <a
          href="/api/portal/github/connect"
          className="flex items-center gap-2 px-4 py-2 bg-[#24292f] text-white rounded-lg text-sm font-medium hover:bg-[#24292f]/90 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          Connect GitHub
        </a>
        <button
          onClick={handleRequestAccess}
          disabled={requesting}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {requesting && <span className="material-icons text-base animate-spin">refresh</span>}
          Request Repo Access
        </button>
      </div>
      {message && (
        <p className={`text-sm ${message.includes('success') || message.includes('Added') ? 'text-green-600' : 'text-red-600'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
