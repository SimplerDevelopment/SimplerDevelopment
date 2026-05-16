// Style tab: global border radius, favicon, and Open Graph / social share image.

'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import { INPUT_CLASS, LABEL_CLASS, type ProfileData } from '../_lib/types';

interface Props {
  profile: ProfileData;
  update: (updates: Partial<ProfileData>) => void;
}

export function StyleTab({ profile, update }: Props) {
  return (
    <div className="space-y-8">
      {/* Border Radius */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">rounded_corner</span>
          Border Radius
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Global shape language applied to cards, inputs, and UI elements. Button radius is configured separately.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { value: '0px', label: 'Sharp' },
            { value: '4px', label: 'Subtle' },
            { value: '8px', label: 'Rounded' },
            { value: '9999px', label: 'Pill' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => update({ borderRadius: opt.value })}
              className={`p-3 border text-sm font-medium transition-colors ${
                profile.borderRadius === opt.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground'
              }`}
              style={{ borderRadius: opt.value }}
            >
              <div className="w-full h-8 bg-primary/20 mb-2" style={{ borderRadius: opt.value }} />
              {opt.label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <label className={LABEL_CLASS}>Custom Value</label>
          <input
            type="text"
            value={profile.borderRadius ?? ''}
            onChange={(e) => update({ borderRadius: e.target.value })}
            className={`${INPUT_CLASS} max-w-[200px]`}
            placeholder="8px"
          />
        </div>
      </div>

      {/* Favicon */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">tab</span>
          Favicon
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          The small icon shown in browser tabs. Recommended: 32x32 or 48x48 PNG.
        </p>
        <div className="max-w-sm">
          <MediaPicker
            value={profile.faviconUrl}
            onChange={(url) => update({ faviconUrl: url })}
            label="Favicon"
            mimeTypeFilter="image"
          />
        </div>
      </div>

      {/* OG / Social Image */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">share</span>
          Social / OG Image
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Default image shown when pages are shared on social media. Recommended: 1200x630.
        </p>
        <div className="max-w-sm">
          <MediaPicker
            value={profile.ogImageUrl}
            onChange={(url) => update({ ogImageUrl: url })}
            label="OG Image"
            mimeTypeFilter="image"
          />
        </div>
      </div>
    </div>
  );
}
