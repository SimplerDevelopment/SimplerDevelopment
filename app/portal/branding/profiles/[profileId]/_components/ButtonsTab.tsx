// Buttons tab: variant, border radius, primary/secondary colors, button preset library and previews.

'use client';

import { INPUT_CLASS, LABEL_CLASS, type ButtonPreset, type ButtonStyle, type ProfileData } from '../_lib/types';

interface Props {
  profile: ProfileData;
  updateButtonStyle: (updates: Partial<ButtonStyle>) => void;
  setButtonPresets: (next: ButtonPreset[]) => void;
}

export function ButtonsTab({ profile, updateButtonStyle, setButtonPresets }: Props) {
  const addPreset = () => {
    const existing = profile.buttonPresets || [];
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `preset_${Math.random().toString(36).slice(2, 11)}`;
    const newPreset: ButtonPreset = {
      id,
      name: existing.length === 0 ? 'Primary' : `Preset ${existing.length + 1}`,
      backgroundColor: 'brand.primary',
      color: '#ffffff',
      borderRadius: 'brand.btnRadius',
    };
    setButtonPresets([...existing, newPreset]);
  };

  const updatePreset = (id: string, patch: Partial<ButtonPreset>) => {
    const existing = profile.buttonPresets || [];
    setButtonPresets(existing.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePreset = (id: string) => {
    const existing = profile.buttonPresets || [];
    setButtonPresets(existing.filter((p) => p.id !== id));
  };

  const movePreset = (id: string, direction: -1 | 1) => {
    const existing = [...(profile.buttonPresets || [])];
    const i = existing.findIndex((p) => p.id === id);
    const target = i + direction;
    if (i < 0 || target < 0 || target >= existing.length) return;
    const [item] = existing.splice(i, 1);
    existing.splice(target, 0, item);
    setButtonPresets(existing);
  };

  return (
    <div className="space-y-8">
      {/* Variant & Border Radius */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">smart_button</span>
          Button Style
        </h2>
        <p className="text-sm text-muted-foreground mb-4">Default styling for buttons and CTAs across blocks.</p>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <label className={LABEL_CLASS}>Default Variant</label>
            <div className="flex gap-2">
              {(['filled', 'outline'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => updateButtonStyle({ variant: v })}
                  className={`px-4 py-2 text-sm font-medium border transition-colors capitalize ${
                    (profile.buttonStyle?.variant || 'filled') === v
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-foreground'
                  }`}
                  style={{ borderRadius: profile.buttonStyle?.borderRadius || '8px' }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Button Border Radius</label>
            <input
              type="text"
              value={profile.buttonStyle?.borderRadius || ''}
              onChange={(e) => updateButtonStyle({ borderRadius: e.target.value })}
              className={`${INPUT_CLASS} max-w-[200px]`}
              placeholder="8px"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Independent from site border radius.</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { value: '0px', label: 'Sharp' },
            { value: '4px', label: 'Subtle' },
            { value: '8px', label: 'Rounded' },
            { value: '9999px', label: 'Pill' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateButtonStyle({ borderRadius: opt.value })}
              className={`p-3 border text-sm font-medium transition-colors ${
                (profile.buttonStyle?.borderRadius || '') === opt.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground'
              }`}
              style={{ borderRadius: '8px' }}
            >
              <div
                className="w-full h-8 mb-2"
                style={{
                  borderRadius: opt.value,
                  backgroundColor: profile.buttonStyle?.primaryBg || profile.primaryColor,
                }}
              />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Button Colors */}
      <div className="grid grid-cols-2 gap-6">
        {/* Primary Button */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Primary Button</h3>
          <div>
            <label className={LABEL_CLASS}>Background</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={profile.buttonStyle?.primaryBg || profile.primaryColor}
                onChange={(e) => updateButtonStyle({ primaryBg: e.target.value })}
                className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
              />
              <input
                type="text"
                value={profile.buttonStyle?.primaryBg || ''}
                onChange={(e) => updateButtonStyle({ primaryBg: e.target.value })}
                className={`${INPUT_CLASS} font-mono`}
                placeholder={profile.primaryColor}
              />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Text Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={profile.buttonStyle?.primaryText || '#ffffff'}
                onChange={(e) => updateButtonStyle({ primaryText: e.target.value })}
                className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
              />
              <input
                type="text"
                value={profile.buttonStyle?.primaryText || ''}
                onChange={(e) => updateButtonStyle({ primaryText: e.target.value })}
                className={`${INPUT_CLASS} font-mono`}
                placeholder="#ffffff"
              />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Hover Background</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={profile.buttonStyle?.primaryHoverBg || profile.primaryColor}
                onChange={(e) => updateButtonStyle({ primaryHoverBg: e.target.value })}
                className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
              />
              <input
                type="text"
                value={profile.buttonStyle?.primaryHoverBg || ''}
                onChange={(e) => updateButtonStyle({ primaryHoverBg: e.target.value })}
                className={`${INPUT_CLASS} font-mono`}
                placeholder={profile.primaryColor}
              />
            </div>
          </div>
        </div>

        {/* Secondary Button */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Secondary Button</h3>
          <div>
            <label className={LABEL_CLASS}>Background</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={profile.buttonStyle?.secondaryBg || profile.secondaryColor}
                onChange={(e) => updateButtonStyle({ secondaryBg: e.target.value })}
                className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
              />
              <input
                type="text"
                value={profile.buttonStyle?.secondaryBg || ''}
                onChange={(e) => updateButtonStyle({ secondaryBg: e.target.value })}
                className={`${INPUT_CLASS} font-mono`}
                placeholder={profile.secondaryColor}
              />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Text Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={profile.buttonStyle?.secondaryText || '#ffffff'}
                onChange={(e) => updateButtonStyle({ secondaryText: e.target.value })}
                className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
              />
              <input
                type="text"
                value={profile.buttonStyle?.secondaryText || ''}
                onChange={(e) => updateButtonStyle({ secondaryText: e.target.value })}
                className={`${INPUT_CLASS} font-mono`}
                placeholder="#ffffff"
              />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Hover Background</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={profile.buttonStyle?.secondaryHoverBg || profile.secondaryColor}
                onChange={(e) => updateButtonStyle({ secondaryHoverBg: e.target.value })}
                className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
              />
              <input
                type="text"
                value={profile.buttonStyle?.secondaryHoverBg || ''}
                onChange={(e) => updateButtonStyle({ secondaryHoverBg: e.target.value })}
                className={`${INPUT_CLASS} font-mono`}
                placeholder={profile.secondaryColor}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Button Previews */}
      <div>
        <label className={LABEL_CLASS}>Preview</label>
        <div className="p-6 rounded-lg bg-muted/30 border border-border flex flex-wrap gap-4 items-center">
          <button
            className="px-5 py-2.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor:
                (profile.buttonStyle?.variant || 'filled') === 'filled'
                  ? profile.buttonStyle?.primaryBg || profile.primaryColor
                  : 'transparent',
              color:
                (profile.buttonStyle?.variant || 'filled') === 'filled'
                  ? profile.buttonStyle?.primaryText || '#ffffff'
                  : profile.buttonStyle?.primaryBg || profile.primaryColor,
              borderRadius: profile.buttonStyle?.borderRadius || '8px',
              border:
                (profile.buttonStyle?.variant || 'filled') === 'outline'
                  ? `2px solid ${profile.buttonStyle?.primaryBg || profile.primaryColor}`
                  : '2px solid transparent',
            }}
          >
            Primary Button
          </button>
          <button
            className="px-5 py-2.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor:
                (profile.buttonStyle?.variant || 'filled') === 'filled'
                  ? profile.buttonStyle?.secondaryBg || profile.secondaryColor
                  : 'transparent',
              color:
                (profile.buttonStyle?.variant || 'filled') === 'filled'
                  ? profile.buttonStyle?.secondaryText || '#ffffff'
                  : profile.buttonStyle?.secondaryBg || profile.secondaryColor,
              borderRadius: profile.buttonStyle?.borderRadius || '8px',
              border:
                (profile.buttonStyle?.variant || 'filled') === 'outline'
                  ? `2px solid ${profile.buttonStyle?.secondaryBg || profile.secondaryColor}`
                  : '2px solid transparent',
            }}
          >
            Secondary Button
          </button>
          <span className="text-xs text-muted-foreground mx-2">|</span>
          <span className="text-[11px] text-muted-foreground">
            {(profile.buttonStyle?.variant || 'filled') === 'filled' ? 'Outline' : 'Filled'} variant:
          </span>
          <button
            className="px-5 py-2.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor:
                (profile.buttonStyle?.variant || 'filled') !== 'filled'
                  ? profile.buttonStyle?.primaryBg || profile.primaryColor
                  : 'transparent',
              color:
                (profile.buttonStyle?.variant || 'filled') !== 'filled'
                  ? profile.buttonStyle?.primaryText || '#ffffff'
                  : profile.buttonStyle?.primaryBg || profile.primaryColor,
              borderRadius: profile.buttonStyle?.borderRadius || '8px',
              border:
                (profile.buttonStyle?.variant || 'filled') === 'filled'
                  ? `2px solid ${profile.buttonStyle?.primaryBg || profile.primaryColor}`
                  : '2px solid transparent',
            }}
          >
            Primary Button
          </button>
        </div>
      </div>

      {/* Button Presets */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base">collections_bookmark</span>
            Button Presets
          </h2>
          <button
            onClick={addPreset}
            className="text-xs font-medium text-primary hover:text-primary/80 inline-flex items-center gap-1"
          >
            <span className="material-icons text-sm">add_circle_outline</span>
            Add preset
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Named button styles that editors can select from the CMS. Values accept brand sentinels (
          {`"brand.primary"`}) so presets track palette changes.
        </p>

        {(profile.buttonPresets ?? []).length === 0 && (
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
            <p className="text-sm text-muted-foreground">No presets yet. Click {`"Add preset"`} to define one.</p>
          </div>
        )}

        <div className="space-y-4">
          {(profile.buttonPresets ?? []).map((preset, idx, arr) => (
            <div key={preset.id} className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
                <input
                  type="text"
                  value={preset.name}
                  onChange={(e) => updatePreset(preset.id, { name: e.target.value })}
                  className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none focus:ring-0 border-none"
                  placeholder="Preset name"
                />
                <button
                  onClick={() => movePreset(preset.id, -1)}
                  disabled={idx === 0}
                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  <span className="material-icons text-base">arrow_upward</span>
                </button>
                <button
                  onClick={() => movePreset(preset.id, 1)}
                  disabled={idx === arr.length - 1}
                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  <span className="material-icons text-base">arrow_downward</span>
                </button>
                <button
                  onClick={() => removePreset(preset.id)}
                  className="p-1 text-muted-foreground hover:text-destructive"
                  title="Delete preset"
                >
                  <span className="material-icons text-base">delete_outline</span>
                </button>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <PresetField
                    label="Background"
                    value={preset.backgroundColor}
                    onChange={(v) => updatePreset(preset.id, { backgroundColor: v })}
                    placeholder="brand.primary or #hex"
                  />
                  <PresetField
                    label="Text color"
                    value={preset.color}
                    onChange={(v) => updatePreset(preset.id, { color: v })}
                    placeholder="#ffffff"
                  />
                  <PresetField
                    label="Hover background"
                    value={preset.hoverBackgroundColor}
                    onChange={(v) => updatePreset(preset.id, { hoverBackgroundColor: v })}
                    placeholder="optional"
                  />
                  <PresetField
                    label="Border radius"
                    value={preset.borderRadius}
                    onChange={(v) => updatePreset(preset.id, { borderRadius: v })}
                    placeholder="8px or brand.btnRadius"
                  />
                </div>
                <div className="space-y-3">
                  <PresetField
                    label="Border color"
                    value={preset.borderColor}
                    onChange={(v) => updatePreset(preset.id, { borderColor: v })}
                    placeholder="optional"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <PresetField
                      label="Border width"
                      value={preset.borderWidth}
                      onChange={(v) => updatePreset(preset.id, { borderWidth: v })}
                      placeholder="1px"
                    />
                    <div>
                      <label className={LABEL_CLASS}>Border style</label>
                      <select
                        value={preset.borderStyle ?? ''}
                        onChange={(e) =>
                          updatePreset(preset.id, {
                            borderStyle: (e.target.value || undefined) as ButtonPreset['borderStyle'],
                          })
                        }
                        className={INPUT_CLASS}
                      >
                        <option value="">—</option>
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="dotted">Dotted</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <PresetField
                      label="Font weight"
                      value={preset.fontWeight}
                      onChange={(v) => updatePreset(preset.id, { fontWeight: v })}
                      placeholder="500"
                    />
                    <div>
                      <label className={LABEL_CLASS}>Text transform</label>
                      <select
                        value={preset.textTransform ?? ''}
                        onChange={(e) =>
                          updatePreset(preset.id, {
                            textTransform: (e.target.value || undefined) as ButtonPreset['textTransform'],
                          })
                        }
                        className={INPUT_CLASS}
                      >
                        <option value="">—</option>
                        <option value="none">None</option>
                        <option value="uppercase">UPPERCASE</option>
                        <option value="lowercase">lowercase</option>
                        <option value="capitalize">Capitalize</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <PresetField
                      label="Padding X"
                      value={preset.paddingX}
                      onChange={(v) => updatePreset(preset.id, { paddingX: v })}
                      placeholder="1rem"
                    />
                    <PresetField
                      label="Padding Y"
                      value={preset.paddingY}
                      onChange={(v) => updatePreset(preset.id, { paddingY: v })}
                      placeholder="0.5rem"
                    />
                  </div>
                </div>
              </div>
              <div className="px-4 py-4 border-t border-border bg-muted/20 flex items-center justify-center">
                <PresetPreview
                  preset={preset}
                  brandingPrimary={profile.primaryColor}
                  brandingBtnRadius={profile.buttonStyle?.borderRadius || profile.borderRadius}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Button preset helpers  ───────────────────────── */

const PRESET_INPUT_CLASS =
  'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none';
const PRESET_LABEL_CLASS = 'block text-xs font-medium text-muted-foreground mb-1.5';

function PresetField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={PRESET_LABEL_CLASS}>{label}</label>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={`${PRESET_INPUT_CLASS} font-mono text-xs`}
        placeholder={placeholder}
      />
    </div>
  );
}

/**
 * Visual preview of a preset — renders a concrete button using the preset's
 * values with brand sentinels resolved to the profile's live colors so the
 * editor shows what the block actually looks like.
 */
function PresetPreview({
  preset,
  brandingPrimary,
  brandingBtnRadius,
}: {
  preset: ButtonPreset;
  brandingPrimary: string;
  brandingBtnRadius?: string;
}) {
  const resolve = (v: string | undefined): string | undefined => {
    if (!v) return undefined;
    if (v === 'brand.primary') return brandingPrimary;
    if (v === 'brand.btnRadius') return brandingBtnRadius;
    if (v.startsWith('brand.')) return undefined;
    return v;
  };

  const style: React.CSSProperties = {
    backgroundColor: resolve(preset.backgroundColor),
    color: resolve(preset.color),
    borderColor: resolve(preset.borderColor),
    borderWidth: preset.borderWidth,
    borderStyle: preset.borderStyle,
    borderRadius: resolve(preset.borderRadius),
    fontWeight: preset.fontWeight,
    textTransform: preset.textTransform,
    letterSpacing: preset.letterSpacing,
    paddingLeft: preset.paddingX || '1rem',
    paddingRight: preset.paddingX || '1rem',
    paddingTop: preset.paddingY || '0.5rem',
    paddingBottom: preset.paddingY || '0.5rem',
    display: 'inline-block',
    cursor: 'default',
  };

  return <span style={style}>{preset.name || 'Button'}</span>;
}
