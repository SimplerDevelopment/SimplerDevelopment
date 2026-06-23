'use client';

import { ButtonBlock } from '@/types/blocks';

interface ButtonBlockEditProps {
  block: ButtonBlock;
  onChange: (block: ButtonBlock) => void;
}

export function ButtonBlockEdit({ block, onChange }: ButtonBlockEditProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Button Text
        </label>
        <input
          type="text"
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          placeholder="Click me"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          URL
        </label>
        <input
          type="url"
          value={block.url}
          onChange={(e) => onChange({ ...block, url: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          placeholder="https://example.com"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Variant
          </label>
          <select
            value={block.variant || 'primary'}
            onChange={(e) => onChange({ ...block, variant: e.target.value as ButtonBlock['variant'] })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          >
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="outline">Outline</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Size
          </label>
          <select
            value={block.size || 'md'}
            onChange={(e) => onChange({ ...block, size: e.target.value as ButtonBlock['size'] })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          >
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Alignment
          </label>
          <select
            value={block.alignment || 'left'}
            onChange={(e) => onChange({ ...block, alignment: e.target.value as ButtonBlock['alignment'] })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Icon
          </label>
          <input
            type="text"
            value={block.icon || ''}
            onChange={(e) => onChange({ ...block, icon: e.target.value || undefined })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
            placeholder="arrow_forward"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Icon Position
          </label>
          <select
            value={block.iconPosition || 'left'}
            onChange={(e) => onChange({ ...block, iconPosition: e.target.value as ButtonBlock['iconPosition'] })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Hover Effect
        </label>
        <select
          value={block.hoverEffect || 'none'}
          onChange={(e) => onChange({ ...block, hoverEffect: e.target.value as ButtonBlock['hoverEffect'] })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
        >
          <option value="none">None</option>
          <option value="lift">Lift (raise + shadow)</option>
          <option value="glow">Glow (color aura)</option>
          <option value="fill">Fill (overlay)</option>
          <option value="slide">Slide (shine sweep)</option>
          <option value="pulse">Pulse (bounce)</option>
        </select>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id={`open-new-tab-${block.id}`}
          checked={block.openInNewTab || false}
          onChange={(e) => onChange({ ...block, openInNewTab: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor={`open-new-tab-${block.id}`} className="ml-2 text-sm text-foreground">
          Open in new tab
        </label>
      </div>
    </div>
  );
}
