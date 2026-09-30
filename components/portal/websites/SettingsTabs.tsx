'use client';

/**
 * PUX-190 (design doc screen 49): the site settings sections behind six
 * tabs. Every pane stays mounted (hidden, not unmounted) so the forms keep
 * their state and no section re-fetches when the tab changes. Studio-only;
 * the settings page gates on hasFlag(client, 'portal-redesign').
 */

import { useState, type ReactNode } from 'react';

export interface SettingsPane { id: string; label: string; icon: string; node: ReactNode }

export default function SettingsTabs({ panes }: { panes: SettingsPane[] }) {
  const [active, setActive] = useState(panes[0]?.id);
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-1 border-b border-border pb-3">
        {panes.map((p) => {
          const on = p.id === active;
          return (
            <button key={p.id} type="button" role="tab" aria-selected={on} aria-controls={`settings-pane-${p.id}`} onClick={() => setActive(p.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${on ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>
              <span className="material-icons text-sm">{p.icon}</span>{p.label}
            </button>
          );
        })}
      </div>
      {panes.map((p) => (
        <div key={p.id} id={`settings-pane-${p.id}`} role="tabpanel" hidden={p.id !== active} className="space-y-6">{p.node}</div>
      ))}
    </div>
  );
}
