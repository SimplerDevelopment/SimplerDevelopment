import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { CaptureTab } from './tabs/CaptureTab';
import { SearchTab } from './tabs/SearchTab';
import { RecordsTab } from './tabs/RecordsTab';
import { ToastStack, type ToastItem, type ToastLevel } from './components/Toast';
import { getConfig, type ExtensionConfig } from '../lib/storage';

export type TabKey = 'capture' | 'search' | 'records';

interface Props {
  shell: 'popup' | 'sidepanel';
}

export default function App({ shell }: Props) {
  const [tab, setTab] = useState<TabKey>('capture');
  const [config, setConfig] = useState<ExtensionConfig | null | undefined>(undefined);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    getConfig().then((c) => {
      if (!cancelled) setConfig(c);
    });
    const handler = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      if (changes['sd-brain-config']) {
        getConfig().then((c) => setConfig(c));
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(handler);
    };
  }, []);

  const pushToast = useCallback(
    (level: ToastLevel, text: string, href?: string) => {
      setToasts((prev) => [...prev, { id: Date.now() + Math.random(), level, text, href }]);
    },
    []
  );
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const portalUrl = config?.portalUrl ?? '';

  const shellClass = shell === 'popup' ? 'popup-shell' : 'sidepanel-shell';

  // Header context (label after auth-test cache, if any)
  const userLabel = useMemo(() => {
    if (!config?.user?.name && !config?.user?.email) return null;
    return config.user.name || config.user.email || null;
  }, [config]);

  if (config === undefined) {
    return (
      <div className={`${shellClass} items-center justify-center text-slate-500 text-sm`}>
        <div className="p-6">Loading...</div>
      </div>
    );
  }

  if (config === null) {
    return (
      <div className={`${shellClass} bg-white`}>
        <Header label="Not configured" />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
          <Logo size={48} />
          <h2 className="text-lg font-semibold text-slate-900">Welcome to SD Brain</h2>
          <p className="text-sm text-slate-600 max-w-[280px]">
            To get started, set your portal URL and paste a personal API key.
          </p>
          <button
            type="button"
            onClick={() => chrome.runtime.openOptionsPage()}
            className="mt-2 inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Open settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${shellClass} bg-slate-50`}>
      <ToastStack items={toasts} onDismiss={dismissToast} />
      <Header
        label={userLabel ? `${userLabel}${config.client?.name ? ` · ${config.client.name}` : ''}` : 'Connected'}
        onSettings={() => chrome.runtime.openOptionsPage()}
      />
      <Tabs current={tab} onChange={setTab} />
      <div className="flex-1 min-h-0 overflow-y-auto bg-white">
        {tab === 'capture' && (
          <CaptureTab portalUrl={portalUrl} onToast={pushToast} />
        )}
        {tab === 'search' && (
          <SearchTab portalUrl={portalUrl} onToast={pushToast} />
        )}
        {tab === 'records' && <RecordsTab portalUrl={portalUrl} onToast={pushToast} />}
      </div>
    </div>
  );
}

function Header({ label, onSettings }: { label: string; onSettings?: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white">
      <div className="flex items-center gap-2">
        <Logo size={20} />
        <div className="text-sm font-semibold text-slate-900">SD Brain</div>
        <div className="text-[11px] text-slate-500 truncate max-w-[180px]">· {label}</div>
      </div>
      {onSettings && (
        <button
          type="button"
          onClick={onSettings}
          className="text-slate-500 hover:text-slate-900 p-1"
          aria-label="Settings"
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}
    </div>
  );
}

function Tabs({ current, onChange }: { current: TabKey; onChange(t: TabKey): void }) {
  const items: { key: TabKey; label: string; icon: ReactElement }[] = [
    {
      key: 'capture',
      label: 'Capture',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      ),
    },
    {
      key: 'search',
      label: 'Search',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    },
    {
      key: 'records',
      label: 'Records',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ];
  return (
    <div className="grid grid-cols-3 border-b border-slate-200 bg-white">
      {items.map((it) => {
        const active = it.key === current;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              active
                ? 'text-brand-700 border-b-2 border-brand-600 -mb-px'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#4f46e5" />
      <path
        d="M9 7c1.4-1.5 4.6-1.5 6 0s.5 3.5-1 4.5 1.5 1.5 1.5 3.5-2 3-4 3-3.5-1-3.5-3"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
