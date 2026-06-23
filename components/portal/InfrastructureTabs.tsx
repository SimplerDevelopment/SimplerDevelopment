'use client';

import { useState, type ReactNode } from 'react';

const TABS = [
  { id: 'infrastructure', label: 'Infrastructure', icon: 'cloud' },
  { id: 'deployments', label: 'Recent Deployments', icon: 'rocket_launch' },
  { id: 'logs', label: 'HTTP Logs', icon: 'monitoring' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function InfrastructureTabs({
  infrastructure,
  deployments,
  logs,
}: {
  infrastructure: ReactNode;
  deployments: ReactNode;
  logs: ReactNode;
}) {
  const [active, setActive] = useState<TabId>('infrastructure');

  const content: Record<TabId, ReactNode> = { infrastructure, deployments, logs };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border bg-muted/20">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
              active === tab.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">{tab.icon}</span>
            {tab.label}
            {active === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-5">
        {content[active]}
      </div>
    </div>
  );
}
