'use client';

import { HeadingBlock } from '@/types/blocks';

interface HeadingBlockEditProps {
  block: HeadingBlock;
  onChange: (block: HeadingBlock) => void;
}

export function HeadingBlockEdit({ block, onChange }: HeadingBlockEditProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Heading Text
        </label>
        <input
          type="text"
          value={block.content}
          onChange={(e) => onChange({ ...block, content: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          placeholder="Enter heading text..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Level
          </label>
          <select
            value={block.level}
            onChange={(e) => onChange({ ...block, level: parseInt(e.target.value) as HeadingBlock['level'] })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          >
            <option value="1">H1</option>
            <option value="2">H2</option>
            <option value="3">H3</option>
            <option value="4">H4</option>
            <option value="5">H5</option>
            <option value="6">H6</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Alignment
          </label>
          <select
            value={block.alignment || 'left'}
            onChange={(e) => onChange({ ...block, alignment: e.target.value as HeadingBlock['alignment'] })}
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
