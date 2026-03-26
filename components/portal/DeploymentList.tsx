'use client';

import { useCallback, useEffect, useState } from 'react';

interface Deployment {
  id: string;
  url: string;
  state: string;
  createdAt: number;
  meta?: { githubCommitMessage?: string; githubCommitRef?: string };
}

interface LogEvent {
  type: string;
  text: string;
  created: number;
}

const stateConfig: Record<string, { icon: string; color: string; label: string }> = {
  READY: { icon: 'check_circle', color: 'text-green-500', label: 'Ready' },
  BUILDING: { icon: 'pending', color: 'text-blue-500', label: 'Building' },
  QUEUED: { icon: 'schedule', color: 'text-muted-foreground', label: 'Queued' },
  ERROR: { icon: 'error', color: 'text-red-500', label: 'Error' },
  CANCELED: { icon: 'cancel', color: 'text-muted-foreground', label: 'Canceled' },
};

function DeploymentLogs({ siteId, deploymentId }: { siteId: number; deploymentId: string }) {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/portal/websites/${siteId}/deployments/${deploymentId}/logs`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setLogs(json.data);
        else setError(json.message || 'Failed to load logs');
      })
      .catch(() => setError('Failed to load logs'))
      .finally(() => setLoading(false));
  }, [siteId, deploymentId]);

  if (loading) {
    return (
      <div className="px-5 py-3 flex items-center gap-2 text-muted-foreground">
        <span className="material-icons text-sm animate-spin">refresh</span>
        <span className="text-xs">Loading logs...</span>
      </div>
    );
  }

  if (error) {
    return <p className="px-5 py-3 text-xs text-red-600">{error}</p>;
  }

  if (logs.length === 0) {
    return <p className="px-5 py-3 text-xs text-muted-foreground">No logs available.</p>;
  }

  return (
    <div className="bg-[#0d1117] rounded-b-lg max-h-80 overflow-y-auto">
      <pre className="px-4 py-3 text-xs font-mono leading-relaxed text-[#c9d1d9] whitespace-pre-wrap break-all">
        {logs.map((log, i) => (
          <span key={i} className={log.type === 'stderr' ? 'text-red-400' : ''}>
            {log.text}
            {'\n'}
          </span>
        ))}
      </pre>
    </div>
  );
}

export default function DeploymentList({ siteId }: { siteId: number }) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDeployments = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/websites/${siteId}/deployments`);
      const json = await res.json();
      if (json.success) setDeployments(json.data);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchDeployments();
    const interval = setInterval(fetchDeployments, 30000);
    return () => clearInterval(interval);
  }, [fetchDeployments]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="material-icons animate-spin text-lg">refresh</span>
          <span className="text-sm">Loading deployments...</span>
        </div>
      </div>
    );
  }

  if (deployments.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/20">
        <h3 className="font-semibold text-sm text-foreground">Recent Deployments</h3>
      </div>
      <ul className="divide-y divide-border">
        {deployments.map((d) => {
          const cfg = stateConfig[d.state] || stateConfig.QUEUED;
          const isExpanded = expandedId === d.id;
          return (
            <li key={d.id}>
              <div className="px-5 py-3 flex items-center gap-3">
                <span className={`material-icons text-lg ${cfg.color}`}>{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    {d.meta?.githubCommitMessage || 'Deployment'}
                  </p>
                  {d.meta?.githubCommitRef && (
                    <p className="text-xs text-muted-foreground font-mono">{d.meta.githubCommitRef}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : d.id)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title={isExpanded ? 'Hide logs' : 'View logs'}
                  >
                    <span className="material-icons text-base">
                      {isExpanded ? 'expand_less' : 'terminal'}
                    </span>
                  </button>
                  {d.state === 'READY' && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                      title="Visit"
                    >
                      <span className="material-icons text-base">open_in_new</span>
                    </a>
                  )}
                </div>
              </div>
              {isExpanded && <DeploymentLogs siteId={siteId} deploymentId={d.id} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
