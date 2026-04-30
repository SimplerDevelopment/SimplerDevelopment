'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ClientEntry {
  id: number;
  company: string;
  role: string;
  website: string | null;
}

export default function CompanySwitcher() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [activeClientId, setActiveClientId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/portal/clients')
      .then(r => r.json())
      .then(data => {
        if (data.clients) {
          setClients(data.clients);
          setActiveClientId(data.activeClientId);
        }
      })
      .catch(() => {});
  }, []);

  // Close on click outside or Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const activeClient = clients.find(c => c.id === activeClientId);
  const hasMultiple = clients.length > 1;
  const initial = activeClient?.company?.charAt(0)?.toUpperCase() || 'S';

  const handleSwitch = async (clientId: number) => {
    if (clientId === activeClientId) { setOpen(false); return; }
    setSwitching(true);
    try {
      const res = await fetch('/api/portal/switch-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      if (res.ok) {
        setActiveClientId(clientId);
        setOpen(false);
        router.refresh();
        router.push('/portal/dashboard');
      }
    } finally {
      setSwitching(false);
    }
  };

  // Loading state
  if (clients.length === 0) {
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-muted animate-pulse shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="h-3 w-20 bg-muted rounded animate-pulse" />
          <div className="h-3.5 w-28 bg-muted rounded animate-pulse mt-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-w-0 flex-1" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 min-w-0 w-full text-left rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-accent/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="text-sm font-bold text-foreground truncate">
              {activeClient?.company || 'Select company'}
            </p>
            <span className="material-icons text-muted-foreground text-sm shrink-0">
              {open ? 'expand_less' : 'expand_more'}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight capitalize">{activeClient?.role || 'member'}</p>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-[60] overflow-hidden">
          <DropdownContent
            clients={clients}
            activeClientId={activeClientId}
            switching={switching}
            onSwitch={handleSwitch}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function DropdownContent({
  clients,
  activeClientId,
  switching,
  onSwitch,
  onClose,
}: {
  clients: ClientEntry[];
  activeClientId: number | null;
  switching: boolean;
  onSwitch: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Active company header */}
      {(() => {
        const active = clients.find(c => c.id === activeClientId);
        if (!active) return null;
        return (
          <div className="px-3 py-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                {active.company.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground truncate">{active.company}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{active.role}</p>
              </div>
              <span className="material-icons text-green-500 text-base shrink-0">check_circle</span>
            </div>
          </div>
        );
      })()}

      {/* Other companies */}
      {clients.filter(c => c.id !== activeClientId).length > 0 && (
        <>
          <div className="px-3 pt-2 pb-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
              Switch to
            </p>
          </div>
          <div className="max-h-48 overflow-y-auto pb-1">
            {clients.filter(c => c.id !== activeClientId).map(c => (
              <button
                key={c.id}
                onClick={() => onSwitch(c.id)}
                disabled={switching}
                className={`flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-accent transition-colors ${switching ? 'opacity-50' : ''}`}
              >
                <div className="w-7 h-7 rounded-md bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0">
                  {c.company.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{c.company}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{c.role}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Footer actions */}
      <div className="border-t border-border px-3 py-2">
        <a
          href="/portal/settings/team"
          onClick={onClose}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          <span className="material-icons text-sm">group_add</span>
          Invite people
        </a>
      </div>
    </>
  );
}
