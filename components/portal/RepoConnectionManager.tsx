'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface RepoConnectionManagerProps {
  siteId: number;
  initialRepoName: string | null;
  initialRepoUrl: string | null;
  initialBranch: string | null;
}

export default function RepoConnectionManager({
  siteId,
  initialRepoName,
  initialRepoUrl,
  initialBranch,
}: RepoConnectionManagerProps) {
  const router = useRouter();
  const [repoName, setRepoName] = useState(initialRepoName || '');
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl || '');
  const [branch, setBranch] = useState(initialBranch || 'main');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(!initialRepoName);

  const connected = !!initialRepoName;

  const handleRepoUrlChange = (url: string) => {
    setRepoUrl(url);
    // Auto-extract repo name from GitHub URL
    const match = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?(?:\/|$)/);
    if (match) {
      setRepoName(match[1]);
    }
  };

  const handleSave = async () => {
    if (!repoName.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/portal/cms/websites/${siteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubRepoName: repoName.trim(),
          githubRepoUrl: repoUrl.trim() || `https://github.com/${repoName.trim()}`,
          deployBranch: branch.trim() || 'main',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage('Repository connected.');
        setEditing(false);
        router.refresh();
      } else {
        setMessage(json.message || 'Failed to save.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/portal/cms/websites/${siteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubRepoName: null,
          githubRepoUrl: null,
          deployBranch: null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setRepoName('');
        setRepoUrl('');
        setBranch('main');
        setMessage('Repository disconnected.');
        setEditing(true);
        router.refresh();
      } else {
        setMessage(json.message || 'Failed to disconnect.');
      }
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-icons text-muted-foreground text-lg">source</span>
          <h3 className="font-semibold text-sm text-foreground">Repository Connection</h3>
        </div>
        {connected && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-primary hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Connect a GitHub repository to use your own codebase with the SimplerDevelopment SDK.
        Without a repo, your site is served by the built-in rendering engine.
      </p>

      {/* Connected state (not editing) */}
      {connected && !editing && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <svg className="w-5 h-5 text-foreground shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <div className="flex-1 min-w-0">
              <a
                href={initialRepoUrl || `https://github.com/${initialRepoName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-foreground hover:text-primary transition-colors font-mono"
              >
                {initialRepoName}
              </a>
              {initialBranch && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="material-icons text-[10px] align-middle mr-0.5">commit</span>
                  Branch: <span className="font-mono">{initialBranch}</span>
                </p>
              )}
            </div>
            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium dark:bg-green-900/40 dark:text-green-300">
              Connected
            </span>
          </div>

          <button
            onClick={handleRemove}
            disabled={removing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            {removing ? (
              <span className="material-icons text-base animate-spin">refresh</span>
            ) : (
              <span className="material-icons text-base">link_off</span>
            )}
            {removing ? 'Disconnecting...' : 'Disconnect Repository'}
          </button>
        </div>
      )}

      {/* Edit / connect form */}
      {editing && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Repository URL</label>
            <input
              value={repoUrl}
              onChange={e => handleRepoUrlChange(e.target.value)}
              placeholder="https://github.com/your-org/your-repo"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground outline-none focus:border-primary text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Paste the full GitHub URL. The repo name will be extracted automatically.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Repository name</label>
            <input
              value={repoName}
              onChange={e => setRepoName(e.target.value)}
              placeholder="org/repo-name"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground outline-none focus:border-primary text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Deploy branch</label>
            <input
              value={branch}
              onChange={e => setBranch(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground outline-none focus:border-primary text-sm font-mono"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !repoName.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving && <span className="material-icons text-base animate-spin">refresh</span>}
              {saving ? 'Saving...' : connected ? 'Update Connection' : 'Connect Repository'}
            </button>
            {connected && (
              <button
                onClick={() => { setEditing(false); setRepoName(initialRepoName || ''); setRepoUrl(initialRepoUrl || ''); setBranch(initialBranch || 'main'); }}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.includes('connected') || message.includes('disconnected') ? 'text-green-600' : 'text-red-600'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
