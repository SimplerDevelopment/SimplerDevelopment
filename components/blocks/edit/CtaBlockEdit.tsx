'use client';

import { CtaBlock } from '@/types/blocks';

interface CtaBlockEditProps {
  block: CtaBlock;
  onChange: (block: CtaBlock) => void;
}

export function CtaBlockEdit({ block, onChange }: CtaBlockEditProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Title *
        </label>
        <input
          type="text"
          value={block.title}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          placeholder="Ready to get started?"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Description
        </label>
        <textarea
          value={block.description || ''}
          onChange={(e) => onChange({ ...block, description: e.target.value })}
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          placeholder="Add a compelling description..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Primary Button Text *
          </label>
          <input
            type="text"
            value={block.primaryButtonText}
            onChange={(e) => onChange({ ...block, primaryButtonText: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
            placeholder="Get Started"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Primary Button URL *
          </label>
          <input
            type="text"
            value={block.primaryButtonUrl}
            onChange={(e) => onChange({ ...block, primaryButtonUrl: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
            placeholder="/contact"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Secondary Button Text
          </label>
          <input
            type="text"
            value={block.secondaryButtonText || ''}
            onChange={(e) => onChange({ ...block, secondaryButtonText: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
            placeholder="Learn More"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Secondary Button URL
          </label>
          <input
            type="text"
            value={block.secondaryButtonUrl || ''}
            onChange={(e) => onChange({ ...block, secondaryButtonUrl: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
            placeholder="/about"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Background Style
        </label>
        <select
          value={block.backgroundStyle || 'gradient'}
          onChange={(e) => onChange({ ...block, backgroundStyle: e.target.value as CtaBlock['backgroundStyle'] })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
        >
          <option value="gradient">Gradient</option>
          <option value="solid">Solid</option>
          <option value="none">None</option>
        </select>
      </div>
    </div>
  );
}
