// ─── MenuSettings: branding panel (logo, brand colors, nav colors) ──────────

'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import type { Branding } from '../_lib/types';

interface Props {
  branding: Branding;
  onChange: (updates: Partial<Branding>) => void;
  siteId: string;
}

export function MenuSettings({ branding, onChange, siteId }: Props) {
  return (
    <div className="p-4 space-y-6">
      {/* Logo */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="material-icons text-base">image</span>
          Logo
        </h3>
        <MediaPicker
          value={branding.logoUrl}
          onChange={(url) => onChange({ logoUrl: url })}
          label="Site Logo"
          apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
        />
        <div className="mt-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Logo Alt Text
          </label>
          <input
            type="text"
            value={branding.logoAlt}
            onChange={(e) => onChange({ logoAlt: e.target.value })}
            className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground"
            placeholder="Company name"
          />
        </div>
      </div>

      {/* Brand Colors */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="material-icons text-base">palette</span>
          Brand Colors
        </h3>
        <div className="space-y-3">
          <ColorField
            label="Primary"
            value={branding.primaryColor}
            onChange={(v) => onChange({ primaryColor: v })}
          />
          <ColorField
            label="Secondary"
            value={branding.secondaryColor}
            onChange={(v) => onChange({ secondaryColor: v })}
          />
          <ColorField
            label="Accent"
            value={branding.accentColor}
            onChange={(v) => onChange({ accentColor: v })}
          />
        </div>
      </div>

      {/* Nav Colors */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="material-icons text-base">format_color_fill</span>
          Navigation Colors
        </h3>
        <div className="space-y-3">
          <ColorField
            label="Background"
            value={branding.navBackground}
            onChange={(v) => onChange({ navBackground: v })}
          />
          <ColorField
            label="Text"
            value={branding.navTextColor}
            onChange={(v) => onChange({ navTextColor: v })}
          />
        </div>
      </div>

      {/* Site Colors */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="material-icons text-base">web</span>
          Site Colors
        </h3>
        <div className="space-y-3">
          <ColorField
            label="Background"
            value={branding.backgroundColor}
            onChange={(v) => onChange({ backgroundColor: v })}
          />
          <ColorField
            label="Text"
            value={branding.textColor}
            onChange={(v) => onChange({ textColor: v })}
          />
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const colorForInput =
    value && value.startsWith('#') && value.length >= 7 ? value.slice(0, 7) : '#ffffff';
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={colorForInput}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-9 rounded-md border border-border cursor-pointer flex-shrink-0 p-0.5"
      />
      <div className="flex-1">
        <label className="block text-xs font-medium text-muted-foreground mb-0.5">{label}</label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 rounded border border-border bg-background text-xs text-foreground font-mono"
        />
      </div>
    </div>
  );
}
