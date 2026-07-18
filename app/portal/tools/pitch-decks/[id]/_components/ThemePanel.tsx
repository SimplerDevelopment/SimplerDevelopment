/** Deck-wide theme settings — colors, fonts, slide-number toggle, branding profile, deck-global CSS. */
'use client';

import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import BrandingProfileSelector from '@/components/portal/BrandingProfileSelector';
import type { PitchDeckTheme } from '@/lib/db/schema';
import { isColorDark } from '../_lib/helpers';
import { loadBrandingProfile, patchDeck } from '../_lib/api';

export interface ThemePanelProps {
  theme: PitchDeckTheme;
  brandingProfileId: number | null;
  deckId: number;
  onClose: () => void;
  onUpdateTheme: (updates: Partial<PitchDeckTheme>) => void;
  onUpdateBrandingProfileId: (id: number | null) => void;
}

export function ThemePanel({ theme, brandingProfileId, deckId, onClose, onUpdateTheme, onUpdateBrandingProfileId }: ThemePanelProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Theme Settings</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <span className="material-icons text-base">close</span>
        </button>
      </div>
      <div className="pb-2 border-b border-border">
        <BrandingProfileSelector
          value={brandingProfileId ?? null}
          onChange={async (profileId) => {
            if (profileId) {
              const json = await loadBrandingProfile(profileId);
              if (json.success && json.data) {
                const p = json.data;
                onUpdateTheme({
                  primaryColor: p.primaryColor || theme.primaryColor,
                  accentColor: p.accentColor || theme.accentColor,
                  backgroundColor: p.backgroundColor && isColorDark(p.backgroundColor) ? p.backgroundColor : theme.backgroundColor,
                  textColor: p.backgroundColor && isColorDark(p.backgroundColor) ? (p.textColor || '#f8fafc') : theme.textColor,
                  headingFont: p.headingFont || theme.headingFont,
                  bodyFont: p.bodyFont || theme.bodyFont,
                });
              }
            }
            onUpdateBrandingProfileId(profileId);
            await patchDeck(String(deckId), { brandingProfileId: profileId });
          }}
          allowNone
          noneLabel="Custom Theme"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['primaryColor', 'accentColor', 'backgroundColor', 'textColor'] as const).map((key) => (
          <div key={key}>
            <label className="block text-xs text-muted-foreground mb-1 capitalize">
              {key.replace('Color', ' Color')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={theme[key]}
                onChange={(e) => onUpdateTheme({ [key]: e.target.value })}
                className="w-8 h-8 rounded border border-border cursor-pointer"
              />
              <input
                type="text"
                value={theme[key]}
                onChange={(e) => onUpdateTheme({ [key]: e.target.value })}
                className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono"
              />
            </div>
          </div>
        ))}
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-2">Survey Slide Buttons <span className="opacity-60">(optional — leave blank to use theme defaults)</span></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { key: 'nextButtonColor' as const, label: 'Next Button BG', fallback: theme.accentColor },
            { key: 'nextButtonTextColor' as const, label: 'Next Button Text', fallback: theme.backgroundColor },
            { key: 'backButtonColor' as const, label: 'Back Button BG', fallback: theme.textColor },
            { key: 'backButtonTextColor' as const, label: 'Back Button Text', fallback: theme.textColor },
          ]).map(({ key, label, fallback }) => {
            const value = theme[key];
            return (
              <div key={key}>
                <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={value || fallback}
                    onChange={(e) => onUpdateTheme({ [key]: e.target.value })}
                    className="w-8 h-8 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={value || ''}
                    placeholder={fallback}
                    onChange={(e) => onUpdateTheme({ [key]: e.target.value || undefined })}
                    className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={theme.showSlideNumber !== false}
            onChange={(e) => onUpdateTheme({ showSlideNumber: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          Show slide number overlay
          <span className="text-xs text-muted-foreground ml-1">
            (auto-hidden on full-bleed HTML slides)
          </span>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Heading Font</label>
          <GoogleFontPicker
            value={theme.headingFont}
            onChange={(font) => onUpdateTheme({ headingFont: font })}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Body Font</label>
          <GoogleFontPicker
            value={theme.bodyFont}
            onChange={(font) => onUpdateTheme({ bodyFont: font })}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Deck CSS <span className="opacity-60">(injected once, applies to all slides)</span>
        </label>
        <textarea
          value={theme.customCss || ''}
          onChange={(e) => onUpdateTheme({ customCss: e.target.value })}
          rows={8}
          spellCheck={false}
          className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder={`/* Define CSS vars, resets, and deck-wide patterns */\n.deck-root { --brand: #005652; }\n.deck-root .slide-stage p { margin: 0; }`}
        />
      </div>
    </div>
  );
}
