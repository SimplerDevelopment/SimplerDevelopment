/**
 * Styling tab — branding profile picker plus per-page overrides for colors,
 * fonts, button shape, layout, and a live preview swatch.
 *
 * The styling map is a free-form Record<string, string|boolean|undefined>
 * so we don't have to maintain a typed list — the keys ('primaryColor',
 * 'headingFont', etc.) are coordinated with the public render in
 * `app/sites/.../book/...`.
 */
'use client';

import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import type { StylingMap, BrandingProfileSummary } from '../_lib/types';

interface StylingPanelProps {
  color: string;
  setColor: (v: string) => void;
  brandingProfileId: number | null;
  setBrandingProfileId: (v: number | null) => void;
  brandingProfiles: BrandingProfileSummary[];
  styling: StylingMap;
  setStyling: React.Dispatch<React.SetStateAction<StylingMap>>;
}

const COLOR_KEYS = [
  { key: 'primaryColor', label: 'Primary' },
  { key: 'secondaryColor', label: 'Secondary', fallback: '#1e40af' },
  { key: 'accentColor', label: 'Accent', fallback: '#f59e0b' },
  { key: 'backgroundColor', label: 'Background', fallback: '#ffffff' },
  { key: 'textColor', label: 'Text', fallback: '#111827' },
] as const;

export function StylingPanel({
  color,
  setColor,
  brandingProfileId,
  setBrandingProfileId,
  brandingProfiles,
  styling,
  setStyling,
}: StylingPanelProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">Appearance</h3>
        <p className="text-sm text-muted-foreground">
          Customize how your booking page looks. These settings override the branding profile when set.
        </p>
      </div>

      {/* Branding Profile */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Branding Profile</label>
        <select
          value={brandingProfileId || ''}
          onChange={(e) => {
            const profileId = e.target.value ? Number(e.target.value) : null;
            setBrandingProfileId(profileId);
            // When selecting a profile, optionally load its values as a starting
            // point. This mirrors the original page behavior.
            if (profileId) {
              const profile = brandingProfiles.find((p) => p.id === profileId);
              if (profile?.primaryColor) setColor(profile.primaryColor);
            }
          }}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">None (use overrides below)</option>
          {brandingProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDefault ? ' (default)' : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Select a branding profile as a base, then override individual values below.
          {brandingProfiles.length === 0 && (
            <>
              {' '}
              <a href="/portal/branding" className="text-primary hover:underline">
                Create a branding profile
              </a>{' '}
              first.
            </>
          )}
        </p>
      </div>

      {/* Colors */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="material-icons text-base text-muted-foreground">color_lens</span>
          Colors
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {COLOR_KEYS.map(({ key, label, ...rest }) => {
            const fallback =
              'fallback' in rest ? (rest as { fallback: string }).fallback : color || '#2563eb';
            return (
              <div key={key}>
                <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={(styling[key] as string) || fallback}
                    onChange={(e) => setStyling((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={(styling[key] as string) || ''}
                    onChange={(e) => setStyling((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={fallback}
                    className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fonts */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="material-icons text-base text-muted-foreground">text_fields</span>
          Fonts
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Heading Font</label>
            <GoogleFontPicker
              value={(styling.headingFont as string) || ''}
              onChange={(font) => setStyling((prev) => ({ ...prev, headingFont: font }))}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Body Font</label>
            <GoogleFontPicker
              value={(styling.bodyFont as string) || ''}
              onChange={(font) => setStyling((prev) => ({ ...prev, bodyFont: font }))}
            />
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="material-icons text-base text-muted-foreground">smart_button</span>
          Buttons
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Button Background</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={(styling.buttonPrimaryBg as string) || color || '#2563eb'}
                onChange={(e) => setStyling((prev) => ({ ...prev, buttonPrimaryBg: e.target.value }))}
                className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={(styling.buttonPrimaryBg as string) || ''}
                onChange={(e) => setStyling((prev) => ({ ...prev, buttonPrimaryBg: e.target.value }))}
                placeholder="Auto"
                className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Button Text</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={(styling.buttonPrimaryText as string) || '#ffffff'}
                onChange={(e) =>
                  setStyling((prev) => ({ ...prev, buttonPrimaryText: e.target.value }))
                }
                className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={(styling.buttonPrimaryText as string) || ''}
                onChange={(e) =>
                  setStyling((prev) => ({ ...prev, buttonPrimaryText: e.target.value }))
                }
                placeholder="#ffffff"
                className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Border Radius</label>
            <select
              value={(styling.buttonBorderRadius as string) || ''}
              onChange={(e) =>
                setStyling((prev) => ({ ...prev, buttonBorderRadius: e.target.value }))
              }
              className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Default</option>
              <option value="0px">Square (0px)</option>
              <option value="4px">Slight (4px)</option>
              <option value="8px">Rounded (8px)</option>
              <option value="12px">More Rounded (12px)</option>
              <option value="9999px">Pill (full)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Layout */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="material-icons text-base text-muted-foreground">view_quilt</span>
          Layout
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Card Border Radius</label>
            <select
              value={(styling.borderRadius as string) || ''}
              onChange={(e) => setStyling((prev) => ({ ...prev, borderRadius: e.target.value }))}
              className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Default (8px)</option>
              <option value="0px">Square (0px)</option>
              <option value="4px">Slight (4px)</option>
              <option value="12px">Rounded (12px)</option>
              <option value="16px">More Rounded (16px)</option>
              <option value="24px">Very Rounded (24px)</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-6 mt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!styling.hideTitle}
              onChange={(e) => setStyling((prev) => ({ ...prev, hideTitle: e.target.checked }))}
              className="rounded border-border accent-primary"
            />
            <span className="text-sm text-foreground">Hide title on public page</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!styling.hideLogo}
              onChange={(e) => setStyling((prev) => ({ ...prev, hideLogo: e.target.checked }))}
              className="rounded border-border accent-primary"
            />
            <span className="text-sm text-foreground">Hide logo</span>
          </label>
        </div>
      </div>

      {/* Preview swatch */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3">Preview</h4>
        <div
          className="rounded-xl border p-6 flex items-center justify-center gap-4"
          style={{
            backgroundColor: (styling.backgroundColor as string) || '#ffffff',
            borderColor: ((styling.textColor as string) || '#111827') + '20',
            borderRadius: (styling.borderRadius as string) || '8px',
          }}
        >
          <div className="text-center space-y-2">
            <p
              style={{
                fontFamily: (styling.headingFont as string)
                  ? `"${styling.headingFont}", sans-serif`
                  : undefined,
                color: (styling.textColor as string) || '#111827',
                fontWeight: 600,
                fontSize: '1.1rem',
              }}
            >
              Book a Meeting
            </p>
            <button
              className="px-5 py-2 text-sm font-medium transition-opacity"
              style={{
                backgroundColor:
                  (styling.buttonPrimaryBg as string) ||
                  (styling.primaryColor as string) ||
                  color ||
                  '#2563eb',
                color: (styling.buttonPrimaryText as string) || '#ffffff',
                borderRadius: (styling.buttonBorderRadius as string) || '8px',
              }}
            >
              Confirm Booking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
