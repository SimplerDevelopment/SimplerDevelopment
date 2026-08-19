'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';

type IconComponent = React.ComponentType<{ size?: number; className?: string }>;
type IconEntry = { name: string; Component: IconComponent };

/*
 * react-icons/md is ~4,300 components (1.9MB raw / 348KB gzipped). A static
 * `import * as MdIcons` cannot be tree-shaken — the bundler can't prove which
 * entries the Object.entries() loop below touches — so the entire set was
 * retained and hoisted into a shared chunk that EVERY public client site
 * downloaded. Measured 2026-08-19: 331KB of 348KB unused on every page of
 * integratouch, ~22% of total page weight, the single largest LCP contributor
 * on a bandwidth-bound mobile profile.
 *
 * The dynamic import below is load-bearing, not a style choice: it puts the
 * icon set in its own chunk that nothing pulls until someone actually opens
 * this picker. Do not convert it back to a static import.
 */
let iconIndex: IconEntry[] | null = null;
let iconIndexPromise: Promise<IconEntry[]> | null = null;

function loadIconIndex(): Promise<IconEntry[]> {
  if (iconIndex) return Promise.resolve(iconIndex);
  iconIndexPromise ??= import('react-icons/md').then((mod) => {
    iconIndex = Object.entries(mod)
      .filter(([name, Component]) => name.startsWith('Md') && typeof Component === 'function')
      .map(([name, Component]) => ({ name, Component: Component as IconComponent }));
    return iconIndex;
  });
  return iconIndexPromise;
}

// Convert MdIconName to readable label: MdDashboard -> Dashboard, MdBarChart -> Bar Chart
function iconLabel(name: string): string {
  return name.replace(/^Md/, '').replace(/([A-Z])/g, ' $1').trim();
}

// Convert material icon name (e.g. "bar_chart") to react-icons name (e.g. "MdBarChart")
function materialToReactIcon(materialName: string): string {
  return 'Md' + materialName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

// Convert react-icons name back to material icon name
function reactIconToMaterial(reactName: string): string {
  return reactName.replace(/^Md/, '').replace(/([A-Z])/g, (m) => '_' + m.toLowerCase()).replace(/^_/, '');
}

interface IconPickerProps {
  value: string | undefined;
  onChange: (value: string) => void;
  label?: string;
}

export function IconPicker({ value, onChange, label = 'Icon' }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Starts populated on a reopen — the index is cached at module scope.
  const [icons, setIcons] = useState<IconEntry[]>(() => iconIndex ?? []);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Resolve current icon. The closed state renders the selection through the
  // material-icons webfont (as the chevron/clear affordances below already do)
  // so a picker that is merely *mounted* never pulls the icon chunk.
  const currentReactName = value ? materialToReactIcon(value) : '';

  // Pull the icon set on first open only.
  useEffect(() => {
    if (!open || icons.length) return;
    let cancelled = false;
    loadIconIndex().then((list) => { if (!cancelled) setIcons(list); });
    return () => { cancelled = true; };
  }, [open, icons.length]);

  // Filter icons by search
  const filtered = useMemo(() => {
    if (!search.trim()) return icons.slice(0, 60); // Show first 60 when no search
    const q = search.toLowerCase();
    return icons.filter(i => iconLabel(i.name).toLowerCase().includes(q)).slice(0, 60);
  }, [search, icons]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search when opened
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const selectIcon = useCallback((name: string) => {
    onChange(reactIconToMaterial(name));
    setOpen(false);
    setSearch('');
  }, [onChange]);

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-1 w-full flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-sm text-left hover:bg-accent/50 transition-colors"
        >
          {value ? (
            <span className="material-icons text-lg text-foreground shrink-0">{value}</span>
          ) : (
            <span className="material-icons text-lg text-muted-foreground/50 shrink-0">add_circle_outline</span>
          )}
          <span className={`flex-1 truncate ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
            {value ? iconLabel(currentReactName) : 'Choose icon...'}
          </span>
          {value && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <span className="material-icons text-sm">close</span>
            </button>
          )}
          <span className="material-icons text-sm text-muted-foreground">{open ? 'expand_less' : 'expand_more'}</span>
        </button>
      </label>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden" style={{ maxHeight: '320px' }}>
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search icons..."
              className="w-full px-2.5 py-1.5 text-sm rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Icon grid */}
          <div className="overflow-y-auto p-2" style={{ maxHeight: '260px' }}>
            {icons.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Loading icons&hellip;</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No icons match &ldquo;{search}&rdquo;</p>
            ) : (
              <div className="grid grid-cols-6 gap-1">
                {filtered.map(({ name, Component }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => selectIcon(name)}
                    className={`flex flex-col items-center justify-center p-2 rounded hover:bg-accent transition-colors ${
                      currentReactName === name ? 'bg-primary/10 ring-1 ring-primary' : ''
                    }`}
                    title={iconLabel(name)}
                  >
                    <Component size={20} className="text-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
