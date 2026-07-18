'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as MdIcons from 'react-icons/md';

// Build a searchable index of Material Design icons
const ALL_ICONS: { name: string; Component: React.ComponentType<{ size?: number; className?: string }> }[] = [];

for (const [name, Component] of Object.entries(MdIcons)) {
  if (name.startsWith('Md') && typeof Component === 'function') {
    ALL_ICONS.push({ name, Component: Component as React.ComponentType<{ size?: number; className?: string }> });
  }
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
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Resolve current icon
  const currentReactName = value ? materialToReactIcon(value) : '';
  const CurrentIcon = value ? (MdIcons as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[currentReactName] : null;

  // Filter icons by search
  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_ICONS.slice(0, 60); // Show first 60 when no search
    const q = search.toLowerCase();
    return ALL_ICONS.filter(i => iconLabel(i.name).toLowerCase().includes(q)).slice(0, 60);
  }, [search]);

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
          {CurrentIcon ? (
            <CurrentIcon size={18} className="text-foreground shrink-0" />
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
            {filtered.length === 0 ? (
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
