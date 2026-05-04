/** Per-slide settings panel — background, text color, label, custom CSS. Used both as the noSelectionPanel for block slides and on survey slide previews. */
'use client';

import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import MediaPicker from '@/components/admin/MediaPicker';

export interface SlideSettingsPanelProps {
  slide: PitchDeckSlideV2;
  theme: PitchDeckTheme;
  onChange: (updates: Partial<PitchDeckSlideV2>) => void;
}

export function SlideSettingsPanel({ slide, theme, onChange }: SlideSettingsPanelProps) {
  const updatePageSettings = (patch: Partial<NonNullable<PitchDeckSlideV2['pageSettings']>>) => {
    onChange({ pageSettings: { ...slide.pageSettings, ...patch } });
  };
  const removePageSettingKey = (key: keyof NonNullable<PitchDeckSlideV2['pageSettings']>) => {
    const ps = { ...slide.pageSettings };
    delete ps[key];
    onChange({ pageSettings: ps });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <span className="material-icons text-base text-muted-foreground">tune</span>
        <span className="text-sm font-semibold text-foreground">Slide Settings</span>
      </div>

      {/* Background Color */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Background Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={slide.pageSettings?.backgroundColor || theme.backgroundColor}
            onChange={(e) => updatePageSettings({ backgroundColor: e.target.value })}
            className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
          />
          <input
            type="text"
            value={slide.pageSettings?.backgroundColor || ''}
            onChange={(e) => updatePageSettings({ backgroundColor: e.target.value })}
            placeholder={theme.backgroundColor}
            className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {slide.pageSettings?.backgroundColor && (
            <button
              onClick={() => removePageSettingKey('backgroundColor')}
              className="text-xs text-muted-foreground hover:text-foreground"
              title="Reset to theme default"
            >
              <span className="material-icons text-sm">restart_alt</span>
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Overrides the deck theme for this slide</p>
      </div>

      {/* Background Image */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">Background Image</span>
        <MediaPicker
          value={slide.pageSettings?.backgroundImage || ''}
          onChange={(v) => updatePageSettings({ backgroundImage: v })}
          mimeTypeFilter="image"
          label=""
          apiEndpoint="/api/media"
        />
      </div>

      {/* Background Image Controls (when image is set) */}
      {slide.pageSettings?.backgroundImage && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Size</label>
              <select
                value={['cover', 'contain', 'auto'].includes(slide.pageSettings?.backgroundSize || 'cover') ? (slide.pageSettings?.backgroundSize || 'cover') : 'custom'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'custom') {
                    updatePageSettings({ backgroundSize: '200px' as 'cover' });
                    return;
                  }
                  updatePageSettings({ backgroundSize: val as 'cover' | 'contain' | 'auto' });
                }}
                className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="auto">Auto</option>
                <option value="custom">Custom</option>
              </select>
              {!['cover', 'contain', 'auto'].includes(slide.pageSettings?.backgroundSize || 'cover') && (
                <input
                  type="text"
                  value={slide.pageSettings?.backgroundSize || ''}
                  onChange={(e) => updatePageSettings({ backgroundSize: e.target.value as 'cover' })}
                  placeholder="e.g. 200px, 50%, 100px auto"
                  className="mt-1 w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Repeat</label>
              <select
                value={slide.pageSettings?.backgroundRepeat || 'no-repeat'}
                onChange={(e) => updatePageSettings({ backgroundRepeat: e.target.value as 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y' })}
                className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="no-repeat">No Repeat</option>
                <option value="repeat">Repeat</option>
                <option value="repeat-x">Repeat X</option>
                <option value="repeat-y">Repeat Y</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Position</label>
            <select
              value={slide.pageSettings?.backgroundPosition || 'center'}
              onChange={(e) => updatePageSettings({ backgroundPosition: e.target.value })}
              className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="center">Center</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="top left">Top Left</option>
              <option value="top right">Top Right</option>
              <option value="bottom left">Bottom Left</option>
              <option value="bottom right">Bottom Right</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Opacity: {Math.round((slide.pageSettings?.backgroundOpacity ?? 1) * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={slide.pageSettings?.backgroundOpacity ?? 1}
              onChange={(e) => updatePageSettings({ backgroundOpacity: parseFloat(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>
        </>
      )}

      {/* Background Video */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">Background Video</span>
        <MediaPicker
          value={slide.pageSettings?.backgroundVideo || ''}
          onChange={(v) => updatePageSettings({ backgroundVideo: v })}
          mimeTypeFilter="video"
          label=""
          apiEndpoint="/api/media"
        />
      </div>

      {/* Text Color */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Text Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={slide.pageSettings?.color || theme.textColor}
            onChange={(e) => updatePageSettings({ color: e.target.value })}
            className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
          />
          <input
            type="text"
            value={slide.pageSettings?.color || ''}
            onChange={(e) => updatePageSettings({ color: e.target.value })}
            placeholder={theme.textColor}
            className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {slide.pageSettings?.color && (
            <button
              onClick={() => removePageSettingKey('color')}
              className="text-xs text-muted-foreground hover:text-foreground"
              title="Reset to theme default"
            >
              <span className="material-icons text-sm">restart_alt</span>
            </button>
          )}
        </div>
      </div>

      {/* Slide label */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Slide Label</label>
        <input
          type="text"
          value={slide.label || ''}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="e.g. Cover, About, Pricing..."
        />
      </div>

      {/* Per-slide Custom CSS */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Custom CSS <span className="opacity-60">(active only while this slide is in view)</span>
        </label>
        <textarea
          value={slide.customCss || ''}
          onChange={(e) => onChange({ customCss: e.target.value })}
          rows={10}
          spellCheck={false}
          className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder={`/* Target rendered blocks via [data-block-id="..."] */\n[data-block-id="cover-rule"] hr { background: var(--rust); height: 3px; }`}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Injected unscoped while this slide is active. Block wrappers expose <code>data-block-id</code> and <code>data-block-type</code> for targeting. The slide stage carries <code>data-slide-id</code>.
        </p>
      </div>
    </div>
  );
}
