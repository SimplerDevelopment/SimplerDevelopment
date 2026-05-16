// Colors tab: brand color palette, dark mode overrides, link colors, contrast matrix, palette-from-image.

'use client';

import { ContrastMatrix } from '@/components/portal/ContrastMatrix';
import { PaletteFromImage } from '@/components/portal/branding/PaletteFromImage';
import { INPUT_CLASS, LABEL_CLASS, type DarkModeOverrides, type ProfileData } from '../_lib/types';

interface Props {
  profile: ProfileData;
  update: (updates: Partial<ProfileData>) => void;
  updateDark: (updates: Partial<DarkModeOverrides>) => void;
}

export function ColorsTab({ profile, update, updateDark }: Props) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
        <span className="material-icons text-base">palette</span>
        Colors
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        Define your brand color palette. These are used as defaults in blocks and navigation.
      </p>

      <div className="mb-5">
        <PaletteFromImage onApply={(roles) => update(roles)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(
          [
            { key: 'primaryColor', label: 'Primary', desc: 'Buttons, links, accents' },
            { key: 'secondaryColor', label: 'Secondary', desc: 'Supporting elements' },
            { key: 'accentColor', label: 'Accent', desc: 'Highlights, badges' },
            { key: 'backgroundColor', label: 'Background', desc: 'Page background' },
            { key: 'textColor', label: 'Text', desc: 'Body text color' },
            { key: 'navBackground', label: 'Nav Background', desc: 'Navigation bar' },
            { key: 'navTextColor', label: 'Nav Text', desc: 'Navigation text' },
          ] as const
        ).map(({ key, label, desc }) => (
          <div key={key}>
            <label className={LABEL_CLASS}>{label}</label>
            <p className="text-[11px] text-muted-foreground mb-2">{desc}</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={profile[key]}
                onChange={(e) => update({ [key]: e.target.value })}
                className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
              />
              <input
                type="text"
                value={profile[key]}
                onChange={(e) => update({ [key]: e.target.value })}
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Dark mode colors */}
      <div className="mt-6 pt-6 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">dark_mode</span>
          Dark Mode Color Overrides
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Colors used when the site is in dark mode. Falls back to light values if not set.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(
            [
              { key: 'primaryColor' as const, label: 'Primary' },
              { key: 'secondaryColor' as const, label: 'Secondary' },
              { key: 'accentColor' as const, label: 'Accent' },
              { key: 'backgroundColor' as const, label: 'Background' },
              { key: 'textColor' as const, label: 'Text' },
              { key: 'navBackground' as const, label: 'Nav Background' },
              { key: 'navTextColor' as const, label: 'Nav Text' },
            ]
          ).map(({ key, label }) => (
            <div key={key}>
              <label className={LABEL_CLASS}>{label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile.darkMode?.[key] || profile[key]}
                  onChange={(e) => updateDark({ [key]: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={profile.darkMode?.[key] || ''}
                  onChange={(e) => updateDark({ [key]: e.target.value })}
                  className={`${INPUT_CLASS} font-mono`}
                  placeholder={profile[key]}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Color previews */}
      <div className="mt-6 pt-6 border-t border-border">
        <label className={LABEL_CLASS}>Preview</label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[11px] text-muted-foreground mb-1 block">Light Mode</span>
            <div className="rounded-lg overflow-hidden border border-border">
              <div
                className="h-10 flex items-center px-4 gap-4"
                style={{ backgroundColor: profile.navBackground, color: profile.navTextColor }}
              >
                <span className="text-sm font-semibold">{profile.logoText || 'Brand'}</span>
                <div className="flex-1" />
                <span className="text-xs">Link</span>
                <span
                  className="text-xs px-2 py-0.5 rounded text-white"
                  style={{ backgroundColor: profile.primaryColor }}
                >
                  Button
                </span>
              </div>
              <div
                className="p-4"
                style={{ backgroundColor: profile.backgroundColor, color: profile.textColor }}
              >
                <h3 className="text-base font-bold mb-1">Heading</h3>
                <p className="text-xs mb-2">Body text preview with brand colors.</p>
                <div className="flex gap-1.5">
                  <span
                    className="px-2 py-0.5 rounded text-xs text-white"
                    style={{ backgroundColor: profile.primaryColor }}
                  >
                    Primary
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-xs text-white"
                    style={{ backgroundColor: profile.secondaryColor }}
                  >
                    Secondary
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-xs text-white"
                    style={{ backgroundColor: profile.accentColor }}
                  >
                    Accent
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground mb-1 block">Dark Mode</span>
            <div className="rounded-lg overflow-hidden border border-border">
              <div
                className="h-10 flex items-center px-4 gap-4"
                style={{
                  backgroundColor: profile.darkMode?.navBackground || profile.navBackground,
                  color: profile.darkMode?.textColor || profile.navTextColor,
                }}
              >
                <span className="text-sm font-semibold">{profile.logoText || 'Brand'}</span>
                <div className="flex-1" />
                <span className="text-xs">Link</span>
                <span
                  className="text-xs px-2 py-0.5 rounded text-white"
                  style={{ backgroundColor: profile.darkMode?.primaryColor || profile.primaryColor }}
                >
                  Button
                </span>
              </div>
              <div
                className="p-4"
                style={{
                  backgroundColor: profile.darkMode?.backgroundColor || '#111827',
                  color: profile.darkMode?.textColor || '#f3f4f6',
                }}
              >
                <h3 className="text-base font-bold mb-1">Heading</h3>
                <p className="text-xs mb-2">Body text preview with dark mode colors.</p>
                <div className="flex gap-1.5">
                  <span
                    className="px-2 py-0.5 rounded text-xs text-white"
                    style={{ backgroundColor: profile.darkMode?.primaryColor || profile.primaryColor }}
                  >
                    Primary
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-xs text-white"
                    style={{
                      backgroundColor: profile.darkMode?.secondaryColor || profile.secondaryColor,
                    }}
                  >
                    Secondary
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-xs text-white"
                    style={{ backgroundColor: profile.darkMode?.accentColor || profile.accentColor }}
                  >
                    Accent
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Link Colors */}
      <div className="mt-6 pt-6 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">link</span>
          Link Colors
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Colors for inline text links. Separate from primary color for accessibility.
        </p>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={LABEL_CLASS}>Link Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={profile.linkColor || profile.primaryColor}
                onChange={(e) => update({ linkColor: e.target.value })}
                className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
              />
              <input
                type="text"
                value={profile.linkColor ?? ''}
                onChange={(e) => update({ linkColor: e.target.value })}
                className={`${INPUT_CLASS} font-mono`}
                placeholder={profile.primaryColor}
              />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Link Hover Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={profile.linkHoverColor || profile.primaryColor}
                onChange={(e) => update({ linkHoverColor: e.target.value })}
                className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
              />
              <input
                type="text"
                value={profile.linkHoverColor ?? ''}
                onChange={(e) => update({ linkHoverColor: e.target.value })}
                className={`${INPUT_CLASS} font-mono`}
                placeholder={profile.primaryColor}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border text-sm">
          <span
            style={{
              color: profile.linkColor || profile.primaryColor,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            This is what a link looks like
          </span>{' '}
          within body text.
        </div>
        <div className="mt-6">
          <ContrastMatrix branding={profile} />
        </div>
      </div>
    </div>
  );
}
