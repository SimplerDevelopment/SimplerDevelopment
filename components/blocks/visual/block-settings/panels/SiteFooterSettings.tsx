'use client';

// Settings panel for the `SiteFooterBlockSettings` block type, extracted from the BlockSettings monolith.
import type { SiteFooterBlock } from '@/types/blocks';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';

export function SiteFooterBlockSettings({ block, onChange }: { block: SiteFooterBlock; onChange: (updates: Partial<SiteFooterBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
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
            placeholder="Brand name"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Tagline</label>
        <input
          type="text"
          value={block.tagline || ''}
          onChange={(e) => onChange({ tagline: e.target.value || undefined })}
          className={inputClass}
          placeholder="Short tagline shown under the logo"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Background</label>
          <TokenColorPicker value={block.backgroundColor || ''} onChange={(color) => onChange({ backgroundColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Text</label>
          <TokenColorPicker value={block.textColor || ''} onChange={(color) => onChange({ textColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Accent</label>
          <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Contact Info</label>
        <input
          type="text"
          value={block.contactInfo?.address || ''}
          onChange={(e) => onChange({ contactInfo: { ...(block.contactInfo || {}), address: e.target.value || undefined } })}
          className={inputClass}
          placeholder="Address"
        />
        <input
          type="text"
          value={block.contactInfo?.phone || ''}
          onChange={(e) => onChange({ contactInfo: { ...(block.contactInfo || {}), phone: e.target.value || undefined } })}
          className={inputClass}
          placeholder="Phone"
        />
        <input
          type="email"
          value={block.contactInfo?.email || ''}
          onChange={(e) => onChange({ contactInfo: { ...(block.contactInfo || {}), email: e.target.value || undefined } })}
          className={inputClass}
          placeholder="Email"
        />
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Link Groups</label>
        {(block.linkGroups || []).map((group, gi) => (
          <div key={gi} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={group.label}
              onChange={(e) => {
                const next = [...(block.linkGroups || [])];
                next[gi] = { ...next[gi], label: e.target.value };
                onChange({ linkGroups: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Group label (e.g. PRODUCT)"
            />
            {(group.links || []).map((link, li) => (
              <div key={li} className="flex gap-1">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => {
                    const groups = [...(block.linkGroups || [])];
                    const links = [...(groups[gi].links || [])];
                    links[li] = { ...links[li], label: e.target.value };
                    groups[gi] = { ...groups[gi], links };
                    onChange({ linkGroups: groups });
                  }}
                  className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                  placeholder="Link label"
                />
                <input
                  type="text"
                  value={link.href}
                  onChange={(e) => {
                    const groups = [...(block.linkGroups || [])];
                    const links = [...(groups[gi].links || [])];
                    links[li] = { ...links[li], href: e.target.value };
                    groups[gi] = { ...groups[gi], links };
                    onChange({ linkGroups: groups });
                  }}
                  className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                  placeholder="/path"
                />
                <button
                  type="button"
                  onClick={() => {
                    const groups = [...(block.linkGroups || [])];
                    groups[gi] = { ...groups[gi], links: (groups[gi].links || []).filter((_, j) => j !== li) };
                    onChange({ linkGroups: groups });
                  }}
                  className="px-2 text-xs text-destructive hover:underline"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  const groups = [...(block.linkGroups || [])];
                  groups[gi] = { ...groups[gi], links: [...(groups[gi].links || []), { label: '', href: '' }] };
                  onChange({ linkGroups: groups });
                }}
                className="flex-1 text-xs text-muted-foreground hover:underline"
              >
                + Link
              </button>
              <button
                type="button"
                onClick={() => onChange({ linkGroups: (block.linkGroups || []).filter((_, j) => j !== gi) })}
                className="text-xs text-destructive hover:underline"
              >
                Remove group
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ linkGroups: [...(block.linkGroups || []), { label: '', links: [] }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Group
        </button>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Social Links</label>
        {(block.socialLinks || []).map((link, i) => (
          <div key={i} className="flex gap-1">
            <input
              type="text"
              value={link.platform}
              onChange={(e) => {
                const next = [...(block.socialLinks || [])];
                next[i] = { ...next[i], platform: e.target.value };
                onChange({ socialLinks: next });
              }}
              className="w-24 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="platform"
            />
            <input
              type="url"
              value={link.url}
              onChange={(e) => {
                const next = [...(block.socialLinks || [])];
                next[i] = { ...next[i], url: e.target.value };
                onChange({ socialLinks: next });
              }}
              className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="https://"
            />
            <button
              type="button"
              onClick={() => onChange({ socialLinks: (block.socialLinks || []).filter((_, j) => j !== i) })}
              className="px-2 text-xs text-destructive hover:underline"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ socialLinks: [...(block.socialLinks || []), { platform: '', url: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Social Link
        </button>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Copyright</label>
          <input
            type="text"
            value={block.copyright || ''}
            onChange={(e) => onChange({ copyright: e.target.value || undefined })}
            className={inputClass}
            placeholder="© 2026 Your Company"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Disclaimer</label>
          <textarea
            value={block.disclaimer || ''}
            onChange={(e) => onChange({ disclaimer: e.target.value || undefined })}
            className={inputClass}
            placeholder="Optional fine-print disclaimer"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}
