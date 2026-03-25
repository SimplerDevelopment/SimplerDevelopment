'use client';

import { useEffect, useState } from 'react';

interface StatusData {
  deploymentStatus: string | null;
  subdomain: string | null;
  fullDomain: string | null;
  githubRepoName: string | null;
  githubRepoUrl: string | null;
  vercelProjectId: string | null;
  vercelProjectUrl: string | null;
  vercelDomain: string | null;
  lastDeployedAt: string | null;
  provisionError: string | null;
}

const STEPS = [
  { key: 'repo', label: 'Creating repository', icon: 'source' },
  { key: 'vercel', label: 'Setting up deployment', icon: 'cloud_upload' },
  { key: 'dns', label: 'Configuring DNS', icon: 'dns' },
  { key: 'done', label: 'Live', icon: 'check_circle' },
];

function getCompletedStep(data: StatusData): number {
  if (data.deploymentStatus === 'active') return 4;
  if (data.vercelProjectId) return 2;
  if (data.githubRepoName) return 1;
  return 0;
}

export default function ProvisioningStatus({ siteId }: { siteId: number }) {
  const [data, setData] = useState<StatusData | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  const fetchStatus = async () => {
    const res = await fetch(`/api/portal/websites/${siteId}/status`);
    const json = await res.json();
    if (json.success) setData(json.data);
  };

  useEffect(() => {
    fetchStatus();
  }, [siteId]);

  // Poll while provisioning
  useEffect(() => {
    if (!data) return;
    const isProvisioning = data.deploymentStatus === 'provisioning';
    if (!isProvisioning) return;

    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [data?.deploymentStatus, siteId]);

  const handleProvision = async () => {
    setProvisioning(true);
    try {
      const res = await fetch(`/api/portal/websites/${siteId}/provision`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        await fetchStatus();
      }
    } finally {
      setProvisioning(false);
    }
  };

  if (!data) return null;

  const status = data.deploymentStatus || 'pending';
  const completedStep = getCompletedStep(data);

  if (status === 'pending') {
    return (
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <span className="material-icons text-blue-500">rocket_launch</span>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Deploy your website</h3>
            <p className="text-sm text-muted-foreground">
              Set up a GitHub repo, Vercel deployment, and {data.subdomain}.simplerdevelopment.com subdomain.
            </p>
          </div>
        </div>
        <button
          onClick={handleProvision}
          disabled={provisioning}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {provisioning && <span className="material-icons text-base animate-spin">refresh</span>}
          {provisioning ? 'Starting...' : 'Deploy Now'}
        </button>
      </div>
    );
  }

  if (status === 'provisioning') {
    return (
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className="material-icons text-blue-500 animate-spin">settings</span>
          <h3 className="font-semibold text-foreground">Setting up your website...</h3>
        </div>
        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const done = i < completedStep;
            const active = i === completedStep;
            return (
              <div key={step.key} className="flex items-center gap-3">
                <span className={`material-icons text-lg ${done ? 'text-green-500' : active ? 'text-blue-500 animate-pulse' : 'text-muted-foreground/30'}`}>
                  {done ? 'check_circle' : active ? 'pending' : 'radio_button_unchecked'}
                </span>
                <span className={`text-sm ${done ? 'text-foreground' : active ? 'text-foreground font-medium' : 'text-muted-foreground/50'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="bg-card border border-red-200 dark:border-red-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <span className="material-icons text-red-500">error</span>
          <h3 className="font-semibold text-foreground">Provisioning failed</h3>
        </div>
        {data.provisionError && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg font-mono text-xs">
            {data.provisionError}
          </p>
        )}
        <button
          onClick={handleProvision}
          disabled={provisioning}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {provisioning && <span className="material-icons text-base animate-spin">refresh</span>}
          {provisioning ? 'Retrying...' : 'Retry'}
        </button>
      </div>
    );
  }

  // Active — show infrastructure links
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-foreground">Infrastructure</h3>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <span className="material-icons text-xs">check_circle</span>
          Active
        </span>
      </div>
      <div className="p-5 space-y-4">
        {/* Subdomain */}
        {data.fullDomain && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-icons text-muted-foreground text-lg">language</span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Subdomain</p>
                <a href={`https://${data.fullDomain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline font-mono truncate block">
                  {data.fullDomain}
                </a>
              </div>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(`https://${data.fullDomain}`)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Copy URL"
            >
              <span className="material-icons text-lg">content_copy</span>
            </button>
          </div>
        )}

        {/* GitHub */}
        {data.githubRepoUrl && (
          <div className="flex items-center gap-2">
            <span className="material-icons text-muted-foreground text-lg">source</span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Repository</p>
              <a href={data.githubRepoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate block">
                {data.githubRepoName}
              </a>
            </div>
          </div>
        )}

        {/* Vercel */}
        {data.vercelProjectUrl && (
          <div className="flex items-center gap-2">
            <span className="material-icons text-muted-foreground text-lg">cloud</span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Vercel Dashboard</p>
              <a href={data.vercelProjectUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate block">
                Open Dashboard
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
