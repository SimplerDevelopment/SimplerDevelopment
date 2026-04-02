'use client';

import { useState, useEffect } from 'react';

interface ProfileOption {
  id: number;
  name: string;
  isDefault: boolean;
  primaryColor: string | null;
  accentColor: string | null;
}

interface BrandingProfileSelectorProps {
  value: number | null;
  onChange: (profileId: number | null) => void;
  /** Label shown above the dropdown */
  label?: string;
  /** Show "None" option (null) */
  allowNone?: boolean;
  noneLabel?: string;
}

export default function BrandingProfileSelector({
  value,
  onChange,
  label = 'Branding Profile',
  allowNone = true,
  noneLabel = 'Site Default',
}: BrandingProfileSelectorProps) {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/branding/profiles')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setProfiles(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="h-9 bg-muted/30 rounded-md animate-pulse" />
      </div>
    );
  }

  if (profiles.length === 0) return null;

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}
          className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
        >
          {allowNone && <option value="">{noneLabel}</option>}
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.isDefault ? ' (Default)' : ''}
            </option>
          ))}
        </select>
        {/* Color dot preview */}
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex gap-0.5 pointer-events-none">
          {(() => {
            const selected = profiles.find((p) => p.id === value);
            if (!selected) return <span className="material-icons text-sm text-muted-foreground">palette</span>;
            return (
              <>
                <span
                  className="w-3 h-3 rounded-full border border-border"
                  style={{ backgroundColor: selected.primaryColor || '#2563eb' }}
                />
              </>
            );
          })()}
        </div>
        <span className="material-icons text-sm text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          expand_more
        </span>
      </div>
    </div>
  );
}
