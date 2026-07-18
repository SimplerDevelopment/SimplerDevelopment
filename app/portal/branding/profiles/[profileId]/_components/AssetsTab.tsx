// Logos tab: square/rectangle/icon logos, brand text, dark mode logo overrides, and legacy primary logo.

'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import { INPUT_CLASS, LABEL_CLASS, type DarkModeOverrides, type ElementTypography, type ProfileData } from '../_lib/types';

interface Props {
  profile: ProfileData;
  update: (updates: Partial<ProfileData>) => void;
  updateDark: (updates: Partial<DarkModeOverrides>) => void;
  updateTypo: (el: string, updates: Partial<ElementTypography>) => void;
}

function resolveLogoTextFont(p: ProfileData): string | undefined {
  const font = p.typography?.logoText?.font || p.headingFont;
  return font ? `"${font}", sans-serif` : undefined;
}

export function AssetsTab({ profile, update, updateDark, updateTypo }: Props) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
        <span className="material-icons text-base">image</span>
        Logos
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        Upload different logo formats for various use cases across your site.
      </p>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className={LABEL_CLASS}>Square Logo</label>
          <p className="text-xs text-muted-foreground mb-2">Used for favicons, social media, and small displays.</p>
          <MediaPicker
            value={profile.logoSquareUrl}
            onChange={(url) => update({ logoSquareUrl: url })}
            label="Square Logo"
            mimeTypeFilter="image"
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Rectangle Logo</label>
          <p className="text-xs text-muted-foreground mb-2">Used in the navigation bar and headers.</p>
          <MediaPicker
            value={profile.logoRectUrl}
            onChange={(url) => update({ logoRectUrl: url })}
            label="Rectangle Logo"
            mimeTypeFilter="image"
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Logo Icon</label>
          <p className="text-xs text-muted-foreground mb-2">Small icon that appears alongside your brand name.</p>
          <MediaPicker
            value={profile.logoIconUrl}
            onChange={(url) => update({ logoIconUrl: url })}
            label="Logo Icon"
            mimeTypeFilter="image"
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Brand Name / Text Logo</label>
          <p className="text-xs text-muted-foreground mb-2">Text displayed when no image logo is available.</p>
          <input
            type="text"
            value={profile.logoText ?? ''}
            onChange={(e) => update({ logoText: e.target.value })}
            className={INPUT_CLASS}
            placeholder="Your Brand Name"
          />
          <div className="mt-2">
            <label className="block text-[11px] text-muted-foreground mb-1">Font (falls back to heading font)</label>
            <GoogleFontPicker
              value={profile.typography?.logoText?.font ?? ''}
              onChange={(font) => updateTypo('logoText', { font })}
            />
          </div>
          {profile.logoText && (
            <div className="mt-3 p-4 rounded-lg bg-muted/30 border border-border">
              <span
                className="text-xl font-bold"
                style={{
                  fontFamily: resolveLogoTextFont(profile),
                }}
              >
                {profile.logoText}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Dark mode logos */}
      <div className="mt-6 pt-6 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">dark_mode</span>
          Dark Mode Logo Overrides
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Upload alternate logos for dark backgrounds. Falls back to light versions if not set.
        </p>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={LABEL_CLASS}>Dark Square Logo</label>
            <MediaPicker
              value={profile.darkMode?.logoSquareUrl || ''}
              onChange={(url) => updateDark({ logoSquareUrl: url })}
              label="Dark Square Logo"
              mimeTypeFilter="image"
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Dark Rectangle Logo</label>
            <MediaPicker
              value={profile.darkMode?.logoRectUrl || ''}
              onChange={(url) => updateDark({ logoRectUrl: url })}
              label="Dark Rectangle Logo"
              mimeTypeFilter="image"
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Dark Logo Icon</label>
            <MediaPicker
              value={profile.darkMode?.logoIconUrl || ''}
              onChange={(url) => updateDark({ logoIconUrl: url })}
              label="Dark Logo Icon"
              mimeTypeFilter="image"
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Dark Primary Logo (legacy)</label>
            <MediaPicker
              value={profile.darkMode?.logoUrl || ''}
              onChange={(url) => updateDark({ logoUrl: url })}
              label="Dark Primary Logo"
              mimeTypeFilter="image"
            />
          </div>
        </div>
      </div>

      {/* Legacy logo field */}
      <div className="mt-6 pt-6 border-t border-border">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={LABEL_CLASS}>Primary Logo (legacy)</label>
            <MediaPicker
              value={profile.logoUrl}
              onChange={(url) => update({ logoUrl: url })}
              label="Primary Logo"
              mimeTypeFilter="image"
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Logo Alt Text</label>
            <input
              type="text"
              value={profile.logoAlt ?? ''}
              onChange={(e) => update({ logoAlt: e.target.value })}
              className={INPUT_CLASS}
              placeholder="Company name"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
