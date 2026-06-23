'use client';

import { HeroBlock } from '@/types/blocks';
import MediaPicker from '@/components/admin/MediaPicker';

interface HeroBlockEditProps {
  block: HeroBlock;
  onChange: (block: HeroBlock) => void;
}

export function HeroBlockEdit({ block, onChange }: HeroBlockEditProps) {
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
          placeholder="Hero title..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Subtitle
        </label>
        <input
          type="text"
          value={block.subtitle || ''}
          onChange={(e) => onChange({ ...block, subtitle: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          placeholder="Subtitle..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Description
        </label>
        <textarea
          value={block.description || ''}
          onChange={(e) => onChange({ ...block, description: e.target.value })}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          placeholder="Hero description..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Primary CTA Text
          </label>
          <input
            type="text"
            value={block.ctaText || ''}
            onChange={(e) => onChange({ ...block, ctaText: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
            placeholder="Get Started"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Primary CTA Link
          </label>
          <input
            type="text"
            value={block.ctaLink || ''}
            onChange={(e) => onChange({ ...block, ctaLink: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
            placeholder="/contact"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Secondary CTA Text
          </label>
          <input
            type="text"
            value={block.secondaryCtaText || ''}
            onChange={(e) => onChange({ ...block, secondaryCtaText: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
            placeholder="Learn More"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Secondary CTA Link
          </label>
          <input
            type="text"
            value={block.secondaryCtaLink || ''}
            onChange={(e) => onChange({ ...block, secondaryCtaLink: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
            placeholder="/about"
          />
        </div>
      </div>

      <MediaPicker
        value={block.backgroundImage || ''}
        onChange={(url) => onChange({ ...block, backgroundImage: url })}
        label="Background Image (optional)"
      />
    </div>
  );
}
