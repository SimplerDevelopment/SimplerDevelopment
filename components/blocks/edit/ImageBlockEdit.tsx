'use client';

import { ImageBlock } from '@/types/blocks';
import MediaPicker from '@/components/admin/MediaPicker';

interface ImageBlockEditProps {
  block: ImageBlock;
  onChange: (block: ImageBlock) => void;
}

export function ImageBlockEdit({ block, onChange }: ImageBlockEditProps) {
  return (
    <div className="space-y-3">
      <MediaPicker
        value={block.url}
        onChange={(url) => onChange({ ...block, url })}
        label="Image"
        required
      />

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Alt Text
        </label>
        <input
          type="text"
          value={block.alt}
          onChange={(e) => onChange({ ...block, alt: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          placeholder="Describe the image..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Caption (optional)
        </label>
        <input
          type="text"
          value={block.caption || ''}
          onChange={(e) => onChange({ ...block, caption: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          placeholder="Image caption..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Width
          </label>
          <select
            value={block.width || 'full'}
            onChange={(e) => onChange({ ...block, width: e.target.value as ImageBlock['width'] })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
            <option value="full">Full Width</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Alignment
          </label>
          <select
            value={block.alignment || 'center'}
            onChange={(e) => onChange({ ...block, alignment: e.target.value as ImageBlock['alignment'] })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>
    </div>
  );
}
