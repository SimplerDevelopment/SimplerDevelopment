'use client';

// Settings panel for the `NavigationBlock` block type, extracted from the
// SectionsPanel monolith (same pattern as SiteFooterSettings.tsx). The nav
// tree itself is NOT authored here — it's fetched live from site_navigation
// at render time (see NavigationBlockRender) — this panel only controls
// presentation.
import type { NavigationBlock } from '@/types/blocks';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';

export function NavigationBlockSettings({ block, onChange }: { block: NavigationBlock; onChange: (updates: Partial<NavigationBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Menu items come from this site&apos;s Navigation manager. This panel only controls how the bar looks.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Logo URL</label>
          <input
            type="url"
            value={block.logoUrl || ''}
            onChange={(e) => onChange({ logoUrl: e.target.value || undefined })}
            className={inputClass}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Logo Alt</label>
          <input
            type="text"
            value={block.logoAlt || ''}
            onChange={(e) => onChange({ logoAlt: e.target.value || undefined })}
            className={inputClass}
            placeholder="Site name"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Logo Height</label>
          <input
            type="text"
            value={block.logoHeight || ''}
            onChange={(e) => onChange({ logoHeight: e.target.value || undefined })}
            className={inputClass}
            placeholder="32px"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Container Max Width</label>
          <input
            type="text"
            value={block.containerMaxWidth || ''}
            onChange={(e) => onChange({ containerMaxWidth: e.target.value || undefined })}
            className={inputClass}
            placeholder="1280px"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Font Family</label>
        <input
          type="text"
          value={block.fontFamily || ''}
          onChange={(e) => onChange({ fontFamily: e.target.value || undefined })}
          className={inputClass}
          placeholder="Inherits the page body font"
        />
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={block.sticky ?? true}
          onChange={(e) => onChange({ sticky: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary"
        />
        Sticky (pins to the top of the viewport on scroll)
      </label>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Background</label>
          <TokenColorPicker value={block.backgroundColor || ''} onChange={(color) => onChange({ backgroundColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Link</label>
          <TokenColorPicker value={block.linkColor || ''} onChange={(color) => onChange({ linkColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Link Hover</label>
          <TokenColorPicker value={block.linkHoverColor || ''} onChange={(color) => onChange({ linkHoverColor: color || undefined })} />
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">
          CTA Button
          <span className="block text-xs font-normal text-muted-foreground mt-0.5">Renders for any top-level menu item marked as a button in the Navigation manager.</span>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Background</label>
            <TokenColorPicker value={block.ctaBackgroundColor || ''} onChange={(color) => onChange({ ctaBackgroundColor: color || undefined })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Text</label>
            <TokenColorPicker value={block.ctaTextColor || ''} onChange={(color) => onChange({ ctaTextColor: color || undefined })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Hover Background</label>
            <TokenColorPicker value={block.ctaHoverBackgroundColor || ''} onChange={(color) => onChange({ ctaHoverBackgroundColor: color || undefined })} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Border Radius</label>
          <input
            type="text"
            value={block.ctaBorderRadius || ''}
            onChange={(e) => onChange({ ctaBorderRadius: e.target.value || undefined })}
            className={inputClass}
            placeholder="9999px"
          />
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">Dropdown Panel</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Background</label>
            <TokenColorPicker value={block.dropdownBackgroundColor || ''} onChange={(color) => onChange({ dropdownBackgroundColor: color || undefined })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Link</label>
            <TokenColorPicker value={block.dropdownLinkColor || ''} onChange={(color) => onChange({ dropdownLinkColor: color || undefined })} />
          </div>
        </div>
      </div>
    </div>
  );
}
